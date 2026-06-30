import { describe, it, expect } from 'vitest'
import { countHandheldRecipeTags, iterateHandheldTags } from '../handheld-tag-iterate'

describe('iterateHandheldTags', () => {
  it('matches count for a large UPC quantity without materializing all tags', () => {
    const recipe = {
      upcList: '00012345678905,2500',
      epcList: '',
      startSerial: '1',
      rssi: '-50',
      serialContinuesAcrossUpcLines: false,
    }
    expect(countHandheldRecipeTags(recipe)).toBe(2500)
    let n = 0
    for (const _tag of iterateHandheldTags(recipe)) {
      n++
    }
    expect(n).toBe(2500)
  })

  it('includes direct EPC lines', () => {
    const recipe = {
      upcList: '',
      epcList: '3034ABCD\n3034ABCE',
      startSerial: '1',
      rssi: '-50',
      serialContinuesAcrossUpcLines: false,
    }
    expect(countHandheldRecipeTags(recipe)).toBe(2)
    const tags = [...iterateHandheldTags(recipe)]
    expect(tags.map((t) => t.epc)).toEqual(['3034ABCD', '3034ABCE'])
  })
})
