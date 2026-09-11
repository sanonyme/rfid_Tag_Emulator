import { describe, expect, it } from 'vitest'
import { generateSgtin96, generateSscc96, generateSgtin198 } from '../epc-encoders'
import { encodeInditexEpc, INDITEX_V2_EXAMPLE, TEMPE_V2_EXAMPLE } from '../inditex-epc'
import { identifyEpcHex, summarizeEpcList } from '../epc-identify'

describe('identifyEpcHex', () => {
  it('labels SGTIN-96 from the header byte', () => {
    const [epc] = generateSgtin96('12345678901231', 1, 1)
    expect(identifyEpcHex(epc)).toEqual({ scheme: 'SGTIN-96', bits: 96 })
  })

  it('labels SSCC-96 and SGTIN-198', () => {
    const [sscc] = generateSscc96('012345', '1', 1, 0)
    expect(identifyEpcHex(sscc).scheme).toBe('SSCC-96')
    const [sgtin198] = generateSgtin198('00012345678905', 1, 1)
    expect(identifyEpcHex(sgtin198).scheme).toBe('SGTIN-198')
    expect(identifyEpcHex(sgtin198).bits).toBe(200)
  })

  it('labels Inditex / Tempe 128-bit tags', () => {
    expect(identifyEpcHex(encodeInditexEpc(INDITEX_V2_EXAMPLE)).scheme).toBe('Inditex V2')
    expect(identifyEpcHex(encodeInditexEpc(TEMPE_V2_EXAMPLE)).scheme).toBe('Tempe V2')
  })

  it('falls back to the header byte for unknown schemes', () => {
    expect(identifyEpcHex('AABBCCDD').scheme).toBe('Header 0xAA')
  })
})

describe('summarizeEpcList', () => {
  it('counts schemes, TID, and userdata', () => {
    const [epc] = generateSgtin96('12345678901231', 1, 1)
    const summary = summarizeEpcList(`${epc}\n${epc},E016AABB,DEADBEEF\nnot-hex\n`)
    expect(summary.valid).toBe(2)
    expect(summary.withTid).toBe(1)
    expect(summary.withUserdata).toBe(1)
    expect(summary.schemeCounts).toEqual([{ scheme: 'SGTIN-96', count: 2 }])
    expect(summary.rows).toHaveLength(2)
  })

  it('caps stored preview rows', () => {
    const lines = Array.from({ length: 20 }, (_, i) => generateSgtin96('12345678901231', 1, i + 1)[0])
    const summary = summarizeEpcList(lines.join('\n'), 5)
    expect(summary.valid).toBe(20)
    expect(summary.rows).toHaveLength(5)
    expect(summary.rowsTruncated).toBe(true)
  })
})
