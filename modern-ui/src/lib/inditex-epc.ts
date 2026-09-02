/**
 * Inditex / Tempe proprietary 128-bit (32 hex) EPCs.
 *
 * These are not GS1 SGTIN-96. Edge decodes them with IND11 (version in bits
 * 0–4), IND13 (V1) and IND14 (V2). Brand 1 = Inditex, brand 2 = Tempe.
 *
 * V2 layout (Java substring end exclusive):
 *   0–5 version, 5–11 brand, 13–17 productType, 24–25 inventory,
 *   25–31 supplier, 40–47 size, 47–57 color, 57–67 quality, 67–81 model,
 *   84–89 tagType, 89–128 serial.
 *
 * V2 inventoryTag 0 is an alarm tag in IND03_ProcessTags: it is withheld from
 * pack validation and only attached on finish (IND31) as inventoryTag=0.
 * V1 has no inventory bit (IND13 does not set the property).
 *
 * V1 layout:
 *   0–5 version, 5–11 brand, 13–17 productType, 17–57 packed
 *   model(4)+quality(3)+color(3)+size(2), 80–96 serial, 118–123 supplier,
 *   127–128 tagType.
 *
 * Reserved bits are filled from captured Tempe/Inditex examples so generated
 * tags decode the same way as production tags.
 */

import { EPCDecoder } from './decoder'

export type InditexEpcVersion = 1 | 2
export type InditexBrandName = 'inditex' | 'tempe'

export const INDITEX_BRAND_ID: Record<InditexBrandName, number> = {
  inditex: 1,
  tempe: 2,
}

export const INDITEX_EPC_HEX_LENGTH = 32

/** Reserved fields copied from production V2 tags (Tempe + Inditex examples). */
const V2_RESERVED = {
  bits11to13: 1,
  bits17to24: 64,
  bits31to40: 0,
  bits81to84: 0,
} as const

/** Reserved fields copied from the Team Krian V1 Tempe example. */
const V1_RESERVED = {
  bits11to13: 1,
  bits57to80: 0x401ee2,
  bits96to118: 0x264801,
  bits123to127: 1,
} as const

export interface InditexEpcFields {
  version: InditexEpcVersion
  brand: number
  productType: number
  model: number
  quality: number
  color: number
  size: number
  inventoryTag: 0 | 1
  tagSupplierId: number
  tagType: number
  serial: number
}

export interface DecodedInditexEpc extends InditexEpcFields {
  epc: string
  upc: string
  checkDigit: string
}

export const TEMPE_V2_EXAMPLE: InditexEpcFields = {
  version: 2,
  brand: 2,
  productType: 1,
  model: 1253,
  quality: 640,
  color: 100,
  size: 38,
  inventoryTag: 1,
  tagSupplierId: 4,
  tagType: 4,
  serial: 141802403393,
}

export const INDITEX_V2_EXAMPLE: InditexEpcFields = {
  version: 2,
  brand: 1,
  productType: 1,
  model: 3615,
  quality: 410,
  color: 105,
  size: 37,
  inventoryTag: 1,
  tagSupplierId: 15,
  tagType: 4,
  serial: 43384800584,
}

export const TEMPE_V1_EXAMPLE: InditexEpcFields = {
  version: 1,
  brand: 14,
  productType: 4,
  model: 4605,
  quality: 584,
  color: 737,
  size: 24,
  inventoryTag: 0,
  tagSupplierId: 15,
  tagType: 1,
  serial: 44521,
}

function padDigits(value: number, width: number): string {
  const n = Math.max(0, Math.floor(value))
  return String(n).padStart(width, '0')
}

function toBits(value: number, width: number): string {
  const n = Math.floor(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`bit field cannot be negative`)
  }
  const max = 2 ** width - 1
  if (n > max) {
    throw new Error(`value ${n} does not fit in ${width} bits`)
  }
  return n.toString(2).padStart(width, '0')
}

function bitsToHex(bits: string): string {
  if (bits.length !== 128) {
    throw new Error(`expected 128 bits, got ${bits.length}`)
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16).toUpperCase()
  }
  return hex
}

function hexToBits(hex: string): string {
  const cleaned = hex.trim().split(',')[0]?.replace(/[^0-9a-fA-F]/g, '') ?? ''
  if (cleaned.length !== INDITEX_EPC_HEX_LENGTH) {
    throw new Error(`Inditex/Tempe EPC must be ${INDITEX_EPC_HEX_LENGTH} hex chars`)
  }
  return BigInt(`0x${cleaned}`).toString(2).padStart(128, '0')
}

function sliceInt(bits: string, start: number, end: number): number {
  return parseInt(bits.slice(start, end), 2)
}

/**
 * UPC used by Edge: productType + model(4) + quality(3) + color(3) + size(2)
 * plus a GS1 check digit (IND12 / IND15).
 */
export function buildInditexUpc(fields: Pick<InditexEpcFields, 'productType' | 'model' | 'quality' | 'color' | 'size'>): string {
  const body =
    String(Math.max(0, Math.floor(fields.productType))) +
    padDigits(fields.model, 4) +
    padDigits(fields.quality, 3) +
    padDigits(fields.color, 3) +
    padDigits(fields.size, 2)
  const checkDigit = EPCDecoder.calculateCheckDigit(body)
  return body + checkDigit
}

export function encodeInditexEpc(fields: InditexEpcFields): string {
  if (fields.version === 1) {
    const mqc = Number(
      padDigits(fields.model, 4) +
        padDigits(fields.quality, 3) +
        padDigits(fields.color, 3) +
        padDigits(fields.size, 2),
    )
    const bits =
      toBits(1, 5) +
      toBits(fields.brand, 6) +
      toBits(V1_RESERVED.bits11to13, 2) +
      toBits(fields.productType, 4) +
      toBits(mqc, 40) +
      toBits(V1_RESERVED.bits57to80, 23) +
      toBits(fields.serial, 16) +
      toBits(V1_RESERVED.bits96to118, 22) +
      toBits(fields.tagSupplierId, 5) +
      toBits(V1_RESERVED.bits123to127, 4) +
      toBits(fields.tagType, 1)
    return bitsToHex(bits)
  }

  const bits =
    toBits(2, 5) +
    toBits(fields.brand, 6) +
    toBits(V2_RESERVED.bits11to13, 2) +
    toBits(fields.productType, 4) +
    toBits(V2_RESERVED.bits17to24, 7) +
    toBits(fields.inventoryTag, 1) +
    toBits(fields.tagSupplierId, 6) +
    toBits(V2_RESERVED.bits31to40, 9) +
    toBits(fields.size, 7) +
    toBits(fields.color, 10) +
    toBits(fields.quality, 10) +
    toBits(fields.model, 14) +
    toBits(V2_RESERVED.bits81to84, 3) +
    toBits(fields.tagType, 5) +
    toBits(fields.serial, 39)
  return bitsToHex(bits)
}

export function decodeInditexEpc(hex: string): DecodedInditexEpc {
  const epc = hex.trim().split(',')[0]?.replace(/[^0-9a-fA-F]/g, '').toUpperCase() ?? ''
  const bits = hexToBits(epc)
  const version = sliceInt(bits, 0, 5) as InditexEpcVersion
  if (version !== 1 && version !== 2) {
    throw new Error(`unsupported Inditex/Tempe version ${version}`)
  }

  if (version === 1) {
    const productType = sliceInt(bits, 13, 17)
    const packed = sliceInt(bits, 17, 57).toString().padStart(12, '0')
    const model = parseInt(packed.slice(0, 4), 10)
    const quality = parseInt(packed.slice(4, 7), 10)
    const color = parseInt(packed.slice(7, 10), 10)
    const size = parseInt(packed.slice(10, 12), 10)
    const fields: InditexEpcFields = {
      version: 1,
      brand: sliceInt(bits, 5, 11),
      productType,
      model,
      quality,
      color,
      size,
      inventoryTag: 0,
      tagSupplierId: sliceInt(bits, 118, 123),
      tagType: sliceInt(bits, 127, 128),
      serial: sliceInt(bits, 80, 96),
    }
    const upc = buildInditexUpc(fields)
    return { ...fields, epc, upc, checkDigit: upc.slice(-1) }
  }

  const fields: InditexEpcFields = {
    version: 2,
    brand: sliceInt(bits, 5, 11),
    productType: sliceInt(bits, 13, 17),
    model: sliceInt(bits, 67, 81),
    quality: sliceInt(bits, 57, 67),
    color: sliceInt(bits, 47, 57),
    size: sliceInt(bits, 40, 47),
    inventoryTag: sliceInt(bits, 24, 25) as 0 | 1,
    tagSupplierId: sliceInt(bits, 25, 31),
    tagType: sliceInt(bits, 84, 89),
    serial: sliceInt(bits, 89, 128),
  }
  const upc = buildInditexUpc(fields)
  return { ...fields, epc, upc, checkDigit: upc.slice(-1) }
}

export function generateInditexEpcs(base: InditexEpcFields, count: number): string[] {
  const qty = Math.floor(count)
  if (qty <= 0) return []
  const maxSerial = base.version === 1 ? 2 ** 16 - 1 : 2 ** 39 - 1
  if (base.serial + qty - 1 > maxSerial) {
    throw new Error(`serial ${base.serial} + count ${qty} overflows the ${base.version === 1 ? 16 : 39}-bit serial field`)
  }
  const epcs: string[] = []
  for (let i = 0; i < qty; i++) {
    epcs.push(encodeInditexEpc({ ...base, serial: base.serial + i }))
  }
  return epcs
}

/** Increment the 128-bit hex EPC as an integer (doc: "increment last digits"). */
export function incrementInditexSeed(seedHex: string, count: number): string[] {
  const qty = Math.floor(count)
  if (qty <= 0) return []
  const cleaned = seedHex.trim().split(',')[0]?.replace(/[^0-9a-fA-F]/g, '').toUpperCase() ?? ''
  if (cleaned.length !== INDITEX_EPC_HEX_LENGTH) {
    throw new Error(`seed EPC must be ${INDITEX_EPC_HEX_LENGTH} hex chars`)
  }
  const start = BigInt(`0x${cleaned}`)
  const epcs: string[] = []
  for (let i = 0n; i < BigInt(qty); i++) {
    epcs.push((start + i).toString(16).toUpperCase().padStart(INDITEX_EPC_HEX_LENGTH, '0'))
  }
  return epcs
}

export interface ParsedTempeQr {
  brand?: number
  productType?: number
  model?: number
  quality?: number
  color?: number
  size?: number
  quantity?: number
}

function qrNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string' && value.trim() && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10)
  }
  return undefined
}

/** Parse a Tempe/Inditex carton QR JSON object (keys 03–07, 10). */
export function parseTempeQrJson(text: string): ParsedTempeQr {
  const parsed = JSON.parse(text) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('QR payload must be a JSON object')
  }
  const sectionType = parsed['02']
  const sectionBrand =
    typeof sectionType === 'string' ? qrNumber(sectionType.split('/')[0]) : qrNumber(sectionType)

  return {
    brand: sectionBrand,
    productType: qrNumber(parsed['03']),
    model: qrNumber(parsed['04']),
    quality: qrNumber(parsed['05']),
    color: qrNumber(parsed['06']),
    size: qrNumber(parsed['07'] ?? parsed['20']),
    quantity: qrNumber(parsed['10'] ?? parsed['09']),
  }
}

export function brandNameFromId(brand: number): InditexBrandName | null {
  if (brand === INDITEX_BRAND_ID.inditex) return 'inditex'
  if (brand === INDITEX_BRAND_ID.tempe) return 'tempe'
  return null
}
