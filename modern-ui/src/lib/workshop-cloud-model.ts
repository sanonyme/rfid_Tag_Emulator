import { ACHIEVEMENTS, loadProfile, type BagEntry, type WorkshopProfile } from './workshop-profile'
import { ITEMS, ITEM_BY_ID } from './workshop-items'
import { isWorkshopId, parseWorkshopMessage, sanitizeWorkshopChat, sanitizeWorkshopName, type WorkshopMessage } from './workshop-protocol'

export const CREWS = ['VSBL', 'EDGE', 'QA', 'UI', 'SUPPORT', 'CNCT', 'ANEXYA_LOVER'] as const
export type Crew = typeof CREWS[number]
export const ROOMS = [
  { id: 'anexya-general', name: 'Anexya General', crew: null },
  { id: 'vsbl', name: 'VSBL', crew: 'VSBL' }, { id: 'edge', name: 'Edge', crew: 'EDGE' },
  { id: 'support', name: 'Support', crew: 'SUPPORT' }, { id: 'cnct', name: 'CNCT', crew: 'CNCT' },
  { id: 'qa', name: 'QA', crew: 'QA' }, { id: 'ui', name: 'UI', crew: 'UI' },
] as const
export type RoomId = typeof ROOMS[number]['id']
export const isCrew = (v: unknown): v is Crew => CREWS.includes(v as Crew)
export const isRoom = (v: unknown): v is RoomId => ROOMS.some(r => r.id === v)
export const roomCrew = (room: string): Crew | null => ROOMS.find(r => r.id === room)?.crew ?? null
export type Identity = { userId: string | null; name: string; handle?: string; crew: Crew | null; king: Crew | null; titles: string[]; isAdmin?: boolean }
export function canModerate(identity: Identity, room: RoomId): boolean {
  return !!identity.userId && !!identity.king && identity.king === roomCrew(room)
}
export function canEnter(identity: Identity, room: RoomId, allowedUntil = 0, now = Date.now()): boolean {
  return room === 'anexya-general' || (!!identity.userId && identity.crew === roomCrew(room)) || allowedUntil > now
}
export function mergeBag(server: BagEntry[], local: BagEntry[]): BagEntry[] {
  const byUid = new Map<string, BagEntry>()
  for (const entry of [...server, ...local]) {
    const prev = byUid.get(entry.uid)
    if (!prev || entry.at > prev.at) byUid.set(entry.uid, entry)
  }
  return [...byUid.values()]
}
/** Run the same allowlist parser used for disk profiles. Unknown fields never reach storage. */
export function parseCloudProfile(raw: unknown): WorkshopProfile {
  return loadProfile({ getItem: () => JSON.stringify(raw) })
}
export const METRICS = ['sends', 'handheld', 'opened', 'trades', 'given'] as const
export type Metric = typeof METRICS[number]
export type LiveEvent = {
  id: string; title: string; body: string; startAt: string; endAt: string; enabled: boolean
  kind: 'challenge' | 'opt-in' | 'announcement'; metric: Metric; target: number
  reward: { item?: string; title?: string } | null; crews: Crew[] | null; optIn: boolean
  /** Existing runner supports crew-local Secret Santa without executable event code. */
  pairing?: 'same-crew'
}
export type EventView = LiveEvent & { value: number; optedIn: boolean; recipient: string | null; pairingStatus?: string }
export function parseLiveEvent(v: unknown): LiveEvent | null {
  if (!record(v)) return null
  const metric = v.kind === 'announcement' && v.metric === undefined ? 'sends' : v.metric
  const target = v.kind === 'announcement' && v.target === undefined ? 1 : v.target
  if (!token(v.id) || typeof v.title !== 'string' || typeof v.body !== 'string'
    || typeof v.startAt !== 'string' || typeof v.endAt !== 'string' || !Number.isFinite(Date.parse(v.startAt))
    || !Number.isFinite(Date.parse(v.endAt)) || typeof v.enabled !== 'boolean'
    || !['challenge', 'opt-in', 'announcement'].includes(String(v.kind)) || !METRICS.includes(metric as Metric)
    || typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > 10000000
    || !(v.crews === null || (Array.isArray(v.crews) && v.crews.every(isCrew)))) return null
  let reward: LiveEvent['reward'] = null
  if (v.reward != null) {
    if (!record(v.reward)) return null
    reward = {}
    if (v.reward.item !== undefined) {
      if (typeof v.reward.item !== 'string' || !ITEM_BY_ID.has(v.reward.item)) return null
      reward.item = v.reward.item
    }
    if (v.reward.title !== undefined) {
      const title = v.reward.title
      if (typeof title !== 'string' || !(ACHIEVEMENTS.some(a => a.title === title) || ITEMS.some(item => item.titleText === title))) return null
      reward.title = title
    }
  }
  return { id: v.id, title: v.title.slice(0, 100), body: v.body.slice(0, 1000), startAt: v.startAt, endAt: v.endAt,
    enabled: v.enabled, kind: v.kind as LiveEvent['kind'], metric: metric as Metric, target,
    reward, crews: v.crews as Crew[] | null, optIn: v.optIn === true || v.kind === 'opt-in',
    ...(v.pairing === 'same-crew' ? { pairing: 'same-crew' as const } : {}) }
}
export function eventActive(event: LiveEvent, crew: Crew | null, now = Date.now()): boolean {
  return event.enabled && Date.parse(event.startAt) <= now && now < Date.parse(event.endAt)
    && (event.crews === null || (crew !== null && event.crews.includes(crew)))
}
export function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
const token = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v)
export type ClientCommand =
  | { op: 'hello'; device: string; session: string; name: string; token: string | null }
  | { op: 'join'; room: RoomId }
  | { op: 'knock' }
  | { op: 'moderate'; subject: string; action: 'allow' | 'deny' | 'kick' }
  | { op: 'packet'; message: WorkshopMessage }
  | { op: 'dm' | 'history'; to: string; text: string }
export function parseClientCommand(v: unknown): ClientCommand | null {
  if (!record(v)) return null
  switch (v.op) {
    case 'hello': return typeof v.device === 'string' && /^[A-Z0-9]{8}$/.test(v.device) && isWorkshopId(v.session)
      && (v.token === null || (typeof v.token === 'string' && /^[a-f0-9]{64}$/.test(v.token)))
      ? { op: 'hello', device: v.device, session: v.session, name: sanitizeWorkshopName(v.name), token: v.token } : null
    case 'join': return isRoom(v.room) ? { op: 'join', room: v.room } : null
    case 'knock': return { op: 'knock' }
    case 'moderate': return typeof v.subject === 'string' && /^(user|device):[a-zA-Z0-9-]{8,40}$/.test(v.subject)
      && ['allow', 'deny', 'kick'].includes(String(v.action)) ? { op: 'moderate', subject: v.subject, action: v.action as 'allow' | 'deny' | 'kick' } : null
    case 'packet': { const message = parseWorkshopMessage(v.message); return message ? { op: 'packet', message } : null }
    case 'dm': case 'history': {
      const text = v.op === 'history' ? '' : sanitizeWorkshopChat(v.text)
      return isWorkshopId(v.to) && text !== null ? { op: v.op, to: v.to, text } : null
    }
    default: return null
  }
}
export type DirectoryPlayer = Identity & { id: string; room: RoomId; subject: string }
export type Dm = { from: string; to: string; name: string; text: string; at: number }
export type ServerNotice =
  | { op: 'joined'; room: RoomId; identity: Identity; tree: Record<string, number> }
  | { op: 'waiting'; room: RoomId; status: 'knock' | 'pending' | 'denied' }
  | { op: 'packet'; message: WorkshopMessage }
  | { op: 'snapshot'; messages: WorkshopMessage[] }
  | { op: 'knocks'; entries: { subject: string; name: string }[] }
  | { op: 'directory'; players: DirectoryPlayer[]; counts: Partial<Record<RoomId, number>> }
  | { op: 'dm'; message: Dm }
  | { op: 'history'; messages: Dm[] }
  | { op: 'social' }
  | { op: 'notice'; text: string }
export function parseIdentity(v: unknown): Identity | null {
  if (!record(v) || !(v.userId === null || (typeof v.userId === 'string' && /^[a-f0-9-]{36}$/.test(v.userId)))
    || !(v.crew === null || isCrew(v.crew)) || !(v.king === null || isCrew(v.king)) || !Array.isArray(v.titles)
    || !v.titles.every(t => typeof t === 'string' && t.length <= 100)) return null
  if(v.handle!==undefined && (typeof v.handle!=='string' || !/^[a-z][a-z0-9_]{2,39}$/.test(v.handle))) return null
  return { userId: v.userId, name: sanitizeWorkshopName(v.name), ...(typeof v.handle==='string'?{handle:v.handle}:{}), crew: v.crew, king: v.userId ? v.king : null, titles: v.titles.slice(0, 20), ...(v.isAdmin === true ? { isAdmin: true } : {}) }
}
export function parseServerNotice(v: unknown): ServerNotice | null {
  if (!record(v)) return null
  switch (v.op) {
    case 'social': return {op:'social'}
    case 'snapshot': {
      if (!Array.isArray(v.messages) || v.messages.length > 256) return null
      const messages = v.messages.map(parseWorkshopMessage)
      return messages.every((m): m is WorkshopMessage => m !== null) ? { op: 'snapshot', messages } : null
    }
    case 'joined': {
      const identity = parseIdentity(v.identity)
      const state = parseWorkshopMessage({ id: 'cloudtree', seq: 0, t: 'state', name: 'Cloud', hat: 0, x: 0, y: 0, dir: 1, mv: false, tree: v.tree ?? {} })
      return isRoom(v.room) && identity && state?.t === 'state' ? { op: 'joined', room: v.room, identity, tree: state.tree ?? {} } : null
    }
    case 'waiting': return isRoom(v.room) && ['knock', 'pending', 'denied'].includes(String(v.status))
      ? { op: 'waiting', room: v.room, status: v.status as 'knock' | 'pending' | 'denied' } : null
    case 'packet': { const message = parseWorkshopMessage(v.message); return message ? { op: 'packet', message } : null }
    case 'notice': return typeof v.text === 'string' ? { op: 'notice', text: v.text.slice(0, 200) } : null
    case 'knocks': return Array.isArray(v.entries) && v.entries.length <= 256 && v.entries.every(e => record(e) && typeof e.subject === 'string')
      ? { op: 'knocks', entries: v.entries.map(e => ({ subject: e.subject, name: sanitizeWorkshopName(e.name) })) } : null
    case 'directory': {
      if (!Array.isArray(v.players) || v.players.length > 512 || !record(v.counts)) return null
      const players: DirectoryPlayer[] = []
      for (const p of v.players) {
        if (!record(p) || !isWorkshopId(p.id) || !isRoom(p.room) || typeof p.subject !== 'string') return null
        const identity = parseIdentity(p); if (!identity) return null
        players.push({ ...identity, id: p.id, room: p.room, subject: p.subject })
      }
      const counts: Partial<Record<RoomId, number>> = {}
      for (const r of ROOMS) if (typeof v.counts[r.id] === 'number' && Number.isInteger(v.counts[r.id]) && Number(v.counts[r.id]) >= 0) counts[r.id] = Number(v.counts[r.id])
      return { op: 'directory', players, counts }
    }
    case 'dm': case 'history': {
      const messages = v.op === 'dm' ? [v.message] : v.messages
      if (!Array.isArray(messages) || messages.length > 50) return null
      const out: Dm[] = []
      for (const m of messages) {
        if (!record(m) || !isWorkshopId(m.from) || !isWorkshopId(m.to) || typeof m.at !== 'number' || !Number.isFinite(m.at)) return null
        const text = sanitizeWorkshopChat(m.text); if (!text) return null
        out.push({ from: m.from, to: m.to, name: sanitizeWorkshopName(m.name), text, at: m.at })
      }
      return v.op === 'dm' ? { op: 'dm', message: out[0] } : { op: 'history', messages: out }
    }
    default: return null
  }
}
