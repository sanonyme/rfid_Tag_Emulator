import { describe, expect, it } from 'vitest'
import {
  TEMPE_V2_EXAMPLE,
  INDITEX_V2_EXAMPLE,
  TEMPE_V1_EXAMPLE,
  buildInditexUpc,
  decodeInditexEpc,
  encodeInditexEpc,
  generateInditexEpcs,
  incrementInditexSeed,
  parseTempeQrJson,
} from '../inditex-epc'

const TEMPE_V2_TAGS = [
  '1048C088004C3250027282210414F670',
  '1048C088004C3250027282210414F639',
  '1048C088004C3250027282210414F63F',
  '1048C088004C3250027282210414F636',
  '1048C088004C3250027282210414F63A',
  '1048C088004C3250027282210414F641',
]

const INDITEX_INV1 = [
  '1028C09E004A34B3470F820A19EF8548',
  '1028C09E004A34B3470F820A19EF8549',
  '1028C09E004A34B3470F820A19EF854A',
  '1028C09E004A34B3470F820A19EF854B',
  '1028C09E004A34B3470F820A19EF854C',
  '1028C09E004A34B3470F820A19EF854D',
  '1028C09E004A34B3470F820A19EF854E',
]

const INDITEX_INV0 = [
  '1028C01E004A34B3470F820A19EF854F',
  '1028C01E004A34B3470F820A19EF8550',
  '1028C01E004A34B3470F820A19EF8551',
  '1028C01E004A34B3470F820A19EF8552',
  '1028C01E004A34B3470F820A19EF8553',
  '1028C01E004A34B3470F820A19EF8554',
  '1028C01E004A34B3470F820A19EF8555',
]

const TEMPE_V1_FIRST = '09CA359DB64CFE401EE2ADE9992005E3'
const TEMPE_V1_SECOND = '09CA359DB64CFE401EE2ADEA992005E3'
const TEMPE_V1_LAST = '09CA359DB64CFE401EE2AE63992005E3'

describe('encodeInditexEpc V2', () => {
  it('round-trips the Tempe V2 decoded example', () => {
    expect(encodeInditexEpc(TEMPE_V2_EXAMPLE)).toBe('1048C088004C3250027282210414F641')
  })

  it('round-trips Inditex inventory 1 and 0 examples', () => {
    expect(encodeInditexEpc(INDITEX_V2_EXAMPLE)).toBe(INDITEX_INV1[0])
    expect(encodeInditexEpc({ ...INDITEX_V2_EXAMPLE, inventoryTag: 0, serial: 43384800591 })).toBe(
      INDITEX_INV0[0],
    )
  })

  it('builds the Tempe V2 UPC from QR product fields', () => {
    expect(buildInditexUpc(TEMPE_V2_EXAMPLE)).toBe('11253640100388')
  })
})

describe('decodeInditexEpc V2', () => {
  it('matches the Confluence decoded Tempe tag', () => {
    const decoded = decodeInditexEpc('1048C088004C3250027282210414F641')
    expect(decoded).toMatchObject({
      upc: '11253640100388',
      inventoryTag: 1,
      brand: 2,
      tagSupplierId: 4,
      color: 100,
      productType: 1,
      model: 1253,
      checkDigit: '8',
      version: 2,
      tagType: 4,
      quality: 640,
      size: 38,
    })
  })

  it('decodes inventory bit 9E vs 1E', () => {
    expect(decodeInditexEpc(INDITEX_INV1[0]).inventoryTag).toBe(1)
    expect(decodeInditexEpc(INDITEX_INV0[0]).inventoryTag).toBe(0)
    expect(decodeInditexEpc(INDITEX_INV1[0]).brand).toBe(1)
  })

  it('decodes every captured Tempe V2 tag as the same SKU', () => {
    for (const epc of TEMPE_V2_TAGS) {
      const decoded = decodeInditexEpc(epc)
      expect(decoded.upc).toBe('11253640100388')
      expect(decoded.brand).toBe(2)
      expect(decoded.version).toBe(2)
    }
  })
})

describe('generateInditexEpcs', () => {
  it('reproduces Inditex inventory 1 by incrementing the V2 serial', () => {
    expect(generateInditexEpcs(INDITEX_V2_EXAMPLE, 7)).toEqual(INDITEX_INV1)
  })

  it('reproduces Inditex inventory 0 from the first inv-0 serial', () => {
    expect(
      generateInditexEpcs({ ...INDITEX_V2_EXAMPLE, inventoryTag: 0, serial: 43384800591 }, 7),
    ).toEqual(INDITEX_INV0)
  })
})

describe('incrementInditexSeed', () => {
  it('increments last hex digits like the Inditex inventory examples', () => {
    expect(incrementInditexSeed(INDITEX_INV1[0], 7)).toEqual(INDITEX_INV1)
    expect(incrementInditexSeed(INDITEX_INV0[0], 7)).toEqual(INDITEX_INV0)
  })
})

describe('encodeInditexEpc V1', () => {
  it('round-trips the first Tempe V1 tag', () => {
    expect(encodeInditexEpc(TEMPE_V1_EXAMPLE)).toBe(TEMPE_V1_FIRST)
  })

  it('increments the mid-EPC serial (ADE9 → ADEA)', () => {
    const epcs = generateInditexEpcs(TEMPE_V1_EXAMPLE, 123)
    expect(epcs[0]).toBe(TEMPE_V1_FIRST)
    expect(epcs[1]).toBe(TEMPE_V1_SECOND)
    expect(epcs[122]).toBe(TEMPE_V1_LAST)
    expect(epcs).toHaveLength(123)
  })

  it('decodes packed model/quality/color/size from V1 bits', () => {
    const decoded = decodeInditexEpc(TEMPE_V1_FIRST)
    expect(decoded).toMatchObject({
      version: 1,
      brand: 14,
      productType: 4,
      model: 4605,
      quality: 584,
      color: 737,
      size: 24,
      tagSupplierId: 15,
      tagType: 1,
    })
  })
})

describe('parseTempeQrJson', () => {
  it('reads product fields and qty from a Tempe QR object', () => {
    const qr = parseTempeQrJson(
      JSON.stringify({
        '10': '6',
        '02': '2/1',
        '03': '1',
        '04': '1253',
        '05': '640',
        '06': '100',
        '07': '38',
        '20': '38',
      }),
    )
    expect(qr).toEqual({
      brand: 2,
      productType: 1,
      model: 1253,
      quality: 640,
      color: 100,
      size: 38,
      quantity: 6,
    })
  })
})
