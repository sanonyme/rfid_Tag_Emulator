import { createServer, type IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { canModerate, parseClientCommand, record, type ClientCommand, type Identity, type RoomId, type ServerNotice } from '../src/lib/workshop-cloud-model'
import { type WorkshopMessage } from '../src/lib/workshop-protocol'
import { WorkshopService, RequestError } from './service'
import type { Database } from './database'
import { sendVerificationEmail, type VerificationSender } from './email'
import { WorkshopSocial } from './social'

type Client = { ws: WebSocket; identity: Identity; subject: string; id: string; token: string | null; room: RoomId | null;
  desired: RoomId | null; status: 'knock' | 'pending' | 'denied'; state: WorkshopMessage | null; seq: number; pong: boolean }
const send = (c: Client, notice: ServerNotice) => {
  if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 512000) c.ws.send(JSON.stringify(notice))
}
const pairKey = (a: string, b: string) => [a, b].sort().join(':')
export function createWorkshopServer(db: Database, origins = ['null', 'file://', 'http://localhost:5173'], deliverVerification: VerificationSender = sendVerificationEmail) {
  const service = new WorkshopService(db, deliverVerification)
  const social = new WorkshopSocial(db)
  const clients = new Set<Client>()
  const guestAllows = new Map<string, number>()
  const roomTrees = new Map<string, Record<string, number>>()
  const drops = new Map<RoomId, Map<string, { message: WorkshopMessage; at: number }>>()
  const httpRates = new Map<string, { at: number; count: number }>()
  const socialChanged=(...users:string[])=>{for(const client of clients)if(client.identity.userId&&users.includes(client.identity.userId))send(client,{op:'social'})}
  const directory = () => {
    const players = [...clients].filter(c => c.room).map(c => ({ ...c.identity, id: c.id, room: c.room!, subject: c.subject }))
    const counts: Partial<Record<RoomId, number>> = {}
    players.forEach(p => { counts[p.room] = (counts[p.room] ?? 0) + 1 })
    for (const c of clients) send(c, { op: 'directory', players, counts })
  }
  const queues = () => {
    for (const king of clients) {
      const entries = king.room && canModerate(king.identity, king.room)
        ? [...clients].filter(c => c.desired === king.room && c.status === 'pending').map(c => ({ subject: c.subject, name: c.identity.name })) : []
      send(king, { op: 'knocks', entries })
    }
  }
  const broadcast = (room: RoomId, notice: ServerNotice, except?: Client) => {
    for (const c of clients) if (c.room === room && c !== except) send(c, notice)
  }
  const leave = (c: Client) => {
    if (c.room) broadcast(c.room, { op: 'packet', message: { t: 'bye', id: c.id, seq: ++c.seq } }, c)
    if (c.room) for (const [key, drop] of drops.get(c.room) ?? []) if (drop.message.id === c.id) drops.get(c.room)?.delete(key)
    c.room = null; c.state = null
  }
  const enter = (c: Client, room: RoomId) => {
    leave(c); c.room = room; c.desired = null
    const tree = roomTrees.get(`${room}:${new Date().toISOString().slice(0,10)}`) ?? {}
    send(c, { op: 'joined', room, identity: c.identity, tree: Object.fromEntries(Object.entries(tree).sort((a,b) => b[1]-a[1]).slice(0,16)) })
    const states = [...clients].flatMap(peer => peer !== c && peer.room === room && peer.state ? [peer.state] : [])
    const floor = [...(drops.get(room)?.values() ?? [])].map(d => d.message)
    send(c, { op: 'snapshot', messages: [...states,...floor].slice(0,256) })
    directory(); queues()
  }
  async function command(c: Client, cmd: Exclude<ClientCommand, { op: 'hello' }>) {
    if (cmd.op === 'join') {
      c.identity = c.identity.userId ? await service.identity(c.identity.userId) : c.identity
      const allowed = await service.allowed(c.identity, cmd.room, c.subject)
        || (guestAllows.get(`${cmd.room}:${c.subject}`) ?? 0) > Date.now()
      if (allowed) enter(c, cmd.room)
      else {
        leave(c); c.desired = cmd.room; c.status = 'knock'
        if (c.identity.userId) {
          const { rows } = await db.query("SELECT id FROM knocks WHERE room_id=$1 AND subject_id=$2 AND status='pending' AND created_at>date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' LIMIT 1", [cmd.room,c.identity.userId])
          if (rows.length) c.status = 'pending'
        }
        send(c, { op: 'waiting', room: cmd.room, status: c.status }); directory(); queues()
      }
    } else if (cmd.op === 'knock' && c.desired && c.status !== 'pending') {
      c.status = 'pending'
      if (c.identity.userId) await db.query('INSERT INTO knocks(id,room_id,subject_id,status) VALUES($1,$2,$3,\'pending\')', [randomUUID(), c.desired, c.identity.userId])
      send(c, { op: 'waiting', room: c.desired, status: 'pending' }); queues()
    } else if (cmd.op === 'moderate' && c.room) {
      c.identity = c.identity.userId ? await service.identity(c.identity.userId) : c.identity
      if (!canModerate(c.identity, c.room) || c.subject === cmd.subject) throw new RequestError('Only this room’s King can moderate', 403)
      const targets = [...clients].filter(t => t.subject === cmd.subject && (cmd.action === 'kick' ? t.room === c.room : t.desired === c.room && t.status === 'pending'))
      if (!targets.length) return
      await service.moderate(c.identity, c.room, cmd.subject, cmd.action)
      const key = `${c.room}:${cmd.subject}`
      if (cmd.action === 'allow') guestAllows.set(key, Date.parse(new Date().toISOString().slice(0,10)) + 86400000)
      else guestAllows.delete(key)
      for (const target of targets) {
        if (cmd.action === 'allow') enter(target, c.room)
        else if (cmd.action === 'deny') { target.status = 'denied'; send(target, { op: 'waiting', room: c.room, status: 'denied' }) }
        else { broadcast(c.room, { op: 'notice', text: `${target.identity.name} was asked to leave` }); enter(target, 'anexya-general') }
        const text = `${target.identity.name}: ${cmd.action === 'allow' ? 'allowed' : cmd.action === 'deny' ? 'denied' : 'kicked'}`
        send(c, { op: 'notice', text }); send(target, { op: 'notice', text })
      }
      queues()
    } else if (cmd.op === 'packet' && c.room) {
      const message = cmd.message
      if (message.id !== c.id || message.seq <= c.seq) return
      c.seq = message.seq
      if (message.t === 'state') {
        message.name = c.identity.userId ? c.identity.name : message.name
        if (!c.identity.userId) c.identity.name = message.name
        const day = new Date().toISOString().slice(0,10)
        const treeKey = `${c.room}:${day}`
        const tree = roomTrees.get(treeKey) ?? {}
        // Room tree is server-owned; clients can only increase their own ornament counter.
        const value = message.tree?.[c.id]
        if (value !== undefined && (c.id in tree || Object.keys(tree).length < 4096)) tree[c.id] = Math.max(tree[c.id] ?? 0, value)
        roomTrees.set(treeKey, tree)
        message.tree = Object.fromEntries(Object.entries(tree).sort((a,b) => b[1]-a[1]).slice(0,16))
        c.state = { ...(c.state?.t === 'state' ? c.state : {}), ...message }
      }
      const floor = drops.get(c.room) ?? new Map<string, { message: WorkshopMessage; at: number }>()
      drops.set(c.room, floor)
      if (message.t === 'drop' || message.t === 'idrop') {
        const key = message.t === 'drop' ? `present:${message.pid}` : `item:${message.did}`
        if (!floor.has(key) && floor.size < 128) floor.set(key, { message, at: Date.now() })
      } else if (message.t === 'open') floor.delete(`present:${message.pid}`)
      else if (message.t === 'grant' && floor.get(`item:${message.did}`)?.message.id === c.id) floor.delete(`item:${message.did}`)
      // Grants broadcast so every bystander removes the claimed drop. Trade and claim stay directed.
      const to = message.t === 'trade' ? message.to : message.t === 'claim' ? message.owner : null
      if (to) {
        for (const target of clients) if (target.room === c.room && target.id === to) send(target, { op: 'packet', message })
      } else broadcast(c.room, { op: 'packet', message }, c)
      if (message.t === 'bye') { leave(c); directory(); queues() }
    } else if ((cmd.op === 'dm' || cmd.op === 'history') && c.room) {
      const target = [...clients].find(t => t.id === cmd.to && t.room && t !== c)
      if (!target) throw new RequestError('That player is no longer in a shared room')
      if(c.identity.userId&&target.identity.userId)await social.permitted(c.identity.userId,target.identity.userId)
      if (cmd.op === 'history') {
        if (!c.identity.userId || !target.identity.userId) return
        const { rows } = await db.query('SELECT * FROM messages WHERE pair=$1 ORDER BY at DESC,id DESC LIMIT 50', [pairKey(c.identity.userId, target.identity.userId)])
        send(c, { op: 'history', messages: rows.reverse().map(m => ({ from: m.from_id === c.identity.userId ? c.id : target.id, to: m.to_id === c.identity.userId ? c.id : target.id, name: m.name, text: m.text, at: new Date(m.at).getTime() })) })
      } else {
        const message = { from: c.id, to: target.id, name: c.identity.name, text: cmd.text, at: Date.now() }
        if (c.identity.userId && target.identity.userId) {
          const pair = pairKey(c.identity.userId, target.identity.userId)
          await db.transaction(async tx => {
            // Lock pair through its users, in a stable order, before pruning to exactly 50.
            await tx.query('SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE', [c.identity.userId, target.identity.userId])
            await tx.query('INSERT INTO messages(id,pair,from_id,to_id,name,text) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), pair, c.identity.userId, target.identity.userId, c.identity.name, cmd.text])
            await tx.query('DELETE FROM messages WHERE pair=$1 AND id NOT IN (SELECT id FROM messages WHERE pair=$1 ORDER BY at DESC,id DESC LIMIT 50)', [pair])
          })
        }
        send(c, { op: 'dm', message }); send(target, { op: 'dm', message })
      }
    }
  }
  const bearer = async (req: IncomingMessage, optional = false) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    if (!token && optional) return undefined
    return service.authenticate(token ?? '')
  }
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && !origins.includes(origin)) { res.writeHead(403).end(); return }
    res.setHeader('Access-Control-Allow-Origin', origin ?? 'null')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    try {
      const requestUrl = new URL(req.url ?? '/', 'http://localhost')
      const path = requestUrl.pathname
      let body: unknown = null
      if (req.method === 'POST') {
        let text = ''
        for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 256000) throw new RequestError('Request too large', 413) }
        try { body = JSON.parse(text) } catch { throw new RequestError('Invalid JSON') }
      }
      let result: unknown
      if (path === '/auth/handle-available') {
        if (req.method !== 'GET' && req.method !== 'POST') throw new RequestError('Use GET or POST', 405)
        const key = `handle:${req.socket.remoteAddress ?? 'unknown'}`
        const rate = httpRates.get(key) ?? { at: Date.now(), count: 0 }
        if (Date.now() - rate.at > 60000) { rate.count = 0; rate.at = Date.now() }
        rate.count++; httpRates.set(key, rate)
        if (rate.count > 60) throw new RequestError('Too many attempts; try again in a minute', 429)
        const handle = req.method === 'GET'
          ? requestUrl.searchParams.get('handle')
          : record(body) ? body.handle : null
        const email = req.method === 'GET'
          ? requestUrl.searchParams.get('email') ?? ''
          : record(body) && typeof body.email === 'string' ? body.email : ''
        result = await service.handleAvailable(handle, email)
      } else if (path === '/auth/login' || path === '/auth/signup' || path === '/auth/verify') {
        if (req.method !== 'POST') throw new RequestError('Use POST', 405)
        const key = req.socket.remoteAddress ?? 'unknown'
        const rate = httpRates.get(key) ?? { at: Date.now(), count: 0 }
        if (Date.now() - rate.at > 60000) { rate.count = 0; rate.at = Date.now() }
        rate.count++; httpRates.set(key, rate)
        if (rate.count > 20) throw new RequestError('Too many attempts; try again in a minute', 429)
        result = path === '/auth/verify' ? await service.verifySignup(body) : await service.auth(body, path.endsWith('signup'))
      } else if(path==='/friends'||path==='/friends/messages') {
        const identity=await bearer(req),userId=identity!.userId!
        if(req.method==='POST'){
          const key=`social:${userId}`,rate=httpRates.get(key)??{at:Date.now(),count:0}
          if(Date.now()-rate.at>60000){rate.count=0;rate.at=Date.now()}
          rate.count++;httpRates.set(key,rate)
          if(rate.count>60)throw new RequestError('Please slow down and try again in a minute',429)
        }
        if(path==='/friends'){
          if(req.method==='POST'){const target=await social.action(userId,body);socialChanged(userId,target);result={ok:true}}
          else if(req.method==='GET')result=await social.friends(userId,new Set([...clients].flatMap(c=>c.identity.userId?[c.identity.userId]:[])))
          else throw new RequestError('Method not allowed',405)
        }else if(req.method==='GET')result=await social.history(userId,requestUrl.searchParams.get('to'))
        else if(req.method==='POST'){const message=await social.message(userId,body);socialChanged(userId,message.to);result=message}
        else throw new RequestError('Method not allowed',405)
      } else if (path === '/events' && req.method === 'GET') {
        result = await service.events((await bearer(req, true))?.userId ?? undefined)
      } else if (path.startsWith('/events/') && path.endsWith('/join') && req.method === 'POST') {
        const identity = await bearer(req)
        result = await service.joinEvent(identity!.userId!, decodeURIComponent(path.split('/')[2]))
      } else if (path === '/profile') {
        const identity = await bearer(req)
        result = req.method === 'GET' ? await service.profile(identity!.userId!) : req.method === 'POST' ? await service.sync(identity!.userId!, body) : (() => { throw new RequestError('Method not allowed', 405) })()
      } else if (path === '/admin/users' && req.method === 'GET') {
        const identity = await bearer(req); result = await service.adminUsers(identity!.userId!, requestUrl.searchParams.get('q') ?? '')
      } else if (path === '/admin/bag' && req.method === 'POST') {
        const identity = await bearer(req)
        if (!body || typeof body !== 'object') throw new RequestError('Invalid request')
        const b = body as Record<string, unknown>
        result = await service.adminBag(identity!.userId!, String(b.user ?? ''), b.action === 'remove' ? 'remove' : 'add', String(b.item ?? ''), Number(b.amount ?? 1))
      } else if (path === '/admin/events' && req.method === 'GET') {
        const identity = await bearer(req); result = await service.adminEvents(identity!.userId!)
      } else if (path === '/admin/events' && req.method === 'POST') {
        const identity = await bearer(req)
        if (!body || typeof body !== 'object') throw new RequestError('Invalid request')
        const b = body as Record<string, unknown>
        result = b.action === 'delete'
          ? await service.adminDeleteEvent(identity!.userId!,String(b.id ?? ''))
          : await service.adminSaveEvent(identity!.userId!,b.event)
      } else if (path === '/auth/logout' && req.method === 'POST') {
        await service.logout(req.headers.authorization?.replace(/^Bearer /, '') ?? ''); result = { ok: true }
      } else if (path === '/health') result = { ok: true }
      else throw new RequestError('Not found', 404)
      res.end(JSON.stringify(result))
    } catch (e) {
      if (!(e instanceof RequestError)) console.error('[workshop]', e)
      res.writeHead(e instanceof RequestError ? e.status : 500).end(JSON.stringify({ error: e instanceof RequestError ? e.message : 'Service unavailable' }))
    }
  })
  const wss = new WebSocketServer({ server, path: '/socket', maxPayload: 16000, perMessageDeflate: false })
  wss.on('connection', (ws, req) => {
    if (req.headers.origin && !origins.includes(req.headers.origin)) { ws.close(1008); return }
    if (wss.clients.size > 512) { ws.close(1013); return }
    let c: Client | null = null
    let chain = Promise.resolve()
    let count = 0, windowAt = Date.now(), backlog = 0
    const helloTimeout = setTimeout(() => { if (!c) ws.close(1008) }, 10000)
    ws.on('pong', () => { if (c) c.pong = true })
    ws.on('message', (data, binary) => {
      if (binary) return
      if (Date.now()-windowAt > 1000) { count = 0; windowAt = Date.now() }
      if (++count > 60 || backlog > 100) { ws.close(1008, 'Rate limit'); return }
      let cmd: ClientCommand | null = null
      try { cmd = parseClientCommand(JSON.parse(data.toString())) } catch { return }
      if (!cmd) return
      const parsed = cmd
      backlog++
      chain = chain.then(async () => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (parsed.op === 'hello') {
          if (c) return
          const identity = parsed.token ? await service.authenticate(parsed.token) : { userId: null, name: parsed.name, crew: null, king: null, titles: [] }
          const subject = identity.userId ? `user:${identity.userId}` : `device:${parsed.device}`
          for (const old of clients) if (old.subject === subject || old.id === parsed.session) { leave(old); clients.delete(old); old.ws.close(4000, 'Opened on another window') }
          c = { ws, identity, subject, token: parsed.token, id: parsed.session, room: null, desired: null, status: 'knock', state: null, seq: -1, pong: true }
          clients.add(c); clearTimeout(helloTimeout)
        } else if (c) await command(c, parsed)
      }).catch(e => {
        if (e instanceof RequestError && c) send(c, { op: 'notice', text: e.message })
        else if (!c) ws.close(1008, 'Authentication failed')
        else console.error('[workshop socket]', e)
      }).finally(() => { backlog-- })
    })
    ws.on('error', () => {})
    ws.on('close', () => {
      clearTimeout(helloTimeout)
      if (c) { leave(c); clients.delete(c); directory(); queues() }
    })
  })
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.pong) { c.ws.terminate(); continue }
      c.pong = false; c.ws.ping()
    }
    for (const [key, until] of guestAllows) if (until <= Date.now()) guestAllows.delete(key)
    const day = new Date().toISOString().slice(0,10)
    for (const key of roomTrees.keys()) if (!key.endsWith(day)) roomTrees.delete(key)
    for (const floor of drops.values()) for (const [key, drop] of floor) if (Date.now()-drop.at > 120000) floor.delete(key)
    for (const [key, rate] of httpRates) if (Date.now()-rate.at > 60000) httpRates.delete(key)
  }, 15000)
  let refreshing = false
  const identityTimer = setInterval(async () => {
    if (refreshing) return
    refreshing = true
    try {
      for (const c of clients) if (c.identity.userId && c.token) {
        c.identity = await service.authenticate(c.token).catch(() => {
          send(c, { op: 'notice', text: 'Your account is no longer available. Returning to guest.' })
          c.ws.close(1008, 'Session expired')
          return c.identity
        })
      }
      directory(); queues()
    } catch (e) { console.error('[workshop identity]', e) } finally { refreshing = false }
  }, 5000)
  return { server, service, social, close: async () => {
    clearInterval(heartbeat); clearInterval(identityTimer)
    for (const ws of wss.clients) ws.terminate()
    await new Promise<void>(resolve => wss.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  } }
}
