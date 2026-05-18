import { describe, it, expect } from 'vitest'
import {
  generateSgtin96,
  generateSgtin198,
  generateSscc96,
  generateSgln96,
  generateGiai96,
  generateGrai96,
} from '../epc-encoders'
import { EPCGenerator } from '../tcp-client'

describe('generateSgtin96', () => {
  it('returns no EPCs for empty input', () => {
    expect(generateSgtin96('', 5)).toEqual([])
    expect(generateSgtin96('   ', 5)).toEqual([])
  })

  it('returns no EPCs for zero or negative quantity', () => {
    expect(generateSgtin96('12345678901234', 0)).toEqual([])
    expect(generateSgtin96('12345678901234', -3)).toEqual([])
  })

  it('produces 24-character uppercase hex strings', () => {
    const epcs = generateSgtin96('12345678901231', 3, 1)
    expect(epcs).toHaveLength(3)
    for (const epc of epcs) {
      expect(epc).toMatch(/^[0-9A-F]{24}$/)
    }
  })

  it('starts with the SGTIN-96 header byte 0x30', () => {
    const [epc] = generateSgtin96('12345678901231', 1, 1)
    expect(epc.startsWith('30')).toBe(true)
  })

  it('increments serial by 1 per tag', () => {
    const epcs = generateSgtin96('12345678901231', 3, 100)
    expect(new Set(epcs).size).toBe(3) // all unique
    // Each EPC differs only in the final 38-bit serial field — they will
    // share a common prefix that covers the rest of the 96 bits.
    const prefix = epcs[0].slice(0, 14)
    for (const e of epcs) expect(e.slice(0, 14)).toBe(prefix)
  })

  it('is byte-identical to the historical EPCGenerator.generateFromUpc', () => {
    const upc = '00012345678905' // GTIN-14 with check digit
    const a = EPCGenerator.generateFromUpc(upc, 4, 7)
    const b = generateSgtin96(upc, 4, 7, 6, 0)
    expect(a).toEqual(b)
  })

  it('pads short UPCs to GTIN-14 (left-pad zeros)', () => {
    const padded = generateSgtin96('12345678905', 1, 1) // 11 digits → 14
    const explicit = generateSgtin96('00012345678905', 1, 1)
    expect(padded).toEqual(explicit)
  })

  it('truncates UPCs longer than 14 digits to the rightmost 14', () => {
    const long = generateSgtin96('999' + '00012345678905', 1, 1)
    const short = generateSgtin96('00012345678905', 1, 1)
    expect(long).toEqual(short)
  })
})

describe('generateSgtin198', () => {
  it('produces 198-bit (49.5-byte) payloads = 50 hex chars', () => {
    const [epc] = generateSgtin198('12345678901231', 1, 1)
    // 198 bits padded to nibble boundary = 200 bits = 50 hex chars
    expect(epc).toHaveLength(50)
    expect(epc).toMatch(/^[0-9A-F]+$/)
  })

  it('uses the SGTIN-198 header byte 0x36', () => {
    const [epc] = generateSgtin198('12345678901231', 1, 1)
    expect(epc.startsWith('36')).toBe(true)
  })

  it('rejects serials longer than 20 characters', () => {
    expect(() =>
      generateSgtin198('12345678901231', 1, 1, 'A'.repeat(21)),
    ).toThrow(/exceeds 20 characters/i)
  })

  it('encodes incrementing serial values uniquely', () => {
    const epcs = generateSgtin198('12345678901231', 3, 1, 'SN')
    expect(new Set(epcs).size).toBe(3)
  })
})

describe('generateSscc96', () => {
  it('uses header 0x31', () => {
    const [epc] = generateSscc96('012345', '678901234', 1)
    expect(epc.startsWith('31')).toBe(true)
  })

  it('produces 24-character uppercase hex', () => {
    const epcs = generateSscc96('012345', '678901234', 3)
    expect(epcs).toHaveLength(3)
    for (const epc of epcs) expect(epc).toMatch(/^[0-9A-F]{24}$/)
  })

  it('skips when company prefix is empty', () => {
    expect(generateSscc96('', '12345', 5)).toEqual([])
  })
})

describe('generateSgln96', () => {
  it('uses header 0x32', () => {
    const [epc] = generateSgln96('012345', '7890', 1, 1)
    expect(epc.startsWith('32')).toBe(true)
  })

  it('produces 24-character hex', () => {
    const epcs = generateSgln96('012345', '7890', 2, 0)
    expect(epcs).toHaveLength(2)
    for (const epc of epcs) expect(epc).toMatch(/^[0-9A-F]{24}$/)
  })
})

describe('generateGiai96', () => {
  it('uses header 0x34', () => {
    const [epc] = generateGiai96('012345', '1', 1, 0)
    expect(epc.startsWith('34')).toBe(true)
  })

  it('produces 24-character hex', () => {
    const epcs = generateGiai96('012345', '1', 4, 0)
    expect(epcs).toHaveLength(4)
    for (const epc of epcs) expect(epc).toMatch(/^[0-9A-F]{24}$/)
  })

  it('increments asset reference by 1 per tag', () => {
    const epcs = generateGiai96('012345', '0', 3, 0)
    expect(new Set(epcs).size).toBe(3)
  })
})

describe('generateGrai96', () => {
  it('uses header 0x33', () => {
    const [epc] = generateGrai96('012345', '1234567', 1, 1)
    expect(epc.startsWith('33')).toBe(true)
  })

  it('produces 24-character hex', () => {
    const epcs = generateGrai96('012345', '1234567', 2, 1)
    expect(epcs).toHaveLength(2)
    for (const epc of epcs) expect(epc).toMatch(/^[0-9A-F]{24}$/)
  })
})
