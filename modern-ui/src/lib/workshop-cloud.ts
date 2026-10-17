import { parseClientCommand, parseServerNotice, parseIdentity, record, parseLiveEvent, type ClientCommand, type EventView, type Identity, type LiveEvent, type ServerNotice } from './workshop-cloud-model'
import { PROFILE_KEY, guestAfterAccountImport, loadProfile, newProfile, saveProfile, type WorkshopProfile } from './workshop-profile'
import { mergeBag, parseCloudProfile } from './workshop-cloud-model'
import { RARITIES } from './workshop-items'
import { parseFriends, parsePrivateMessages, type FriendAction } from './workshop-social'

const SESSION_KEY = 'workshop-account-session'
const GUEST_KEY = 'workshop-guest-profile-v1'
export type Account = { token: string; identity: Identity; revision: number }
export type VerificationChallenge = { requestId: string; email: string; resendAfter: number }
export type WorkshopAdminUser = {
  id: string; handle: string; email: string; display_name: string; crew: string; is_admin: boolean
  created_at: string; revision: number; data: unknown; titles: string[]
}
/** Thrown when the server rejects a stored account token (deleted user, expired session). */
export class SessionLostError extends Error {
  constructor(message = 'Sign in again') {
    super(message)
    this.name = 'SessionLostError'
  }
}
export function storedAccount(): Account | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
    if (!record(raw) || typeof raw.token !== 'string' || !/^[a-f0-9]{64}$/.test(raw.token) || !Number.isInteger(raw.revision)) return null
    const identity = parseIdentity(raw.identity)
    return identity?.userId ? { token: raw.token, identity, revision: Number(raw.revision) } : null
  } catch { return null }
}
export function cacheAccount(account: Account) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(account))
  localStorage.setItem('workshop-active-account', account.identity.userId!)
}
/** Drop the local sign-in and restore the guest bag. Returns false if already a guest. */
export function clearLocalSession(): boolean {
  const active = localStorage.getItem('workshop-active-account')
  const had = !!sessionStorage.getItem(SESSION_KEY) || !!active
  if (!had) return false
  // Park the account bag under its user id so it cannot seed a brand-new signup.
  const profile = localStorage.getItem(PROFILE_KEY)
  if (active && profile) localStorage.setItem(`workshop-account-cache:${active}`, profile)
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('workshop-active-account')
  const guest = localStorage.getItem(GUEST_KEY)
  if (guest) localStorage.setItem(PROFILE_KEY, guest)
  else localStorage.removeItem(PROFILE_KEY)
  return true
}
/** A closed desktop session returns to its guest profile, retaining account data in its own cache. */
export function restoreGuestSession() {
  if (!storedAccount() && localStorage.getItem('workshop-active-account')) {
    const active = localStorage.getItem('workshop-active-account')!
    const accountProfile = localStorage.getItem(PROFILE_KEY)
    if (accountProfile) localStorage.setItem(`workshop-account-cache:${active}`, accountProfile)
    const guest = localStorage.getItem(GUEST_KEY)
    if (guest) localStorage.setItem(PROFILE_KEY, guest)
    else localStorage.removeItem(PROFILE_KEY)
    localStorage.removeItem('workshop-active-account')
  }
}
function isWorkshopLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/** Home-lab LAN (RFC1918 / link-local). Cleartext HTTP is allowed here; the public internet still needs HTTPS. */
function isWorkshopPrivateLan(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

export async function workshopEndpoint(): Promise<string> {
  const configured = await window.electronAPI?.workshopConfig?.()
  const endpoint = localStorage.getItem('workshop-cloud-url') || configured?.url || ''
  if (!endpoint) return ''
  const url = new URL(endpoint)
  const httpOk = url.protocol === 'http:' && (isWorkshopLoopback(url.hostname) || isWorkshopPrivateLan(url.hostname))
  if (url.protocol !== 'https:' && !httpOk) throw new Error('Workshop requires HTTPS outside localhost')
  return url.href.replace(/\/$/, '')
}

/** Funnel staging (:10000) or CT 251 LAN — not production (:8443 / .250) or local loopback. */
export function isWorkshopStaging(endpoint: string): boolean {
  if (!endpoint) return false
  try {
    const url = new URL(endpoint)
    // Funnel only exposes 443/8443/10000; staging uses 10000 (legacy 8444 kept for old clients).
    return url.port === '10000' || url.port === '8444' || url.hostname === '192.168.10.251'
  } catch {
    return false
  }
}
export class CloudApi {
  constructor(public endpoint: string) {}
  async request(path: string, body?: unknown, account: Account | null = storedAccount()): Promise<unknown> {
    if (!this.endpoint) throw new Error('Workshop server is not configured. General and Home still work offline.')
    const res = await fetch(`${this.endpoint}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(account ? { Authorization: `Bearer ${account.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(path === '/auth/signup' ? 20000 : 10000),
    })
    const data: unknown = await res.json()
    if (!res.ok) {
      const message = record(data) && typeof data.error === 'string' ? data.error : 'Workshop service unavailable'
      if (res.status === 401 && account) throw new SessionLostError(message)
      throw new Error(message)
    }
    return data
  }
  async login(signup: boolean, fields: { email: string; password: string; crew: string; name: string; handle?: string }, local: WorkshopProfile) {
    const auth = await this.request(signup ? '/auth/signup' : '/auth/login', fields, null)
    if (record(auth) && auth.verificationRequired === true && typeof auth.requestId === 'string' && typeof auth.email === 'string') {
      return { requestId: auth.requestId, email: auth.email, resendAfter: Date.now() + 60000 } satisfies VerificationChallenge
    }
    await this.completeLogin(auth, local, { consumeGuestBag: signup })
    return null
  }
  async handleAvailable(handle: string, email = '') {
    const q = new URLSearchParams({ handle })
    if (email.trim()) q.set('email', email.trim())
    const raw = await this.request(`/auth/handle-available?${q}`, undefined, null)
    if (!record(raw) || typeof raw.available !== 'boolean') throw new Error('Could not check username')
    return {
      handle: typeof raw.handle === 'string' ? raw.handle : null,
      available: raw.available,
      reason: typeof raw.reason === 'string' ? raw.reason : null,
    }
  }
  async verifySignup(requestId: string, code: string, local: WorkshopProfile) {
    await this.completeLogin(await this.request('/auth/verify', { requestId, code }, null), local, { consumeGuestBag: true })
  }
  /** Bag offered on first-login: guest progress only — never a leftover signed-in account bag. */
  private firstLoginSeed(local: WorkshopProfile): WorkshopProfile {
    const previous = storedAccount()
    if (previous) {
      // Still signed in (or stale session): do not move that account's bag onto a new user.
      try {
        const raw = localStorage.getItem(GUEST_KEY)
        if (raw) {
          const guest = parseCloudProfile(JSON.parse(raw) as unknown)
          guest.device = local.device
          return guest
        }
      } catch { /* fall through */ }
      const empty = newProfile()
      empty.device = local.device
      return empty
    }
    return local
  }
  private async completeLogin(auth: unknown, local: WorkshopProfile, opts: { consumeGuestBag?: boolean } = {}) {
    if (!record(auth) || typeof auth.token !== 'string') throw new Error('Invalid account response')
    const identity = parseIdentity(auth.identity)
    if (!identity?.userId) throw new Error('Invalid account identity')
    const previous = storedAccount()
    const fromGuest = !previous
    const seed = this.firstLoginSeed(local)
    const account: Account = { token: auth.token, identity, revision: 0 }
    const merged = await this.request('/profile', { firstLogin: true, profile: seed }, account)
    let snapshot = parseSnapshot(merged)
    const cached = localStorage.getItem(`workshop-account-cache:${identity.userId}`)
    if (cached) {
      // Returning accounts reconcile their own offline cache, never the current guest bag.
      let raw: unknown = null
      try { raw = JSON.parse(cached) } catch { /* discard corrupt cache */ }
      if (record(raw)) {
        const offline = parseCloudProfile(raw)
        const profile = snapshot.profile
        const removed=new Set(snapshot.removedBagUids)
        profile.bag = mergeBag(profile.bag, offline.bag.filter(entry=>!removed.has(entry.uid)))
        profile.discovered = [...new Set([...profile.discovered,...offline.discovered])]
        profile.achievements = [...new Set([...profile.achievements,...offline.achievements])]
        for (const metric of ['sends','handheld','opened','trades','given','received','bells','chats','hits'] as const) profile.stats[metric] = Math.max(profile.stats[metric],offline.stats[metric])
        for (const rarity of RARITIES) profile.stats.found[rarity] = Math.max(profile.stats.found[rarity],offline.stats.found[rarity])
        if ((offline.daily.last ?? '') > (profile.daily.last ?? '')) profile.daily = offline.daily
        snapshot = parseSnapshot(await this.request('/profile', { profile, revision: snapshot.revision },account))
      }
    }
    // Keep guest progress for later, but never re-gift bag UIDs offered/imported on signup.
    if (fromGuest || opts.consumeGuestBag) {
      const guestBase = fromGuest ? local : seed
      localStorage.setItem(
        GUEST_KEY,
        JSON.stringify(guestAfterAccountImport(guestBase, snapshot.profile, opts.consumeGuestBag ? seed : undefined)),
      )
    }
    account.revision = snapshot.revision
    account.identity = snapshot.identity
    cacheAccount(account)
    const profile = snapshot.profile; profile.device = local.device
    saveProfile(profile)
    localStorage.setItem(`workshop-account-cache:${identity.userId}`, JSON.stringify(profile))
    return account
  }
  async logout(profile: WorkshopProfile) {
    const account = storedAccount()
    if (account) {
      localStorage.setItem(`workshop-account-cache:${account.identity.userId}`, JSON.stringify(profile))
      await this.request('/auth/logout', {}, account).catch(() => {})
    }
    clearLocalSession()
  }
  async events(): Promise<EventView[]> {
    const result = await this.request('/events')
    if (!Array.isArray(result)) throw new Error('Invalid event response')
    return result.flatMap(raw => {
      const event = parseLiveEvent(raw)
      if (!event || !record(raw) || typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return []
      return [{ ...event, value: Math.max(0,raw.value), optedIn: raw.optedIn === true,
        recipient: typeof raw.recipient === 'string' ? raw.recipient.slice(0,16) : null,
        ...(typeof raw.pairingStatus === 'string' ? { pairingStatus: raw.pairingStatus.slice(0,200) } : {}) }]
    })
  }
  async friends(){return parseFriends(await this.request('/friends'))}
  async friendAction(action:FriendAction,handle:string){await this.request('/friends',{action,handle})}
  async privateHistory(to:string){return parsePrivateMessages(await this.request(`/friends/messages?to=${encodeURIComponent(to)}`))}
  async privateMessage(to:string,text:string){return parsePrivateMessages([await this.request('/friends/messages',{to,text})])[0]}
  async adminUsers(search = ''): Promise<WorkshopAdminUser[]> { const data = await this.request(`/admin/users?q=${encodeURIComponent(search)}`); return Array.isArray(data) ? data as WorkshopAdminUser[] : [] }
  async adminBag(user: string, action: 'add'|'remove', item: string, amount: number): Promise<WorkshopAdminUser[]> {
    const data = await this.request('/admin/bag', { user, action, item, amount }); return Array.isArray(data) ? data as WorkshopAdminUser[] : []
  }
  async adminEvents(): Promise<LiveEvent[]> {
    const data=await this.request('/admin/events')
    return Array.isArray(data) ? data.flatMap(raw=>{const event=parseLiveEvent(raw);return event?[event]:[]}) : []
  }
  async adminSaveEvent(event: LiveEvent, resetProgress = false): Promise<LiveEvent[]> {
    const data=await this.request('/admin/events',{event:{...event,resetProgress}})
    return Array.isArray(data) ? data.flatMap(raw=>{const parsed=parseLiveEvent(raw);return parsed?[parsed]:[]}) : []
  }
  async adminDeleteEvent(id: string): Promise<LiveEvent[]> {
    const data=await this.request('/admin/events',{action:'delete',id})
    return Array.isArray(data) ? data.flatMap(raw=>{const event=parseLiveEvent(raw);return event?[event]:[]}) : []
  }
}
export function parseSnapshot(raw: unknown) {
  if (!record(raw) || !record(raw.profile) || !Number.isInteger(raw.revision)) throw new Error('Invalid profile response')
  const identity = parseIdentity(raw.identity)
  if (!identity?.userId) throw new Error('Invalid profile identity')
  const profile = loadProfile({ getItem: () => JSON.stringify(raw.profile) })
  const removedBagUids=Array.isArray(raw.removedBagUids)?raw.removedBagUids.filter((uid):uid is string=>typeof uid==='string'&&/^[a-z0-9]{6,20}$/.test(uid)).slice(-2000):[]
  return { profile, identity, revision: Number(raw.revision), removedBagUids }
}
export class CloudConnection {
  socket: WebSocket | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  constructor(
    private endpoint: string,
    private hello: Extract<ClientCommand, { op: 'hello' }>,
    private room: string,
    private onNotice: (notice: ServerNotice) => void,
    private onLink: (live: boolean) => void,
    private onAuthLost?: () => void,
  ) { this.connect() }
  private connect() {
    if (!this.endpoint || this.stopped) { this.onLink(false); return }
    const url = new URL(`${this.endpoint}/socket`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url); this.socket = socket
    const watch = (delay: number) => {
      clearTimeout(this.deadline)
      this.deadline = setTimeout(() => { this.onLink(false); socket.close() }, delay)
    }
    // A stalled TCP connection or silent upstream must still become offline solo.
    watch(10000)
    socket.onopen = () => { if (this.stopped) return; this.send(this.hello); this.send({ op: 'join', room: this.room } as ClientCommand) }
    socket.onmessage = e => {
      if (typeof e.data !== 'string' || e.data.length > 256000) return
      try { const notice = parseServerNotice(JSON.parse(e.data)); if (notice) { watch(20000); this.onLink(true); this.onNotice(notice) } } catch { /* ignore malformed packets */ }
    }
    socket.onerror = () => socket.close()
    socket.onclose = e => {
      clearTimeout(this.deadline)
      this.onLink(false)
      if (!this.stopped && (e.reason === 'Session expired' || e.reason === 'Authentication failed')) this.onAuthLost?.()
      if (!this.stopped && e.code !== 4000 && e.code !== 1008) this.timer = setTimeout(() => this.connect(), 5000)
    }
  }
  send(command: ClientCommand) {
    const parsed = parseClientCommand(command)
    if (parsed && this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 64000) this.socket.send(JSON.stringify(parsed))
  }
  close() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.deadline); this.socket?.close() }
}
