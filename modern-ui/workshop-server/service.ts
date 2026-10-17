import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ACHIEVEMENTS, addToBag, newProfile, takeFromBag, type WorkshopProfile } from '../src/lib/workshop-profile'
import { ITEM_BY_ID, ITEMS, RARITIES } from '../src/lib/workshop-items'
import { canEnter, canModerate, eventActive, isCrew, mergeBag, parseCloudProfile, parseLiveEvent, record, type EventView, type Identity, type LiveEvent, type RoomId } from '../src/lib/workshop-cloud-model'
import { sanitizeWorkshopName } from '../src/lib/workshop-protocol'
import { isHandle, normalizeHandle } from '../src/lib/workshop-social'
import type { Database } from './database'
import { sendVerificationEmail, type VerificationSender } from './email'

const derive = promisify(scrypt)
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const HANDLE_HINT = 'Choose a username: 3–40 characters, start with a letter, use only letters, numbers, and underscores.'
export class RequestError extends Error { constructor(message: string, public status = 400) { super(message) } }
export class WorkshopService {
  constructor(public db: Database, private deliverVerification: VerificationSender = sendVerificationEmail) {}
  async handleAvailable(raw: unknown, exceptEmail = '') {
    const handle = normalizeHandle(typeof raw === 'string' ? raw : record(raw) ? raw.handle : null)
    if (!handle) return { handle: null, available: false, reason: HANDLE_HINT }
    const email = typeof exceptEmail === 'string' ? exceptEmail.trim().toLowerCase() : ''
    const { rows } = await this.db.query(
      `SELECT 1 FROM users WHERE handle=$1
       UNION ALL
       SELECT 1 FROM signup_verifications WHERE handle=$1 AND expires_at>now() AND ($2='' OR email<>$2)
       LIMIT 1`,
      [handle, email],
    )
    return { handle, available: rows.length === 0, reason: rows.length ? 'That username is taken. Try another.' : null }
  }
  async beginSignup(raw: Record<string, unknown>, email: string) {
    if (!isCrew(raw.crew)) throw new RequestError('Choose your crew during signup')
    const handle = normalizeHandle(raw.handle)
    if (!handle) throw new RequestError(HANDLE_HINT)
    const availability = await this.handleAvailable(handle, email)
    if (!availability.available) throw new RequestError(availability.reason ?? 'That username is taken. Try another.', 409)
    const { rows: existing } = await this.db.query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.length) throw new RequestError('An account already uses this email. Sign in instead.', 409)
    const salt = randomBytes(16).toString('hex')
    const key = await derive(raw.password as string, salt, 64) as Buffer
    const id = randomUUID(), code = String(randomInt(0,100_000_000)).padStart(8,'0')
    await this.db.query("DELETE FROM signup_verifications WHERE expires_at<now()-interval '1 day'")
    const { rows: accepted } = await this.db.query(`INSERT INTO signup_verifications(id,email,password_hash,display_name,crew,handle,code_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes') ON CONFLICT(email) DO UPDATE SET
        id=excluded.id,password_hash=excluded.password_hash,display_name=excluded.display_name,crew=excluded.crew,handle=excluded.handle,
        code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=now(),
        sent_count=CASE WHEN signup_verifications.created_at<now()-interval '1 hour' THEN 1 ELSE signup_verifications.sent_count+1 END,
        created_at=CASE WHEN signup_verifications.created_at<now()-interval '1 hour' THEN now() ELSE signup_verifications.created_at END
        WHERE signup_verifications.sent_at<=now()-interval '1 minute'
        AND (signup_verifications.created_at<now()-interval '1 hour' OR signup_verifications.sent_count<5)
        RETURNING id`,
      [id,email,`${salt}:${key.toString('hex')}`,sanitizeWorkshopName(raw.name),raw.crew,handle,hashToken(id+code)])
    if (!accepted.length) throw new RequestError('Please wait before requesting another code. Up to five codes per hour.',429)
    try { await this.deliverVerification({ email,code }) }
    catch (error) {
      await this.db.query('DELETE FROM signup_verifications WHERE id=$1',[id])
      const detail = error instanceof Error && /Brevo blocked this server IP/i.test(error.message)
        ? ' Verification email blocked: add this server’s public IP in Brevo → Security → Authorised IPs, then try again.'
        : ' Please try later or continue as guest.'
      console.error('[workshop email]', error instanceof Error ? error.message : error)
      throw new RequestError(`Verification email could not be sent.${detail}`,503)
    }
    return { verificationRequired: true, requestId: id, email, handle, expiresIn: 600, resendAfter: 60 }
  }
  async verifySignup(raw: unknown) {
    if (!record(raw) || typeof raw.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(raw.requestId)
      || typeof raw.code!=='string' || !/^\d{8}$/.test(raw.code)) throw new RequestError('Enter the eight-digit code from your email')
    const {requestId,code}=raw
    const result = await this.db.transaction(async db => {
      const { rows:[pending] }=await db.query('SELECT * FROM signup_verifications WHERE id=$1 FOR UPDATE',[requestId])
      if (!pending || new Date(pending.expires_at).getTime()<=Date.now()) return { error:'This code expired. Request a new code.' }
      if (pending.attempts>=5) return { error:'Too many incorrect codes. Request a new code.' }
      if (!timingSafeEqual(Buffer.from(pending.code_hash,'hex'),Buffer.from(hashToken(requestId+code),'hex'))) {
        await db.query('UPDATE signup_verifications SET attempts=attempts+1 WHERE id=$1',[pending.id])
        return { error:'That code is incorrect. Check your email and try again.' }
      }
      const handle = normalizeHandle(pending.handle)
      if (!handle || !isHandle(handle)) return { error:'Choose a username and request a new code.' }
      const { rows: taken } = await db.query('SELECT 1 FROM users WHERE handle=$1 LIMIT 1', [handle])
      if (taken.length) return { error:'That username was just taken. Pick another and request a new code.' }
      const userId=randomUUID()
      try {
        await db.query('INSERT INTO users(id,email,password_hash,display_name,crew,email_verified_at,handle) VALUES($1,$2,$3,$4,$5,now(),$6)',
          [userId,pending.email,pending.password_hash,pending.display_name,pending.crew,handle])
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
        if (code === '23505') return { error:'That username was just taken. Pick another and request a new code.' }
        throw error
      }
      await db.query('INSERT INTO profiles(user_id,data) VALUES($1,$2)',[userId,JSON.stringify(newProfile())])
      await db.query('DELETE FROM signup_verifications WHERE id=$1',[pending.id])
      return { userId }
    })
    if (result.error) throw new RequestError(result.error)
    return this.session(result.userId!)
  }
  private async session(userId: string) {
    const token = randomBytes(32).toString('hex')
    await this.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [hashToken(token), userId])
    return { token, identity: await this.identity(userId) }
  }
  async identity(userId: string): Promise<Identity> {
    const { rows: [row] } = await this.db.query('SELECT u.id,u.display_name,u.handle,u.crew,u.is_admin,k.crew AS king,p.titles FROM users u JOIN profiles p ON p.user_id=u.id LEFT JOIN kings k ON k.user_id=u.id WHERE u.id=$1', [userId])
    if (!row) throw new RequestError('Account unavailable', 401)
    return { userId: row.id, name: row.display_name, handle: row.handle, crew: row.crew, king: row.king ?? null, titles: row.titles, isAdmin: row.is_admin === true }
  }
  private async requireAdmin(userId: string) {
    const identity = await this.identity(userId)
    if (!identity.isAdmin) throw new RequestError('Administrator access required', 403)
    return identity
  }
  async adminUsers(userId: string, search = '') {
    await this.requireAdmin(userId)
    const q = `%${search.trim().slice(0,80)}%`
    const { rows } = await this.db.query(`SELECT u.id,u.handle,u.email,u.display_name,u.crew,u.is_admin,u.created_at,p.revision,p.data,p.titles
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE ($1='' OR u.handle ILIKE $2 OR u.email ILIKE $2 OR u.display_name ILIKE $2)
      ORDER BY u.created_at DESC LIMIT 100`, [search.trim(), q])
    return rows
  }
  async adminBag(userId: string, target: string, action: 'add'|'remove', item: string, amount = 1) {
    await this.requireAdmin(userId)
    if (!/^[a-z0-9_-]{1,80}$/.test(item) || !Number.isInteger(amount) || amount < 1 || amount > 1000) throw new RequestError('Invalid item or amount')
    await this.db.transaction(async db => {
      const { rows: [row] } = await db.query('SELECT p.user_id,p.data,p.revision,p.admin_removed FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.id=$1 OR u.handle=$1 FOR UPDATE', [target])
      if (!row) throw new RequestError('User not found', 404)
      const profile = parseCloudProfile(row.data)
      if (!ITEM_BY_ID.has(item)) throw new RequestError('Unknown Workshop item')
      const removed: string[]=[]
      if (action === 'add') for (let i=0;i<amount;i++) addToBag(profile,item,'admin',{force:true})
      else profile.bag.filter(entry => entry.item === item).slice(0,amount).forEach(entry => { if(takeFromBag(profile,entry.uid))removed.push(entry.uid) })
      const tombstones=[...(Array.isArray(row.admin_removed)?row.admin_removed.filter((uid:unknown)=>typeof uid==='string'):[]),...removed].slice(-2000)
      await db.query('UPDATE profiles SET data=$2,admin_removed=$3,revision=revision+1 WHERE user_id=$1',[row.user_id,JSON.stringify(profile),JSON.stringify(tombstones)])
    })
    return this.adminUsers(userId, target)
  }
  private eventFromRow(row: Record<string, unknown>): LiveEvent | null {
    return parseLiveEvent({ ...row, startAt: new Date(row.start_at as string | number | Date).toISOString(),
      endAt: new Date(row.end_at as string | number | Date).toISOString(), optIn: row.opt_in })
  }
  async adminEvents(userId: string) {
    await this.requireAdmin(userId)
    const { rows } = await this.db.query('SELECT * FROM live_events ORDER BY start_at DESC,id')
    return rows.flatMap(row => { const event=this.eventFromRow(row); return event ? [event] : [] })
  }
  async adminSaveEvent(userId: string, raw: unknown) {
    await this.requireAdmin(userId)
    if (!record(raw)) throw new RequestError('Invalid event')
    const event = parseLiveEvent(raw)
    if (!event || event.title.trim().length < 2 || Date.parse(event.endAt) <= Date.parse(event.startAt)) throw new RequestError('Complete every required event field and choose a valid date range')
    if (event.kind === 'announcement') {
      event.metric='sends'; event.target=1; event.optIn=false; delete event.pairing; event.reward=null
    }
    if (event.pairing && (!event.optIn || event.metric !== 'given')) throw new RequestError('Same-crew pairing requires an opt-in event using the Given metric')
    if (event.reward?.item && !ITEM_BY_ID.has(event.reward.item)) throw new RequestError('Unknown reward item')
    const validTitles = new Set([...ACHIEVEMENTS.map(a=>a.title),...ITEMS.flatMap(item=>item.titleText?[item.titleText]:[])])
    if (event.reward?.title && !validTitles.has(event.reward.title)) throw new RequestError('Unknown reward title')
    await this.db.transaction(async db => {
      await db.query(`INSERT INTO live_events(id,title,body,start_at,end_at,enabled,kind,metric,target,reward,crews,opt_in,pairing)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,start_at=excluded.start_at,end_at=excluded.end_at,
        enabled=excluded.enabled,kind=excluded.kind,metric=excluded.metric,target=excluded.target,reward=excluded.reward,
        crews=excluded.crews,opt_in=excluded.opt_in,pairing=excluded.pairing`,
      [event.id,event.title.trim(),event.body.trim(),event.startAt,event.endAt,event.enabled,event.kind,event.metric,event.target,
        event.reward ? JSON.stringify(event.reward) : null,event.crews ? JSON.stringify(event.crews) : null,event.optIn,event.pairing ?? null])
      if (raw.resetProgress === true) await db.query('DELETE FROM event_progress WHERE event_id=$1',[event.id])
    })
    return this.adminEvents(userId)
  }
  async adminDeleteEvent(userId: string, eventId: string) {
    await this.requireAdmin(userId)
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(eventId)) throw new RequestError('Invalid event')
    const { rows } = await this.db.query('DELETE FROM live_events WHERE id=$1 RETURNING id',[eventId])
    if (!rows.length) throw new RequestError('Event not found',404)
    return this.adminEvents(userId)
  }
  async authenticate(token: string): Promise<Identity> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new RequestError('Sign in again', 401)
    const { rows: [row] } = await this.db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()', [hashToken(token)])
    if (!row) throw new RequestError('Sign in again', 401)
    return this.identity(row.user_id)
  }
  async auth(raw: unknown, signup: boolean) {
    if (!record(raw) || typeof raw.email !== 'string' || typeof raw.password !== 'string'
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email) || raw.email.length > 254
      || raw.password.length < 10 || raw.password.length > 256) throw new RequestError('Use a valid email and a password of 10–256 characters')
    const email = raw.email.trim().toLowerCase()
    let userId: string
    if (signup) {
      return this.beginSignup(raw,email)
    } else {
      const { rows: [row] } = await this.db.query('SELECT id,password_hash FROM users WHERE email=$1', [email])
      // Derive even for an unknown address to avoid the obvious timing oracle.
      const [salt, expected] = (row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':')
      const key = await derive(raw.password, salt, 64) as Buffer
      if (!timingSafeEqual(key, Buffer.from(expected, 'hex')) || !row) throw new RequestError('Email or password is incorrect', 401)
      userId = row.id
    }
    return this.session(userId)
  }
  async logout(token: string) { await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]) }
  async profile(userId: string) {
    const { rows: [row] } = await this.db.query('SELECT data,revision,titles,admin_removed FROM profiles WHERE user_id=$1', [userId])
    if (!row) throw new RequestError('Account unavailable', 401)
    return { profile: row.data as WorkshopProfile, revision: row.revision as number, identity: await this.identity(userId),
      removedBagUids: Array.isArray(row.admin_removed) ? row.admin_removed.filter((uid:unknown)=>typeof uid==='string').slice(-2000) : [] }
  }
  async sync(userId: string, raw: unknown) {
    if (!record(raw) || !record(raw.profile)) throw new RequestError('Invalid profile')
    let incoming = parseCloudProfile(raw.profile)
    await this.db.transaction(async db => {
      const { rows: [row] } = await db.query('SELECT data,revision,merged_local,admin_removed FROM profiles WHERE user_id=$1 FOR UPDATE', [userId])
      if (!row) throw new RequestError('Account unavailable', 401)
      const previous = parseCloudProfile(row.data)
      const removed = new Set<string>(Array.isArray(row.admin_removed) ? row.admin_removed.filter((uid:unknown):uid is string=>typeof uid==='string') : [])
      incoming = parseCloudProfile({...incoming,bag:incoming.bag.filter(entry=>!removed.has(entry.uid))})
      if (raw.firstLogin === true) {
        if (!row.merged_local) {
          previous.bag = mergeBag(previous.bag, incoming.bag)
          previous.discovered = [...new Set([...previous.discovered, ...incoming.discovered])]
          previous.achievements = [...new Set([...previous.achievements, ...incoming.achievements])]
          for (const metric of ['sends','handheld','opened','trades','given','received','bells','chats','hits'] as const) previous.stats[metric] = Math.max(previous.stats[metric], incoming.stats[metric])
          for (const rarity of RARITIES) previous.stats.found[rarity] = Math.max(previous.stats.found[rarity],incoming.stats.found[rarity])
          previous.equipped = incoming.equipped
          previous.daily = incoming.daily
          previous.title = incoming.title
          await db.query('UPDATE profiles SET data=$2,merged_local=true,revision=revision+1 WHERE user_id=$1', [userId, JSON.stringify(previous)])
        }
        return
      }
      if (raw.revision !== row.revision) throw new RequestError('Profile changed on another device; reload before saving', 409)
      // Reconcile only retained UIDs so consuming, trading and dropping can remove items.
      incoming.bag = mergeBag(previous.bag.filter(e => incoming.bag.some(i => i.uid === e.uid)), incoming.bag)
      incoming.discovered = [...new Set([...previous.discovered, ...incoming.discovered])]
      incoming.achievements = [...new Set([...previous.achievements, ...incoming.achievements])]
      // Daily gift and stats never move backwards on a second device.
      if ((previous.daily.last ?? '') > (incoming.daily.last ?? '')) incoming.daily = previous.daily
      for (const metric of ['sends','handheld','opened','trades','given','received','bells','chats','hits'] as const) incoming.stats[metric] = Math.max(previous.stats[metric], incoming.stats[metric])
      for (const rarity of RARITIES) incoming.stats.found[rarity] = Math.max(previous.stats.found[rarity],incoming.stats.found[rarity])
      if (typeof raw.name === 'string') await db.query('UPDATE users SET display_name=$2 WHERE id=$1', [userId, sanitizeWorkshopName(raw.name)])
      await db.query('UPDATE profiles SET data=$2,revision=revision+1 WHERE user_id=$1', [userId, JSON.stringify(incoming)])
    })
    await this.events(userId)
    return this.profile(userId)
  }
  async allowed(identity: Identity, room: RoomId, subject: string): Promise<boolean> {
    if (room === 'anexya-general') return true
    if (!identity.userId) return false
    const { rows: [row] } = await this.db.query('SELECT allowed_until,kicked_at FROM room_acl WHERE room_id=$1 AND subject_id=$2', [room, subject])
    if (row?.kicked_at && !row.allowed_until && new Date(row.kicked_at).toISOString().slice(0,10) === new Date().toISOString().slice(0,10)) return false
    if (canEnter(identity, room)) return true
    return canEnter(identity, room, row?.allowed_until ? new Date(row.allowed_until).getTime() : 0)
  }
  async moderate(identity: Identity, room: RoomId, subject: string, action: 'allow' | 'deny' | 'kick') {
    const fresh = identity.userId ? await this.identity(identity.userId) : identity
    if (!canModerate(fresh, room)) throw new RequestError('Only this room’s King can moderate', 403)
    if (!subject.startsWith('user:')) return
    await this.db.transaction(async db => {
      await db.query(`INSERT INTO room_acl(room_id,subject_id,allowed_until,kicked_at) VALUES($1,$2,
        CASE WHEN $3='allow' THEN date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 day' ELSE NULL END,
        CASE WHEN $3='kick' THEN now() ELSE NULL END) ON CONFLICT(room_id,subject_id)
        DO UPDATE SET allowed_until=excluded.allowed_until,kicked_at=CASE WHEN $3='deny' THEN room_acl.kicked_at ELSE excluded.kicked_at END`, [room, subject, action])
      await db.query('UPDATE knocks SET status=$3 WHERE room_id=$1 AND subject_id=$2 AND status=\'pending\'', [room, subject.slice(5), action === 'allow' ? 'allowed' : 'denied'])
    })
  }
  async definitions(): Promise<LiveEvent[]> {
    const { rows } = await this.db.query('SELECT * FROM live_events WHERE enabled=true AND start_at<=now() AND end_at>now() ORDER BY start_at,id')
    return rows.flatMap(r => {
      const e = parseLiveEvent({ ...r, startAt: new Date(r.start_at).toISOString(), endAt: new Date(r.end_at).toISOString(), optIn: r.opt_in })
      return e ? [e] : []
    })
  }
  async events(userId?: string): Promise<EventView[]> {
    const identity = userId ? await this.identity(userId) : null
    const definitions = await this.definitions()
    if (!userId || !identity) return definitions.map(e => ({ ...e, value: 0, optedIn: false, recipient: null }))
    return this.db.transaction(async db => {
      const { rows: [row] } = await db.query('SELECT data,titles FROM profiles WHERE user_id=$1 FOR UPDATE', [userId])
      const p = parseCloudProfile(row.data)
      let changed = false
      const titles: string[] = row.titles
      const out: EventView[] = []
      for (const event of definitions.filter(e => eventActive(e, identity.crew))) {
        const metric = p.stats[event.metric]
        await db.query('INSERT INTO event_progress(event_id,user_id,baseline) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [event.id, userId, metric])
        const { rows: [progress] } = await db.query('SELECT * FROM event_progress WHERE event_id=$1 AND user_id=$2', [event.id, userId])
        const value = event.optIn && !progress.opted_in ? 0 : Math.max(progress.value, metric - progress.baseline)
        await db.query('UPDATE event_progress SET value=$3 WHERE event_id=$1 AND user_id=$2', [event.id, userId, value])
        if (event.kind !== 'announcement' && value >= event.target && !progress.rewarded && (!event.optIn || progress.opted_in)) {
          if (event.reward?.item) addToBag(p, event.reward.item, 'milestone', { force: true })
          if (event.reward?.title && !titles.includes(event.reward.title)) titles.push(event.reward.title)
          await db.query('UPDATE event_progress SET rewarded=true WHERE event_id=$1 AND user_id=$2', [event.id, userId])
          changed = true
        }
        let recipient: string | null = null
        if (progress.recipient_id) {
          const { rows: [recipientRow] } = await db.query('SELECT display_name FROM users WHERE id=$1', [progress.recipient_id])
          recipient = recipientRow?.display_name ?? null
        }
        out.push({ ...event, value, optedIn: progress.opted_in, recipient,
          ...(event.pairing && progress.opted_in ? { pairingStatus: recipient ? `Give to ${recipient}` : 'Unmatched: fewer than two available crew participants. Waiting for another join.' } : {}) })
      }
      if (changed) await db.query('UPDATE profiles SET data=$2,titles=$3,revision=revision+1 WHERE user_id=$1', [userId, JSON.stringify(p), JSON.stringify(titles)])
      return out
    })
  }
  async joinEvent(userId: string, eventId: string) {
    const identity = await this.identity(userId)
    await this.events(userId)
    await this.db.transaction(async db => {
      // Serialize joins per event. Owners can close an event without racing a late join.
      const { rows: [row] } = await db.query('SELECT * FROM live_events WHERE id=$1 FOR UPDATE', [eventId])
      const event = row && parseLiveEvent({ ...row, startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString(), optIn: row.opt_in })
      if (!event || !eventActive(event, identity.crew) || !event.optIn) throw new RequestError('This event is closed')
      const { rows: [profile] } = await db.query('SELECT data FROM profiles WHERE user_id=$1', [userId])
      const baseline = parseCloudProfile(profile.data).stats[event.metric]
      await db.query('UPDATE event_progress SET opted_in=true,baseline=CASE WHEN opted_in THEN baseline ELSE $3 END WHERE event_id=$1 AND user_id=$2', [eventId, userId, baseline])
      if (event.pairing === 'same-crew') {
        const { rows } = await db.query(`SELECT ep.user_id FROM event_progress ep JOIN users u ON u.id=ep.user_id
          WHERE ep.event_id=$1 AND ep.opted_in=true AND ep.recipient_id IS NULL AND u.crew=$2 ORDER BY u.created_at,u.id`, [eventId, identity.crew])
        // Pair waiting participants without changing an assignment already shown to a player.
        for (let i = 0; i + 1 < rows.length; i += 2) {
          await db.query('UPDATE event_progress SET recipient_id=$3 WHERE event_id=$1 AND user_id=$2', [eventId, rows[i].user_id, rows[i+1].user_id])
          await db.query('UPDATE event_progress SET recipient_id=$3 WHERE event_id=$1 AND user_id=$2', [eventId, rows[i+1].user_id, rows[i].user_id])
        }
      }
    })
    return this.events(userId)
  }
}
