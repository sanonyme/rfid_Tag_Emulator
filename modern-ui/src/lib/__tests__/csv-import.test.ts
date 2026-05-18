import { describe, it, expect } from 'vitest'
import { smartImport } from '../csv-import'

describe('smartImport (UPC mode)', () => {
  it('parses comma-separated UPC,Count,TID with a header', () => {
    const csv = ['UPC,Quantity,TID', '00012345678905,5,ABC', '00012345678906,3,XYZ'].join('\n')
    const { text, rows, hasHeader, delimiter } = smartImport(csv, 'upc')
    expect(delimiter).toBe(',')
    expect(hasHeader).toBe(true)
    expect(rows).toBe(2)
    expect(text).toBe('00012345678905,5,ABC\n00012345678906,3,XYZ')
  })

  it('reorders columns when the header is shuffled', () => {
    const csv = ['TID,Count,UPC', 'ABC,5,00012345678905'].join('\n')
    const { text } = smartImport(csv, 'upc')
    expect(text).toBe('00012345678905,5,ABC')
  })

  it('omits TID gracefully when the column is absent', () => {
    const csv = ['UPC,QTY', '00012345678905,5', '00012345678906,3'].join('\n')
    const { text } = smartImport(csv, 'upc')
    expect(text).toBe('00012345678905,5\n00012345678906,3')
  })

  it('detects tab delimiter (pasted from Excel)', () => {
    const csv = ['UPC\tCount', '00012345678905\t5'].join('\n')
    const { text, delimiter } = smartImport(csv, 'upc')
    expect(delimiter).toBe('\t')
    expect(text).toBe('00012345678905,5')
  })

  it('handles files without a header (assumes UPC,Count,TID order)', () => {
    const csv = '00012345678905,5,ABC\n00012345678906,3'
    const result = smartImport(csv, 'upc')
    expect(result.hasHeader).toBe(false)
    expect(result.text).toBe('00012345678905,5,ABC\n00012345678906,3')
  })

  it('drops blank rows', () => {
    const csv = 'UPC,Count\n00012345678905,5\n\n00012345678906,3\n   '
    const { text, rows } = smartImport(csv, 'upc')
    expect(rows).toBe(2)
    expect(text).toBe('00012345678905,5\n00012345678906,3')
  })

  it('ignores unknown extra columns', () => {
    const csv = ['SKU,Count,WarehouseCode,TID', '00012345678905,5,WH1,ABC'].join('\n')
    const { text } = smartImport(csv, 'upc')
    expect(text).toBe('00012345678905,5,ABC')
  })
})

describe('smartImport (EPC mode)', () => {
  it('parses an EPC-only column header', () => {
    const csv = ['EPC', '3034ABC', '3034DEF'].join('\n')
    const { text } = smartImport(csv, 'epc')
    expect(text).toBe('3034ABC\n3034DEF')
  })

  it('parses EPC,TID with a header in either order', () => {
    const a = smartImport(['EPC,TID', '3034ABC,T1'].join('\n'), 'epc').text
    const b = smartImport(['TID,EPC', 'T1,3034ABC'].join('\n'), 'epc').text
    expect(a).toBe('3034ABC,T1')
    expect(b).toBe('3034ABC,T1')
  })

  it('treats `Tag` as an alias for EPC', () => {
    const { text } = smartImport(['Tag,TID', '3034ABC,T1'].join('\n'), 'epc')
    expect(text).toBe('3034ABC,T1')
  })

  it('falls back to position order when no header is detected', () => {
    const csv = '3034ABC,T1\n3034DEF'
    const { text, hasHeader } = smartImport(csv, 'epc')
    expect(hasHeader).toBe(false)
    expect(text).toBe('3034ABC,T1\n3034DEF')
  })
})

describe('smartImport (edge cases)', () => {
  it('returns empty result for empty input', () => {
    expect(smartImport('', 'upc').rows).toBe(0)
    expect(smartImport('\n\n', 'epc').rows).toBe(0)
  })

  it('only treats first row as a header if it includes the primary column for the kind', () => {
    // Here the header includes Count but not UPC → must NOT be skipped.
    const csv = 'Count,TID\n5,ABC'
    const result = smartImport(csv, 'upc')
    expect(result.hasHeader).toBe(false)
    expect(result.rows).toBe(2)
  })
})
