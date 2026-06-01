import { describe, expect, it } from 'vitest'
import { buildUpcEpcPreview, buildUpcEpcPreviewSummary } from '../upc-epc-preview'

describe('buildUpcEpcPreview', () => {
  it('returns empty preview for blank input', () => {
    expect(buildUpcEpcPreview('', '1', false).count).toBe(0)
    expect(buildUpcEpcPreviewSummary('', '1', false).count).toBe(0)
  })

  it('expands a single UPC line', () => {
    const preview = buildUpcEpcPreview('00012345678905,3', '1', false)
    const summary = buildUpcEpcPreviewSummary('00012345678905,3', '1', false)
    expect(preview.count).toBe(3)
    expect(summary.count).toBe(preview.count)
    expect(summary.firstEpc).toBe(preview.firstEpc)
    expect(summary.lastEpc).toBe(preview.lastEpc)
    expect(preview.firstEpc).toHaveLength(24)
    expect(preview.lastEpc).toHaveLength(24)
    expect(preview.firstEpc).not.toBe(preview.lastEpc)
  })

  it('uses continued serials across lines when enabled', () => {
    const list = '00012345678905,2\n00012345678905,2'
    const perLine = buildUpcEpcPreview(list, '1', false)
    const continued = buildUpcEpcPreview(list, '1', true)
    const perLineSummary = buildUpcEpcPreviewSummary(list, '1', false)
    const continuedSummary = buildUpcEpcPreviewSummary(list, '1', true)
    expect(perLine.count).toBe(4)
    expect(continued.count).toBe(4)
    expect(perLineSummary).toEqual({
      count: perLine.count,
      firstEpc: perLine.firstEpc,
      lastEpc: perLine.lastEpc,
    })
    expect(continuedSummary).toEqual({
      count: continued.count,
      firstEpc: continued.firstEpc,
      lastEpc: continued.lastEpc,
    })
    expect(perLine.firstEpc).toBe(continued.firstEpc)
    expect(perLine.lastEpc).not.toBe(continued.lastEpc)
  })
})
