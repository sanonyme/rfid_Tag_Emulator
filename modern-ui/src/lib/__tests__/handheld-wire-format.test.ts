import { describe, it, expect } from 'vitest'
import { formatHandheldBroadcastLine, formatHandheldBroadcastPayload } from '../handheld-wire-format'

describe('handheld wire format', () => {
  it('formats a single CRLF-terminated JSON line', () => {
    const line = formatHandheldBroadcastLine(
      { epc: '3034ABCD', tid: 'E280', rssi: '-40' },
      '2026-06-19T12:00:00',
      70,
    )
    expect(line.endsWith('\r\n')).toBe(true)
    const parsed = JSON.parse(line.trim())
    expect(parsed.epc).toBe('3034ABCD')
    expect(parsed.tid).toBe('E280')
    expect(parsed.date).toBe('2026-06-19T12:00:00')
    expect(parsed.rssi).toBe(70)
  })

  it('defaults tid to epc when omitted', () => {
    const line = formatHandheldBroadcastLine({ epc: 'ABC' }, 'now', 55)
    expect(JSON.parse(line.trim()).tid).toBe('ABC')
  })

  it('joins multiple tag lines', () => {
    const payload = formatHandheldBroadcastPayload(
      [{ epc: 'A' }, { epc: 'B' }],
      't',
      () => 60,
    )
    expect(payload.split('\r\n').filter(Boolean)).toHaveLength(2)
  })
})
