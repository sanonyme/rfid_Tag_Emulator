import { describe, it, expect } from 'vitest'
import { buildUpcEpcPreviewSummary } from '../upc-epc-preview'

describe('buildUpcEpcPreviewSummary', () => {
  it('does not materialize every EPC for a large UPC count', () => {
    const summary = buildUpcEpcPreviewSummary('00012345678905,250000', '1', false)
    expect(summary.count).toBe(250_000)
    expect(summary.firstEpc).toMatch(/^[0-9A-F]{24}$/)
    expect(summary.lastEpc).toMatch(/^[0-9A-F]{24}$/)
    expect(summary.firstEpc).not.toBe(summary.lastEpc)
  })
})
