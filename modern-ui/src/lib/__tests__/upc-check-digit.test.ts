import { describe, expect, it } from 'vitest'
import {
  analyzeUpcDigits,
  analyzeUpcListCheckDigits,
  extractUpcDigitsFromLine,
  getLineIndexAtCursor,
} from '../upc-check-digit'

describe('extractUpcDigitsFromLine', () => {
  it('reads digits before the first comma', () => {
    expect(extractUpcDigitsFromLine('00012345678905,5')).toBe('00012345678905')
    expect(extractUpcDigitsFromLine('00012345678905,5,CUSTOM')).toBe('00012345678905')
  })
})

describe('analyzeUpcDigits', () => {
  it('suggests a check digit at 13 digits', () => {
    const status = analyzeUpcDigits('0001234567890')
    expect(status.kind).toBe('hint13')
    if (status.kind === 'hint13') expect(status.calculatedCheck).toBe('5')
  })

  it('validates a correct 14-digit GTIN', () => {
    expect(analyzeUpcDigits('00012345678905').kind).toBe('valid14')
  })

  it('flags a wrong check digit at 14 digits', () => {
    const status = analyzeUpcDigits('00012345678900')
    expect(status.kind).toBe('invalid14')
    if (status.kind === 'invalid14') {
      expect(status.expected).toBe('5')
      expect(status.provided).toBe('0')
    }
  })

  it('ignores shorter inputs', () => {
    expect(analyzeUpcDigits('12345').kind).toBe('none')
  })

  it('warns when UPC is longer than 14 digits', () => {
    const status = analyzeUpcDigits('000012345678905')
    expect(status.kind).toBe('tooLong')
    if (status.kind === 'tooLong') {
      expect(status.digitCount).toBe(15)
      expect(status.checkValid).toBe(true)
    }
  })

  it('validates check digit on rightmost 14 when UPC is too long', () => {
    const status = analyzeUpcDigits('000012345678900')
    expect(status.kind).toBe('tooLong')
    if (status.kind === 'tooLong') {
      expect(status.checkValid).toBe(false)
      expect(status.expected).toBe('5')
      expect(status.provided).toBe('0')
    }
  })
})

describe('analyzeUpcListCheckDigits', () => {
  it('returns only lines with 13+ digit UPCs', () => {
    const rows = analyzeUpcListCheckDigits('12345,5\n00012345678905,2\n00012345678900,1')
    expect(rows.map((r) => r.lineNumber)).toEqual([2, 3])
    expect(rows[0]?.status.kind).toBe('valid14')
    expect(rows[1]?.status.kind).toBe('invalid14')
  })

  it('includes lines with UPCs longer than 14 digits', () => {
    const rows = analyzeUpcListCheckDigits('000012345678905,1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status.kind).toBe('tooLong')
    if (rows[0]?.status.kind === 'tooLong') {
      expect(rows[0].status.digitCount).toBe(15)
      expect(rows[0].status.checkValid).toBe(true)
    }
  })
})

describe('getLineIndexAtCursor', () => {
  it('maps cursor position to 1-based line numbers', () => {
    const text = 'a\nb\nc'
    expect(getLineIndexAtCursor(text, 0)).toBe(1)
    expect(getLineIndexAtCursor(text, 2)).toBe(2)
    expect(getLineIndexAtCursor(text, 4)).toBe(3)
  })
})
