import { describe, expect, it } from 'vitest'
import { definedItemsToUpcLines } from '../defined-items'

describe('definedItemsToUpcLines', () => {
  it('formats barcodes as UPC,Count lines', () => {
    expect(
      definedItemsToUpcLines([{ barcode: '123' }, { barcode: '456789012345' }], 3),
    ).toBe('123,3\n456789012345,3')
  })

  it('defaults count to 1 when invalid', () => {
    expect(definedItemsToUpcLines([{ barcode: '99' }], 0)).toBe('99,1')
  })
})
