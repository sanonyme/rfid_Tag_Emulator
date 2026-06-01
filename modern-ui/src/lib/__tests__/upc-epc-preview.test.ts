import { describe, expect, it } from 'vitest'
import { buildUpcEpcPreview } from '../upc-epc-preview'

describe('buildUpcEpcPreview', () => {
  it('returns empty preview for blank input', () => {
    expect(buildUpcEpcPreview('', '1', false).count).toBe(0)
  })

  it('expands a single UPC line', () => {
    const preview = buildUpcEpcPreview('00012345678905,3', '1', false)
    expect(preview.count).toBe(3)
    expect(preview.firstEpc).toHaveLength(24)
    expect(preview.lastEpc).toHaveLength(24)
    expect(preview.firstEpc).not.toBe(preview.lastEpc)
  })

  it('uses continued serials across lines when enabled', () => {
    const list = '00012345678905,2\n00012345678905,2'
    const perLine = buildUpcEpcPreview(list, '1', false)
    const continued = buildUpcEpcPreview(list, '1', true)
    expect(perLine.count).toBe(4)
    expect(continued.count).toBe(4)
    expect(perLine.firstEpc).toBe(continued.firstEpc)
    expect(perLine.lastEpc).not.toBe(continued.lastEpc)
  })
})
