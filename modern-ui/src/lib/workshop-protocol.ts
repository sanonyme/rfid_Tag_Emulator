/**
 * Validated gameplay wire format, retained by the cloud Workshop transport.
 * Shared by the backend and renderer. Legacy packet encoding remains compatible.
 * Keep this module runtime-neutral: it is compiled for both targets.
 */
import { isElfAppearance, parseElfAppearance, type ElfAppearance } from './workshop-appearance'

export const WORKSHOP_GROUP = '239.255.77.88'
export const WORKSHOP_PORT = 47823
export const WORKSHOP_MAX_PACKET_BYTES = 1200
export const WORKSHOP_HAT_COUNT = 6
export const WORKSHOP_PRESENT_COLORS = 4
export const WORKSHOP_MAX_TREE_ENTRIES = 16
export const WORKSHOP_NAME_MAX = 16
export const WORKSHOP_CHAT_MAX = 80
export const WORKSHOP_LETTER_MAX = 280
export const WORKSHOP_EMOTE_COUNT = 5
export const WORKSHOP_RARITY_COUNT = 5
export const WORKSHOP_TRADE_MAX_ITEMS = 4

const APP_TAG = 'zeus-workshop'
// Newer fields are optional and new message types are ignored by older builds, so v1 still
// interoperates with them.
const PROTOCOL_VERSION = 1
const ID_RE = /^[a-z0-9]{8,16}$/
const PID_RE = /^[a-z0-9]{6,20}$/
const ROOM_RE = /^[a-z0-9._:[\]-]{1,64}$/
const ITEM_RE = /^[a-z0-9-]{2,24}$/
const EPC_RE = /^[0-9A-F]{4}$/
const MAX_SEQ = 2 ** 31 - 1
const MAX_TREE_COUNT = 100_000
const MAX_SCORE = 10_000_000

/** Today's tallies: send batches, Edge process starts, presents opened. */
export type WorkshopScore = [sends: number, starts: number, opened: number]

/** Equipped item ids; '' for an empty slot. Receivers ignore ids they don't know. */
export type WorkshopEquip = [hat: string, pet: string, trail: string]

export type WorkshopTradePayload =
  | { t: 'trade'; op: 'req' | 'accept' | 'cancel' | 'busy'; tid: string; to: string }
  | { t: 'trade'; op: 'offer'; tid: string; to: string; items: string[] }
  /** `give` and `get` are the sender's view of the deal; both sides must agree to commit. */
  | { t: 'trade'; op: 'ready' | 'done'; tid: string; to: string; give: string[]; get: string[] }

export type WorkshopPayload =
  | {
      t: 'state'
      name: string
      hat: number
      /** Floor position, 0 (left edge) to 1 (right edge). */
      x: number
      /** Jump height as a fraction of the receiver's own max jump, 0 to 1. */
      y: number
      dir: 1 | -1
      mv: boolean
      s?: WorkshopScore
      /** Presents opened today, keyed by player session id. Grow-only per key. */
      tree?: Record<string, number>
      eq?: WorkshopEquip
      /** Achievement id shown as the player's title; '' for none. */
      ti?: string
      /** Rarest rarity index the device has discovered, for nameplate trim. */
      pf?: number
      /** Equipped shirt item id; '' for none. Older builds ignore this. */
      sh?: string
      /** Equipped wings item id; '' for none. Older builds ignore this. */
      wg?: string
      /** Optional cosmetic identity; legacy peers continue using the outfit index. */
      av?: ElfAppearance
    }
  /** `r` is the present's rarity index; `epc` the last four hex digits of the tag that dropped it. */
  | { t: 'drop'; pid: string; x: number; c: number; r?: number; epc?: string }
  | { t: 'open'; pid: string }
  | { t: 'bell'; started: boolean }
  | { t: 'bye' }
  | { t: 'chat'; text: string }
  | { t: 'emote'; e: number }
  | { t: 'snow'; x: number; dir: 1 | -1 }
  | { t: 'found'; item: string; r: number }
  /** An inventory item put on the floor; only `owner` can grant it, to the first claimer. */
  | { t: 'idrop'; did: string; item: string; x: number; note?: string }
  | { t: 'claim'; did: string; owner: string }
  | { t: 'grant'; did: string; to: string }
  | WorkshopTradePayload

/** `id` is a per-session random id; `seq` increases with every message from that session. */
export type WorkshopMessage = { id: string; seq: number } & WorkshopPayload

export type WorkshopStateMessage = Extract<WorkshopMessage, { t: 'state' }>

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

function unit(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.min(1, Math.max(0, v))
}

export function isWorkshopId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

export function isWorkshopPresentId(v: unknown): v is string {
  return typeof v === 'string' && PID_RE.test(v)
}

/** Display names arrive from other machines: strip control/format characters and cap the length. */
export function sanitizeWorkshopName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Elf'
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const clipped = Array.from(cleaned).slice(0, WORKSHOP_NAME_MAX).join('').trim()
  return clipped || 'Elf'
}

/** Same cleanup as names, for chat lines; null when nothing printable is left. */
export function sanitizeWorkshopChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const clipped = Array.from(cleaned).slice(0, WORKSHOP_CHAT_MAX).join('').trim()
  return clipped || null
}

/** Account DMs may carry E2E ciphertext (longer than room chat). Guests still use short plaintext. */
export function sanitizeWorkshopDm(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 4000) return null
  if (/^zeus1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return raw
  if (/^zeus2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return raw
  return sanitizeWorkshopChat(raw)
}

/** Longer note text for gifted letters; keeps newlines, strips other controls. */
export function sanitizeWorkshopLetter(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .normalize('NFC')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, (ch) => (ch === '\n' ? '\n' : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const clipped = Array.from(cleaned).slice(0, WORKSHOP_LETTER_MAX).join('').trim()
  return clipped || null
}

export function isWorkshopItemId(v: unknown): v is string {
  return typeof v === 'string' && ITEM_RE.test(v)
}

function parseItemList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > WORKSHOP_TRADE_MAX_ITEMS) return null
  return v.every(isWorkshopItemId) ? [...v] : null
}

function parseEquip(v: unknown): WorkshopEquip | null {
  if (!Array.isArray(v) || v.length !== 3) return null
  return v.every((id) => id === '' || isWorkshopItemId(id)) ? [v[0], v[1], v[2]] : null
}

function parseTrade(id: string, seq: number, value: Record<string, unknown>): WorkshopMessage | null {
  const { tid, to, op } = value
  if (!isWorkshopPresentId(tid) || !isWorkshopId(to)) return null
  switch (op) {
    case 'req':
    case 'accept':
    case 'cancel':
    case 'busy':
      return { id, seq, t: 'trade', op, tid, to }
    case 'offer': {
      const items = parseItemList(value.items)
      return items ? { id, seq, t: 'trade', op, tid, to, items } : null
    }
    case 'ready':
    case 'done': {
      const give = parseItemList(value.give)
      const get = parseItemList(value.get)
      return give && get ? { id, seq, t: 'trade', op, tid, to, give, get } : null
    }
    default:
      return null
  }
}

function parseScore(v: unknown): WorkshopScore | null {
  if (!Array.isArray(v) || v.length !== 3) return null
  const [a, b, c] = v.map((n) => intIn(n, 0, MAX_SCORE))
  return a === null || b === null || c === null ? null : [a, b, c]
}

function parseTree(v: unknown): Record<string, number> | null {
  if (!isRecord(v)) return null
  const entries = Object.entries(v)
  if (entries.length > WORKSHOP_MAX_TREE_ENTRIES) return null
  const out: Record<string, number> = {}
  for (const [key, n] of entries) {
    const count = intIn(n, 0, MAX_TREE_COUNT)
    if (!ID_RE.test(key) || count === null) return null
    out[key] = count
  }
  return out
}

/**
 * Rebuilds a message from untrusted input, keeping only known fields.
 * Returns null for anything malformed rather than trying to repair it.
 */
export function parseWorkshopMessage(value: unknown): WorkshopMessage | null {
  if (!isRecord(value)) return null
  const { id } = value
  const seq = intIn(value.seq, 0, MAX_SEQ)
  if (!isWorkshopId(id) || seq === null) return null

  switch (value.t) {
    case 'state': {
      const hat = intIn(value.hat, 0, WORKSHOP_HAT_COUNT - 1)
      const x = unit(value.x)
      const y = unit(value.y)
      const dir = value.dir === 1 || value.dir === -1 ? value.dir : null
      if (hat === null || x === null || y === null || dir === null || typeof value.mv !== 'boolean') return null
      const msg: WorkshopStateMessage = {
        id,
        seq,
        t: 'state',
        name: sanitizeWorkshopName(value.name),
        hat,
        x,
        y,
        dir,
        mv: value.mv,
      }
      if (value.s !== undefined) {
        const s = parseScore(value.s)
        if (!s) return null
        msg.s = s
      }
      if (value.tree !== undefined) {
        const tree = parseTree(value.tree)
        if (!tree) return null
        msg.tree = tree
      }
      if (value.eq !== undefined) {
        const eq = parseEquip(value.eq)
        if (!eq) return null
        msg.eq = eq
      }
      if (value.ti !== undefined) {
        const ti = value.ti
        if (typeof ti !== 'string' || (ti !== '' && !isWorkshopItemId(ti))) return null
        msg.ti = ti
      }
      if (value.pf !== undefined) {
        const pf = intIn(value.pf, 0, WORKSHOP_RARITY_COUNT - 1)
        if (pf === null) return null
        msg.pf = pf
      }
      if (value.sh !== undefined) {
        if (value.sh !== '' && !isWorkshopItemId(value.sh)) return null
        msg.sh = value.sh
      }
      if (value.wg !== undefined) {
        if (value.wg !== '' && !isWorkshopItemId(value.wg)) return null
        msg.wg = value.wg
      }
      if (value.av !== undefined) {
        if (!isElfAppearance(value.av)) return null
        msg.av = parseElfAppearance(value.av)
      }
      return msg
    }
    case 'drop': {
      const x = unit(value.x)
      const c = intIn(value.c, 0, WORKSHOP_PRESENT_COLORS - 1)
      if (!isWorkshopPresentId(value.pid) || x === null || c === null) return null
      const msg: Extract<WorkshopMessage, { t: 'drop' }> = { id, seq, t: 'drop', pid: value.pid, x, c }
      if (value.r !== undefined) {
        const r = intIn(value.r, 0, WORKSHOP_RARITY_COUNT - 1)
        if (r === null) return null
        msg.r = r
      }
      if (value.epc !== undefined) {
        if (typeof value.epc !== 'string' || !EPC_RE.test(value.epc)) return null
        msg.epc = value.epc
      }
      return msg
    }
    case 'open':
      return isWorkshopPresentId(value.pid) ? { id, seq, t: 'open', pid: value.pid } : null
    case 'bell':
      return typeof value.started === 'boolean' ? { id, seq, t: 'bell', started: value.started } : null
    case 'bye':
      return { id, seq, t: 'bye' }
    case 'chat': {
      const text = sanitizeWorkshopChat(value.text)
      return text ? { id, seq, t: 'chat', text } : null
    }
    case 'emote': {
      const e = intIn(value.e, 0, WORKSHOP_EMOTE_COUNT - 1)
      return e === null ? null : { id, seq, t: 'emote', e }
    }
    case 'snow': {
      const x = unit(value.x)
      const dir = value.dir === 1 || value.dir === -1 ? value.dir : null
      return x === null || dir === null ? null : { id, seq, t: 'snow', x, dir }
    }
    case 'found': {
      const r = intIn(value.r, 0, WORKSHOP_RARITY_COUNT - 1)
      return isWorkshopItemId(value.item) && r !== null ? { id, seq, t: 'found', item: value.item, r } : null
    }
    case 'idrop': {
      const x = unit(value.x)
      if (!isWorkshopPresentId(value.did) || !isWorkshopItemId(value.item) || x === null) return null
      const note = sanitizeWorkshopLetter(value.note)
      return note
        ? { id, seq, t: 'idrop', did: value.did, item: value.item, x, note }
        : { id, seq, t: 'idrop', did: value.did, item: value.item, x }
    }
    case 'claim':
      return isWorkshopPresentId(value.did) && isWorkshopId(value.owner)
        ? { id, seq, t: 'claim', did: value.did, owner: value.owner }
        : null
    case 'grant':
      return isWorkshopPresentId(value.did) && isWorkshopId(value.to)
        ? { id, seq, t: 'grant', did: value.did, to: value.to }
        : null
    case 'trade':
      return parseTrade(id, seq, value)
    default:
      return null
  }
}

/** JSON text for the wire, or null if the message is invalid. Callers enforce the byte cap. */
export function encodeWorkshopPacket(room: string, message: unknown): string | null {
  const msg = parseWorkshopMessage(message)
  if (!msg || !ROOM_RE.test(room)) return null
  return JSON.stringify({ v: PROTOCOL_VERSION, app: APP_TAG, room, ...msg })
}

/** Parses a received datagram; anything for another room, app, or version is dropped. */
export function decodeWorkshopPacket(text: string, room: string): WorkshopMessage | null {
  if (text.length > WORKSHOP_MAX_PACKET_BYTES) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || raw.app !== APP_TAG || raw.room !== room) return null
  return parseWorkshopMessage(raw)
}
