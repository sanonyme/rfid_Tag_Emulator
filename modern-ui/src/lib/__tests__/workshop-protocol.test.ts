import { describe, it, expect } from 'vitest'
import {
  WORKSHOP_MAX_PACKET_BYTES,
  WORKSHOP_MAX_TREE_ENTRIES,
  decodeWorkshopPacket,
  encodeWorkshopPacket,
  normalizeWorkshopRoom,
  parseWorkshopMessage,
  sanitizeWorkshopName,
} from '../workshop-protocol'

const ROOM = '192.168.10.36'
const state = {
  id: 'abc123def456',
  seq: 7,
  t: 'state',
  name: 'Nora',
  hat: 2,
  x: 0.5,
  y: 0,
  dir: 1,
  mv: false,
} as const

describe('workshop protocol', () => {
  it('round-trips a state message with score and tree', () => {
    const msg = { ...state, s: [3, 1, 2], tree: { abc123def456: 2, zzz999yyy888: 5 } }
    const text = encodeWorkshopPacket(ROOM, msg)
    expect(text).not.toBeNull()
    expect(decodeWorkshopPacket(text!, ROOM)).toEqual(msg)
  })

  it('round-trips every event type', () => {
    const id = 'abc123def456'
    const to = 'zzz999yyy888'
    const events = [
      { id, seq: 1, t: 'drop', pid: 'p0p0p0p0', x: 0.25, c: 3 },
      { id, seq: 2, t: 'drop', pid: 'p0p0p0p1', x: 0.5, c: 1, r: 4, epc: 'A01F' },
      { id, seq: 3, t: 'open', pid: 'p0p0p0p0' },
      { id, seq: 4, t: 'bell', started: true },
      { id, seq: 5, t: 'bye' },
      { id, seq: 6, t: 'chat', text: 'ho ho ho' },
      { id, seq: 7, t: 'emote', e: 4 },
      { id, seq: 8, t: 'snow', x: 0.4, dir: -1 },
      { id, seq: 9, t: 'found', item: 'golden-epc', r: 4 },
      { id, seq: 10, t: 'idrop', did: 'd0d0d0d0', item: 'penguin', x: 0.7 },
      { id, seq: 11, t: 'claim', did: 'd0d0d0d0', owner: to },
      { id, seq: 12, t: 'grant', did: 'd0d0d0d0', to },
      { id, seq: 13, t: 'trade', op: 'req', tid: 't0t0t0t0', to },
      { id, seq: 14, t: 'trade', op: 'busy', tid: 't0t0t0t0', to },
      { id, seq: 15, t: 'trade', op: 'offer', tid: 't0t0t0t0', to, items: ['penguin', 'snowball'] },
      { id, seq: 16, t: 'trade', op: 'done', tid: 't0t0t0t0', to, give: ['penguin'], get: [] },
    ]
    for (const event of events) {
      expect(decodeWorkshopPacket(encodeWorkshopPacket(ROOM, event)!, ROOM)).toEqual(event)
    }
  })

  it('round-trips equipment, title, and prestige on state messages', () => {
    const msg = { ...state, eq: ['santa-hat', '', 'hex-rain'], ti: 'rare-hunter', pf: 3 }
    expect(decodeWorkshopPacket(encodeWorkshopPacket(ROOM, msg)!, ROOM)).toEqual(msg)
    expect(parseWorkshopMessage({ ...state, eq: ['santa-hat', ''] })).toBeNull()
    expect(parseWorkshopMessage({ ...state, eq: ['Santa Hat', '', ''] })).toBeNull()
    expect(parseWorkshopMessage({ ...state, ti: 7 })).toBeNull()
    expect(parseWorkshopMessage({ ...state, pf: 5 })).toBeNull()
  })

  it('validates chat, loot, floor items, and trades', () => {
    const base = { id: 'abc123def456', seq: 1 }
    expect(parseWorkshopMessage({ ...base, t: 'chat', text: '  hi\u0000 \u202ethere  ' })).toMatchObject({ text: 'hi there' })
    expect(parseWorkshopMessage({ ...base, t: 'chat', text: 'x'.repeat(200) })).toMatchObject({ text: 'x'.repeat(80) })
    expect(parseWorkshopMessage({ ...base, t: 'chat', text: '\u200b' })).toBeNull()
    expect(parseWorkshopMessage({ ...base, t: 'emote', e: 5 })).toBeNull()
    expect(parseWorkshopMessage({ ...base, t: 'found', item: 'golden-epc', r: 9 })).toBeNull()
    expect(parseWorkshopMessage({ ...base, t: 'drop', pid: 'p0p0p0p0', x: 0.1, c: 0, epc: 'a01f' })).toBeNull()
    expect(parseWorkshopMessage({ ...base, t: 'idrop', did: 'd0d0d0d0', item: '../x', x: 0.1 })).toBeNull()
    expect(parseWorkshopMessage({ ...base, t: 'grant', did: 'd0d0d0d0', to: 'NOPE' })).toBeNull()
    const trade = { ...base, t: 'trade', tid: 't0t0t0t0', to: 'zzz999yyy888' }
    expect(parseWorkshopMessage({ ...trade, op: 'steal' })).toBeNull()
    expect(parseWorkshopMessage({ ...trade, op: 'offer', items: ['a1', 'a2', 'a3', 'a4', 'a5'] })).toBeNull()
    expect(parseWorkshopMessage({ ...trade, op: 'ready', give: ['penguin'] })).toBeNull()
  })

  it('drops packets for another room, app, or version', () => {
    const text = encodeWorkshopPacket(ROOM, state)!
    expect(decodeWorkshopPacket(text, '192.168.10.37')).toBeNull()
    const raw = JSON.parse(text)
    expect(decodeWorkshopPacket(JSON.stringify({ ...raw, app: 'other' }), ROOM)).toBeNull()
    expect(decodeWorkshopPacket(JSON.stringify({ ...raw, v: 2 }), ROOM)).toBeNull()
  })

  it('rejects malformed input instead of repairing it', () => {
    expect(decodeWorkshopPacket('not json', ROOM)).toBeNull()
    expect(decodeWorkshopPacket('x'.repeat(WORKSHOP_MAX_PACKET_BYTES + 1), ROOM)).toBeNull()
    expect(parseWorkshopMessage({ ...state, id: 'BAD ID' })).toBeNull()
    expect(parseWorkshopMessage({ ...state, seq: -1 })).toBeNull()
    expect(parseWorkshopMessage({ ...state, hat: 6 })).toBeNull()
    expect(parseWorkshopMessage({ ...state, dir: 0 })).toBeNull()
    expect(parseWorkshopMessage({ ...state, x: Number.NaN })).toBeNull()
    expect(parseWorkshopMessage({ ...state, mv: 'yes' })).toBeNull()
    expect(parseWorkshopMessage({ ...state, s: [1, 2] })).toBeNull()
    expect(parseWorkshopMessage({ ...state, t: 'teleport' })).toBeNull()
    expect(parseWorkshopMessage({ ...state, t: 'drop', pid: 'p0p0p0p0', x: 0.1, c: 9 })).toBeNull()
  })

  it('rejects tree maps with bad keys, bad counts, or too many entries', () => {
    expect(parseWorkshopMessage({ ...state, tree: { __proto__x: 1 } })).toBeNull()
    expect(parseWorkshopMessage({ ...state, tree: { abc123def456: -1 } })).toBeNull()
    expect(parseWorkshopMessage({ ...state, tree: { abc123def456: 1.5 } })).toBeNull()
    const big = Object.fromEntries(
      Array.from({ length: WORKSHOP_MAX_TREE_ENTRIES + 1 }, (_, i) => [`player${String(i).padStart(4, '0')}`, 1]),
    )
    expect(parseWorkshopMessage({ ...state, tree: big })).toBeNull()
  })

  it('clamps positions into the floor and drops unknown fields', () => {
    const msg = parseWorkshopMessage({ ...state, x: 1.4, y: -0.2, extra: 'ignored' })
    expect(msg).toMatchObject({ x: 1, y: 0 })
    expect(msg).not.toHaveProperty('extra')
  })

  it('sanitizes display names from the network', () => {
    expect(sanitizeWorkshopName('  Santa\u0000\u202e  Claus  ')).toBe('Santa Claus')
    expect(sanitizeWorkshopName('a'.repeat(40))).toHaveLength(16)
    expect(sanitizeWorkshopName('\u200b\u200b')).toBe('Elf')
    expect(sanitizeWorkshopName(42)).toBe('Elf')
  })

  it('normalizes reader hosts into room keys', () => {
    expect(normalizeWorkshopRoom(' 192.168.10.36 ')).toBe('192.168.10.36')
    expect(normalizeWorkshopRoom('Reader-01.local')).toBe('reader-01.local')
    expect(normalizeWorkshopRoom('has space')).toBeNull()
    expect(normalizeWorkshopRoom('')).toBeNull()
  })
})
