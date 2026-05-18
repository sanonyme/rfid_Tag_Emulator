/**
 * EPC encoders for the common GS1 EPC TDS schemes.
 *
 * All encoders follow the bit layouts from the GS1 EPC Tag Data Standard
 * (TDS). They produce uppercase hex strings that can be written into an EPC
 * memory bank exactly as-is.
 *
 * Partition layouts (company prefix length → partition value, prefix bits,
 * other bits) are encoded in {@link SGTIN_PARTITIONS}, {@link SSCC_PARTITIONS},
 * {@link SGLN_PARTITIONS} and {@link GRAI_PARTITIONS}. They match Table 14-1
 * of the TDS spec (96-bit family).
 *
 * NOTE: GIAI-96 has a different format: only a company prefix + individual
 * asset reference number, with the bit width of the company prefix selected
 * by partition. We reuse the same SGTIN partition values (the bit-widths
 * match the spec) but pad the second field to 42 bits.
 */

export type EpcScheme =
  | 'sgtin-96'
  | 'sgtin-198'
  | 'sscc-96'
  | 'sgln-96'
  | 'giai-96'
  | 'grai-96'

const HEADERS = {
  'sgtin-96': 0x30,
  'sgtin-198': 0x36,
  'sscc-96': 0x31,
  'sgln-96': 0x32,
  'giai-96': 0x34,
  'grai-96': 0x33,
} as const

interface PartitionEntry {
  /** GS1 company prefix length in digits. */
  prefixDigits: number
  /** EPC partition value placed in the 3-bit partition field. */
  partition: number
  /** Bits used to encode the company prefix as an integer. */
  prefixBits: number
  /**
   * Bits used to encode the "other" field as an integer (item ref for
   * SGTIN/GRAI, serial reference for SSCC, location ref for SGLN, asset
   * type for GRAI, asset ref for GIAI).
   *
   * For GIAI we don't read this — the asset reference uses the remaining
   * bits in the payload.
   */
  otherBits: number
  /** Digit count of the "other" field (excluding check digit where applicable). */
  otherDigits: number
}

// Table 14-2 SGTIN-96 partition table (also SGTIN-198 → same widths)
export const SGTIN_PARTITIONS: PartitionEntry[] = [
  { prefixDigits: 12, partition: 0, prefixBits: 40, otherBits: 4, otherDigits: 1 },
  { prefixDigits: 11, partition: 1, prefixBits: 37, otherBits: 7, otherDigits: 2 },
  { prefixDigits: 10, partition: 2, prefixBits: 34, otherBits: 10, otherDigits: 3 },
  { prefixDigits: 9, partition: 3, prefixBits: 30, otherBits: 14, otherDigits: 4 },
  { prefixDigits: 8, partition: 4, prefixBits: 27, otherBits: 17, otherDigits: 5 },
  { prefixDigits: 7, partition: 5, prefixBits: 24, otherBits: 20, otherDigits: 6 },
  { prefixDigits: 6, partition: 6, prefixBits: 20, otherBits: 24, otherDigits: 7 },
]

// Table 14-3 SSCC-96 partition table
export const SSCC_PARTITIONS: PartitionEntry[] = [
  { prefixDigits: 12, partition: 0, prefixBits: 40, otherBits: 18, otherDigits: 5 },
  { prefixDigits: 11, partition: 1, prefixBits: 37, otherBits: 21, otherDigits: 6 },
  { prefixDigits: 10, partition: 2, prefixBits: 34, otherBits: 24, otherDigits: 7 },
  { prefixDigits: 9, partition: 3, prefixBits: 30, otherBits: 28, otherDigits: 8 },
  { prefixDigits: 8, partition: 4, prefixBits: 27, otherBits: 31, otherDigits: 9 },
  { prefixDigits: 7, partition: 5, prefixBits: 24, otherBits: 34, otherDigits: 10 },
  { prefixDigits: 6, partition: 6, prefixBits: 20, otherBits: 38, otherDigits: 11 },
]

// Table 14-4 SGLN-96 partition table
export const SGLN_PARTITIONS: PartitionEntry[] = [
  { prefixDigits: 12, partition: 0, prefixBits: 40, otherBits: 1, otherDigits: 0 },
  { prefixDigits: 11, partition: 1, prefixBits: 37, otherBits: 4, otherDigits: 1 },
  { prefixDigits: 10, partition: 2, prefixBits: 34, otherBits: 7, otherDigits: 2 },
  { prefixDigits: 9, partition: 3, prefixBits: 30, otherBits: 11, otherDigits: 3 },
  { prefixDigits: 8, partition: 4, prefixBits: 27, otherBits: 14, otherDigits: 4 },
  { prefixDigits: 7, partition: 5, prefixBits: 24, otherBits: 17, otherDigits: 5 },
  { prefixDigits: 6, partition: 6, prefixBits: 20, otherBits: 21, otherDigits: 6 },
]

// Table 14-5 GRAI-96 partition table
export const GRAI_PARTITIONS: PartitionEntry[] = [
  { prefixDigits: 12, partition: 0, prefixBits: 40, otherBits: 4, otherDigits: 0 },
  { prefixDigits: 11, partition: 1, prefixBits: 37, otherBits: 7, otherDigits: 1 },
  { prefixDigits: 10, partition: 2, prefixBits: 34, otherBits: 10, otherDigits: 2 },
  { prefixDigits: 9, partition: 3, prefixBits: 30, otherBits: 14, otherDigits: 3 },
  { prefixDigits: 8, partition: 4, prefixBits: 27, otherBits: 17, otherDigits: 4 },
  { prefixDigits: 7, partition: 5, prefixBits: 24, otherBits: 20, otherDigits: 5 },
  { prefixDigits: 6, partition: 6, prefixBits: 20, otherBits: 24, otherDigits: 6 },
]

function digitsOnly(s: string): string {
  return (s || '').replace(/[^0-9]/g, '')
}

function bitsToHex(bits: string): string {
  if (bits.length % 4 !== 0) {
    throw new Error(`bit-string length ${bits.length} is not a multiple of 4`)
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16).toUpperCase()
  }
  return hex
}

function toBits(value: number | bigint, width: number): string {
  const big = typeof value === 'bigint' ? value : BigInt(Math.floor(value))
  if (big < 0n) throw new Error('bit field cannot be negative')
  const max = (1n << BigInt(width)) - 1n
  if (big > max) {
    throw new Error(`value ${big} does not fit in ${width} bits`)
  }
  let bits = big.toString(2)
  if (bits.length < width) bits = '0'.repeat(width - bits.length) + bits
  return bits
}

function findSgtinPartition(prefixDigits: number): PartitionEntry {
  const entry = SGTIN_PARTITIONS.find((p) => p.prefixDigits === prefixDigits)
  if (!entry) throw new Error(`unsupported company prefix length ${prefixDigits}`)
  return entry
}

function findPartition(table: PartitionEntry[], prefixDigits: number): PartitionEntry {
  const entry = table.find((p) => p.prefixDigits === prefixDigits)
  if (!entry) throw new Error(`unsupported company prefix length ${prefixDigits}`)
  return entry
}

/**
 * Encode a GTIN-14 (or shorter UPC, left-padded) into a sequence of SGTIN-96
 * EPCs starting at `startSerial` and incrementing for `quantity` tags.
 *
 * @param companyPrefixLength bit-partition selector (6..12). Defaults to 6
 *   (matches the historical behaviour of the previous `EPCGenerator`).
 */
export function generateSgtin96(
  upc: string,
  quantity: number,
  startSerial: number = 1,
  companyPrefixLength: number = 6,
  filter: number = 0,
): string[] {
  const out: string[] = []
  let gtin = digitsOnly(upc)
  if (!gtin) return out
  if (gtin.length < 14) gtin = ('00000000000000' + gtin).slice(-14)
  if (gtin.length > 14) gtin = gtin.slice(-14)

  const partition = findSgtinPartition(companyPrefixLength)
  const indicator = gtin.charAt(0)
  const companyPrefix = gtin.substring(1, 1 + companyPrefixLength)
  const itemRef = indicator + gtin.substring(1 + companyPrefixLength, 13)

  const headerBits = toBits(HEADERS['sgtin-96'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(companyPrefix), partition.prefixBits)
  const itemRefBits = toBits(BigInt(itemRef), partition.otherBits)

  const qty = Math.max(0, Math.floor(quantity))
  const firstSerial = Math.max(0, Math.floor(startSerial))

  for (let i = 0; i < qty; i++) {
    const serialBits = toBits(BigInt(firstSerial + i), 38)
    out.push(bitsToHex(headerBits + filterBits + partitionBits + cpBits + itemRefBits + serialBits))
  }
  return out
}

const SGTIN198_TABLE: Record<string, string> = (() => {
  // RFC 3986 unreserved + the additional 39 GS1 characters minus uppercase
  // letters and digits. We hand-build a 7-bit lookup matching Table 14-9.
  const table: Record<string, string> = {}
  const baseChars =
    '!"%&\'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'
  for (const ch of baseChars) {
    table[ch] = toBits(ch.charCodeAt(0), 7)
  }
  return table
})()

/**
 * Encode a GTIN-14 + ASCII serial into SGTIN-198.
 *
 * Generates `quantity` EPCs whose serial is `serialBase` + an incrementing
 * counter, formatted as a string (decimal) and packed as 7-bit characters
 * with a null-byte terminator if shorter than 20 characters.
 */
export function generateSgtin198(
  upc: string,
  quantity: number,
  startSerial: number = 1,
  serialPrefix: string = '',
  companyPrefixLength: number = 6,
  filter: number = 0,
): string[] {
  const out: string[] = []
  let gtin = digitsOnly(upc)
  if (!gtin) return out
  if (gtin.length < 14) gtin = ('00000000000000' + gtin).slice(-14)
  if (gtin.length > 14) gtin = gtin.slice(-14)

  const partition = findSgtinPartition(companyPrefixLength)
  const indicator = gtin.charAt(0)
  const companyPrefix = gtin.substring(1, 1 + companyPrefixLength)
  const itemRef = indicator + gtin.substring(1 + companyPrefixLength, 13)

  const headerBits = toBits(HEADERS['sgtin-198'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(companyPrefix), partition.prefixBits)
  const itemRefBits = toBits(BigInt(itemRef), partition.otherBits)
  const headerSection = headerBits + filterBits + partitionBits + cpBits + itemRefBits

  const qty = Math.max(0, Math.floor(quantity))
  const firstSerial = Math.max(0, Math.floor(startSerial))

  for (let i = 0; i < qty; i++) {
    const serialText = `${serialPrefix}${firstSerial + i}`
    if (serialText.length > 20) {
      throw new Error(`SGTIN-198 serial "${serialText}" exceeds 20 characters`)
    }
    let serialBits = ''
    for (const ch of serialText) {
      const enc = SGTIN198_TABLE[ch]
      if (!enc) throw new Error(`SGTIN-198 disallowed character "${ch}"`)
      serialBits += enc
    }
    if (serialText.length < 20) serialBits += '0000000' // null terminator
    // SGTIN-198 = 198 data bits, written to a 200-bit (50 nibble) field.
    // Header section is 58 bits, so the serial section occupies the remaining
    // 140 bits of payload + 2 trailing pad bits to land on a nibble boundary.
    serialBits = (serialBits + '0'.repeat(142)).slice(0, 142)
    out.push(bitsToHex(headerSection + serialBits))
  }
  return out
}

/**
 * Encode an SSCC into SSCC-96.
 *
 * `companyPrefix` and `serialReference` are concatenated (after stripping the
 * SSCC's extension digit; you can supply it as the first digit of
 * `serialReference` if you want it preserved). For an 18-digit raw SSCC,
 * digits[0] is the extension, digits[1..n] are company prefix, digits[n+1..17]
 * are the serial reference, digits[17] is the GS1 check digit (not encoded).
 */
export function generateSscc96(
  companyPrefix: string,
  serialReference: string,
  quantity: number,
  startSerial: number = 0,
  filter: number = 0,
): string[] {
  const out: string[] = []
  const cp = digitsOnly(companyPrefix)
  if (!cp) return out
  const partition = findPartition(SSCC_PARTITIONS, cp.length)
  const refBase = digitsOnly(serialReference)
  const refDigits = partition.otherDigits + 1 // includes the SSCC extension digit
  const qty = Math.max(0, Math.floor(quantity))
  const firstSerial = Math.max(0, Math.floor(startSerial))

  const headerBits = toBits(HEADERS['sscc-96'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(cp), partition.prefixBits)

  for (let i = 0; i < qty; i++) {
    const incremented = (BigInt(refBase || '0') + BigInt(firstSerial + i)).toString()
    const padded = incremented.padStart(refDigits, '0').slice(-refDigits)
    const refBits = toBits(BigInt(padded), partition.otherBits)
    const reservedBits = '0'.repeat(24)
    out.push(bitsToHex(headerBits + filterBits + partitionBits + cpBits + refBits + reservedBits))
  }
  return out
}

/**
 * Encode a GLN into SGLN-96 with an incrementing extension component.
 */
export function generateSgln96(
  companyPrefix: string,
  locationReference: string,
  quantity: number,
  startExtension: number = 0,
  filter: number = 0,
): string[] {
  const out: string[] = []
  const cp = digitsOnly(companyPrefix)
  if (!cp) return out
  const partition = findPartition(SGLN_PARTITIONS, cp.length)
  const loc = digitsOnly(locationReference)
  if (loc.length < partition.otherDigits) {
    locationReference = loc.padStart(partition.otherDigits, '0')
  }
  const locDigits = digitsOnly(locationReference).padStart(partition.otherDigits, '0').slice(-partition.otherDigits)

  const headerBits = toBits(HEADERS['sgln-96'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(cp), partition.prefixBits)
  const locBits = toBits(
    partition.otherDigits === 0 ? 0n : BigInt(locDigits || '0'),
    partition.otherBits,
  )
  const headerSection = headerBits + filterBits + partitionBits + cpBits + locBits

  const qty = Math.max(0, Math.floor(quantity))
  const firstExt = Math.max(0, Math.floor(startExtension))
  for (let i = 0; i < qty; i++) {
    const extBits = toBits(BigInt(firstExt + i), 41)
    out.push(bitsToHex(headerSection + extBits))
  }
  return out
}

/**
 * Encode a GIAI-96.
 *
 * The GIAI-96 has only a company prefix + an asset reference; the reference
 * sits in (82 - prefixBits) bits. We auto-pick the smallest partition table
 * entry that fits the supplied prefix length.
 */
export function generateGiai96(
  companyPrefix: string,
  assetReference: string,
  quantity: number,
  startSerial: number = 0,
  filter: number = 0,
): string[] {
  const out: string[] = []
  const cp = digitsOnly(companyPrefix)
  if (!cp) return out
  const partition = findSgtinPartition(cp.length) // bit widths align
  // GIAI-96 reserved layout: header(8)+filter(3)+partition(3)+cp(prefixBits)+ref(82-prefixBits)
  const refBits = 82 - partition.prefixBits

  const headerBits = toBits(HEADERS['giai-96'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(cp), partition.prefixBits)

  const refBase = BigInt(digitsOnly(assetReference) || '0')
  const qty = Math.max(0, Math.floor(quantity))
  const firstSerial = Math.max(0, Math.floor(startSerial))

  for (let i = 0; i < qty; i++) {
    const value = refBase + BigInt(firstSerial + i)
    const refField = toBits(value, refBits)
    out.push(bitsToHex(headerBits + filterBits + partitionBits + cpBits + refField))
  }
  return out
}

/**
 * Encode a GRAI-96 with an incrementing serial component.
 */
export function generateGrai96(
  companyPrefix: string,
  assetType: string,
  quantity: number,
  startSerial: number = 1,
  filter: number = 0,
): string[] {
  const out: string[] = []
  const cp = digitsOnly(companyPrefix)
  if (!cp) return out
  const partition = findPartition(GRAI_PARTITIONS, cp.length)
  const at = digitsOnly(assetType).padStart(partition.otherDigits, '0').slice(-partition.otherDigits)

  const headerBits = toBits(HEADERS['grai-96'], 8)
  const filterBits = toBits(filter, 3)
  const partitionBits = toBits(partition.partition, 3)
  const cpBits = toBits(BigInt(cp), partition.prefixBits)
  const atBits = toBits(
    partition.otherDigits === 0 ? 0n : BigInt(at || '0'),
    partition.otherBits,
  )
  const headerSection = headerBits + filterBits + partitionBits + cpBits + atBits

  const qty = Math.max(0, Math.floor(quantity))
  const firstSerial = Math.max(0, Math.floor(startSerial))
  for (let i = 0; i < qty; i++) {
    const serialBits = toBits(BigInt(firstSerial + i), 38)
    out.push(bitsToHex(headerSection + serialBits))
  }
  return out
}

/** Small registry used by the UI scheme-pickers. */
export const EPC_SCHEME_LABELS: Record<EpcScheme, string> = {
  'sgtin-96': 'SGTIN-96',
  'sgtin-198': 'SGTIN-198',
  'sscc-96': 'SSCC-96',
  'sgln-96': 'SGLN-96',
  'giai-96': 'GIAI-96',
  'grai-96': 'GRAI-96',
}
