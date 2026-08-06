import { describe, it, expect } from 'vitest'
import { countEmittedTags, validateTagList } from '../tag-list-validation'

describe('validateTagList (UPC)', () => {
  it('returns zero counts for empty input', () => {
    const result = validateTagList('', 'upc')
    expect(result.totalTags).toBe(0)
    expect(result.validLines).toBe(0)
    expect(result.invalidLines).toBe(0)
    expect(result.nonBlankLines).toBe(0)
    expect(result.lines).toEqual([])
  })

  it('counts emitted EPCs from a healthy list', () => {
    const result = validateTagList('00012345678905,5\n00012345678906,3,ABCD', 'upc')
    expect(result.totalTags).toBe(8)
    expect(result.validLines).toBe(2)
    expect(result.invalidLines).toBe(0)
  })

  it('skips blank lines but does not penalise them', () => {
    const result = validateTagList('\n00012345678905,5\n\n\n00012345678906,3\n', 'upc')
    expect(result.nonBlankLines).toBe(2)
    expect(result.lines).toHaveLength(0)
    expect(result.totalTags).toBe(8)
  })

  it('flags non-digit UPC values', () => {
    const result = validateTagList('ABC,5', 'upc')
    expect(result.invalidLines).toBe(1)
    expect(result.lines[0].ok).toBe(false)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/digits only/i)
  })

  it('accepts UPC longer than 14 digits', () => {
    const result = validateTagList('123456789012345,1', 'upc')
    expect(result.invalidLines).toBe(0)
    expect(result.validLines).toBe(1)
    expect(result.totalTags).toBe(1)
  })

  it('flags missing count', () => {
    const result = validateTagList('00012345678905', 'upc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/count is required/i)
  })

  it('flags zero or negative counts', () => {
    expect(validateTagList('00012345678905,0', 'upc').invalidLines).toBe(1)
    expect(validateTagList('00012345678905,-1', 'upc').invalidLines).toBe(1)
  })

  it('flags non-hex TIDs', () => {
    const result = validateTagList('00012345678905,1,ZZZ', 'upc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/must be hex/i)
  })

  it('numbers lines from the source text, not the trimmed list', () => {
    const result = validateTagList('\nGOOD\n00012345678905,5\n', 'upc')
    // Lines: 1=blank (skipped), 2="GOOD" (line 2, invalid), 3=valid (line 3)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].lineNumber).toBe(2)
    expect(result.validLines).toBe(1)
  })
})

describe('validateTagList (EPC)', () => {
  it('accepts simple hex EPCs', () => {
    const result = validateTagList('3034ABCD\n3034ABCE', 'epc')
    expect(result.totalTags).toBe(2)
    expect(result.invalidLines).toBe(0)
  })

  it('counts each EPC as one tag', () => {
    expect(countEmittedTags('3034ABCD\n3034ABCE\n3034ABCF', 'epc')).toBe(3)
  })

  it('accepts EPC,TID pairs', () => {
    const result = validateTagList('3034ABCD,DEADBEEF', 'epc')
    expect(result.invalidLines).toBe(0)
  })

  it('accepts EPC,TID,userdata triples', () => {
    const result = validateTagList('3034ABCD,DEADBEEF,CAFE', 'epc')
    expect(result.invalidLines).toBe(0)
  })

  it('flags non-hex userdata', () => {
    const result = validateTagList('3034ABCD,DEADBEEF,ZZZZ', 'epc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/userdata/i)
  })

  it('flags non-hex EPCs', () => {
    const result = validateTagList('not hex!', 'epc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/must be hex/i)
  })

  it('flags EPCs with an odd number of chars', () => {
    const result = validateTagList('30ABC', 'epc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/even/i)
  })

  it('flags non-hex TIDs even when EPC is fine', () => {
    const result = validateTagList('3034ABCD,ZZZ', 'epc')
    expect(result.invalidLines).toBe(1)
    if (!result.lines[0].ok) expect(result.lines[0].error).toMatch(/tid/i)
  })

  it('mixes valid and invalid lines and reports both totals', () => {
    const result = validateTagList('3034ABCD\noops\n3034BEEF', 'epc')
    expect(result.totalTags).toBe(2)
    expect(result.validLines).toBe(2)
    expect(result.invalidLines).toBe(1)
  })
})
