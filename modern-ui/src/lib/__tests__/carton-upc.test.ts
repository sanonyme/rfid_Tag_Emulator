import { describe, expect, it } from 'vitest'
import { inspectLinesToUpcLines } from '../carton-upc'
import type { InspectLine } from '@/components/database/db-inspect'

function line(barcode: string, quantity: number, itemId = barcode): InspectLine {
  return { itemId, quantity, barcode, label: barcode }
}

describe('inspectLinesToUpcLines', () => {
  it('formats expected items as UPC,QTY lines', () => {
    expect(inspectLinesToUpcLines([line('123456789012', 5), line('999', 2)])).toEqual({
      text: '123456789012,5\n999,2',
      itemCount: 2,
      tagCount: 7,
      skipped: 0,
    })
  })

  it('merges duplicate barcodes', () => {
    expect(inspectLinesToUpcLines([line('111', 2), line('111', 3)])).toEqual({
      text: '111,5',
      itemCount: 1,
      tagCount: 5,
      skipped: 0,
    })
  })

  it('skips non-numeric barcodes and empty lines', () => {
    expect(
      inspectLinesToUpcLines([
        line('SKU-RED', 4),
        line('', 1),
        line('00000000000001', 8),
      ]),
    ).toEqual({
      text: '00000000000001,8',
      itemCount: 1,
      tagCount: 8,
      skipped: 2,
    })
  })

  it('treats missing quantity as 1', () => {
    expect(inspectLinesToUpcLines([line('42', 0)])).toEqual({
      text: '42,1',
      itemCount: 1,
      tagCount: 1,
      skipped: 0,
    })
  })
})
