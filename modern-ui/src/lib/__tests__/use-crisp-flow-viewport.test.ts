import { describe, it, expect } from 'vitest'
import { commitFlowCrispRaster, snapViewportPixels } from '../use-crisp-flow-viewport'

describe('use-crisp-flow-viewport helpers', () => {
  it('snaps fractional x and y viewport coordinates to integer pixels while preserving exact zoom', () => {
    const res = snapViewportPixels({ x: 142.3849, y: -58.9123, zoom: 1.3725 })
    expect(res.changed).toBe(true)
    expect(res.snapped).toEqual({ x: 142, y: -59, zoom: 1.3725 })
  })

  it('reports changed=false when x and y are already integer-aligned within epsilon', () => {
    const vp = { x: 120.002, y: -44.001, zoom: 0.85 }
    const res = snapViewportPixels(vp)
    expect(res.changed).toBe(false)
    expect(res.snapped).toBe(vp)
  })

  it('toggles data-rf-raster between 0 and 1 on the nested .react-flow element', () => {
    const wrapper = document.createElement('div')
    const flow = document.createElement('div')
    flow.className = 'react-flow zeus-crisp-flow'
    wrapper.appendChild(flow)

    commitFlowCrispRaster(wrapper)
    expect(flow.dataset.rfRaster).toBe('1')

    commitFlowCrispRaster(wrapper)
    expect(flow.dataset.rfRaster).toBe('0')

    commitFlowCrispRaster(flow)
    expect(flow.dataset.rfRaster).toBe('1')
  })

  it('is a safe no-op when container is null or has no .react-flow node', () => {
    expect(() => commitFlowCrispRaster(null)).not.toThrow()
    const empty = document.createElement('div')
    expect(() => commitFlowCrispRaster(empty)).not.toThrow()
    expect(empty.dataset.rfRaster).toBeUndefined()
  })
})
