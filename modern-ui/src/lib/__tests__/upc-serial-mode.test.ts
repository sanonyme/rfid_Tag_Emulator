import { describe, it, expect } from 'vitest'
import { expandUpcListToEpcs } from '../tcp-client'

const upcA = '00000000000001'

describe('expandUpcListToEpcs serial mode', () => {
  const sameUpcTwoLines = `${upcA},2\n${upcA},2`

  it('resets serial per UPC line when continue mode is off', () => {
    const perLine = expandUpcListToEpcs(sameUpcTwoLines, 1, false)
    expect(perLine).toHaveLength(4)
    expect(perLine[2].epc).toBe(perLine[0].epc)
  })

  it('continues serial across UPC lines when continue mode is on', () => {
    const perLine = expandUpcListToEpcs(sameUpcTwoLines, 1, false)
    const continued = expandUpcListToEpcs(sameUpcTwoLines, 1, true)
    expect(continued).toHaveLength(4)
    expect(continued[2].epc).not.toBe(perLine[2].epc)
  })
})
