import { describe, expect, it } from 'vitest'
import { CREWS, ROOMS, canEnter, canModerate, eventActive, isRoom, mergeBag, parseClientCommand, parseLiveEvent, parseServerNotice, type Identity } from '../workshop-cloud-model'
import { newProfile } from '../workshop-profile'

const guest: Identity = { userId: null, name: 'Guest', crew: null, king: null, titles: [] }
const king: Identity = { ...guest, userId: '00000000-0000-0000-0000-000000000001', crew: 'VSBL', king: 'VSBL' }
describe('cloud Workshop rules', () => {
  it('uses stable crew and room slugs with an always-open General', () => {
    expect(CREWS).toEqual(['VSBL','EDGE','QA','UI','SUPPORT','CNCT','ANEXYA_LOVER'])
    expect(ROOMS.map(r => r.id)).toEqual(['anexya-general','vsbl','edge','support','cnct','qa','ui'])
    expect(isRoom('192.168.1.1')).toBe(false)
    expect(canEnter(guest,'anexya-general')).toBe(true)
    expect(canEnter(king,'vsbl')).toBe(true)
    expect(canEnter({ ...king, crew: 'EDGE' },'vsbl')).toBe(false)
    expect(canEnter(guest,'vsbl',200,100)).toBe(true)
    expect(canEnter(guest,'vsbl',100,200)).toBe(false)
  })
  it('never gives a guest or another crew King moderation rights', () => {
    expect(canModerate(king,'vsbl')).toBe(true)
    expect(canModerate(king,'edge')).toBe(false)
    expect(canModerate(king,'anexya-general')).toBe(false)
    expect(canModerate({ ...guest, king: 'VSBL' },'vsbl')).toBe(false)
  })
  it('merges bag UIDs once, with newer timestamps winning', () => {
    const entry = { uid: 'abcdefghij', item: 'candy-cane', at: 10, from: 'present' as const }
    expect(mergeBag([entry], [entry, { ...entry, at: 20 }])).toEqual([{ ...entry, at: 20 }])
    expect(mergeBag([entry], [{ ...entry, at: 1 }])).toEqual([entry])
    expect(newProfile().daily.last).toBe(null)
  })
  it('opens and closes event windows without executable code', () => {
    const event = parseLiveEvent({ id: 'santa', title: 'Santa', body: '', startAt: '2026-10-01T00:00:00Z', endAt: '2026-10-08T00:00:00Z', enabled: true, kind: 'opt-in', metric: 'given', target: 1, reward: null, crews: ['VSBL'], optIn: true, javascript: 'ignored' })!
    expect(event).not.toHaveProperty('javascript')
    expect(eventActive(event,'VSBL', Date.parse(event.startAt))).toBe(true)
    expect(eventActive(event,'EDGE', Date.parse(event.startAt))).toBe(false)
    expect(eventActive(event,'VSBL', Date.parse(event.endAt))).toBe(false)
    expect(eventActive({ ...event, enabled: false },'VSBL',Date.parse(event.startAt))).toBe(false)
    expect(parseLiveEvent({ ...event, metric: 'execute' })).toBeNull()
    expect(parseLiveEvent({ ...event, reward: { item: 'unknown-item' } })).toBeNull()
    expect(parseLiveEvent({ ...event, kind: 'announcement', metric: undefined, target: undefined })?.kind).toBe('announcement')
  })
  it('rebuilds socket envelopes, ignoring unknown fields and rejecting malformed commands', () => {
    expect(parseClientCommand({ op: 'join', room: 'vsbl', king: true })).toEqual({ op: 'join', room: 'vsbl' })
    expect(parseClientCommand({ op: 'join', room: 'home.abcdefgh' })).toBeNull()
    expect(parseClientCommand({ op: 'moderate', subject: 'x', action: 'allow' })).toBeNull()
    expect(parseClientCommand({ op: 'packet', message: { t: 'snow', id: 'abcdefgh', seq: 1, x: NaN, dir: 1 } })).toBeNull()
    expect(parseServerNotice({ op: 'joined', room: 'vsbl', identity: { ...guest, king: 'VSBL' } })).toEqual({ op: 'joined', room: 'vsbl', identity: guest, tree: {} })
    expect(parseServerNotice({ op: 'dm', message: { from: 'abcdefgh', to: 'ijklmnop', name: 'Elf', text: 'Hi', at: 1, token: 'secret' } })).not.toHaveProperty('message.token')
  })
})
