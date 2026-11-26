import { describe, expect, it } from 'vitest'
import { EPCDecoder } from '../decoder'
import {
  buildRandomItemBarcodeSql,
  generateRandomGtin14,
  generateRandomUpcLines,
} from '../random-upc'

describe('generateRandomGtin14', () => {
  it('returns a 14-digit GTIN with a valid check digit', () => {
    let i = 0
    const sequence = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05, 0.15, 0.25, 0.35]
    const gtin = generateRandomGtin14(() => sequence[i++ % sequence.length])
    expect(gtin).toHaveLength(14)
    expect(gtin).toMatch(/^\d{14}$/)
    const body = gtin.slice(0, 13)
    expect(gtin.slice(-1)).toBe(EPCDecoder.calculateCheckDigit(body))
  })
})

describe('generateRandomUpcLines', () => {
  it('formats N unique UPCs with the given count', () => {
    let call = 0
    const random = () => {
      // Slowly changing stream so successive GTINs differ.
      call += 1
      return ((call * 17) % 100) / 100
    }
    const result = generateRandomUpcLines(3, 5, random)
    expect(result.source).toBe('generated')
    expect(result.itemCount).toBe(3)
    expect(result.tagCount).toBe(15)
    const lines = result.text.split('\n')
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      const [upc, count] = line.split(',')
      expect(upc).toMatch(/^\d{14}$/)
      expect(count).toBe('5')
      expect(upc.slice(-1)).toBe(EPCDecoder.calculateCheckDigit(upc.slice(0, 13)))
    }
    expect(new Set(lines.map((l) => l.split(',')[0])).size).toBe(3)
  })

  it('clamps invalid counts to sane defaults', () => {
    const result = generateRandomUpcLines(0, -2, () => 0.42)
    expect(result.itemCount).toBe(1)
    expect(result.text.split(',')[1]).toBe('1')
  })
})

describe('buildRandomItemBarcodeSql', () => {
  it('asks MySQL for distinct numeric barcodes in random order', () => {
    const sql = buildRandomItemBarcodeSql(7)
    expect(sql).toContain('FROM item')
    expect(sql).toContain('ORDER BY RAND()')
    expect(sql).toContain('LIMIT 7')
    expect(sql).toContain("REGEXP '^[0-9]{1,14}$'")
  })
})
