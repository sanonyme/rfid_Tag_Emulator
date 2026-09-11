import { iterateSourceLines } from './tag-list-lines'
import { decodeInditexEpc, brandNameFromId, INDITEX_EPC_HEX_LENGTH } from './inditex-epc'

/** Common GS1 TDS header byte → scheme label. */
export const EPC_HEADER_LABELS: Record<number, string> = {
  0x2e: 'GDTI-96',
  0x2f: 'USDOD-96',
  0x30: 'SGTIN-96',
  0x31: 'SSCC-96',
  0x32: 'SGLN-96',
  0x33: 'GRAI-96',
  0x34: 'GIAI-96',
  0x35: 'GID-96',
  0x36: 'SGTIN-198',
  0x37: 'GSRN-96',
  0x38: 'GSRNP-96',
  0x3a: 'ITIP-110',
  0x3b: 'CPI-96',
  0x3d: 'SGCN-96',
  0x3e: 'GDTI-174',
  0x3f: 'CPI-var',
}

export type IdentifiedEpc = {
  scheme: string
  bits: number
}

export function cleanEpcHex(hex: string): string {
  return hex.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

/** Cheap header/length identify — no TDT, safe to run on whole lists. */
export function identifyEpcHex(hex: string): IdentifiedEpc {
  const clean = cleanEpcHex(hex)
  const bits = clean.length * 4
  if (clean.length < 2) {
    return { scheme: 'Unknown', bits }
  }

  const header = parseInt(clean.slice(0, 2), 16)
  const gs1 = EPC_HEADER_LABELS[header]
  if (gs1) return { scheme: gs1, bits }

  if (clean.length === INDITEX_EPC_HEX_LENGTH) {
    try {
      const decoded = decodeInditexEpc(clean)
      const brand = brandNameFromId(decoded.brand)
      const brandLabel = brand === 'inditex' ? 'Inditex' : brand === 'tempe' ? 'Tempe' : `Brand ${decoded.brand}`
      return { scheme: `${brandLabel} V${decoded.version}`, bits }
    } catch {
      // fall through
    }
  }

  return { scheme: `Header 0x${header.toString(16).padStart(2, '0').toUpperCase()}`, bits }
}

export type EpcPeekRow = {
  lineNumber: number
  epc: string
  scheme: string
  bits: number
  tid?: string
  userdata?: string
}

export type EpcListPeekSummary = {
  rows: EpcPeekRow[]
  rowsTruncated: boolean
  schemeCounts: { scheme: string; count: number }[]
  withTid: number
  withUserdata: number
  valid: number
}

const MAX_PEEK_ROWS = 12

export function summarizeEpcList(text: string, maxRows = MAX_PEEK_ROWS): EpcListPeekSummary {
  const schemeMap = new Map<string, number>()
  const rows: EpcPeekRow[] = []
  let withTid = 0
  let withUserdata = 0
  let valid = 0
  let rowsTruncated = false

  for (const { lineNumber, trimmed } of iterateSourceLines(text ?? '')) {
    if (!trimmed) continue
    const parts = trimmed.split(',').map((part) => part.trim())
    const epc = parts[0]
    if (!epc || !/^[0-9a-fA-F]+$/.test(epc) || epc.length % 2 !== 0) continue

    valid++
    const tid = parts[1] || undefined
    const userdata = parts[2] || undefined
    if (tid) withTid++
    if (userdata) withUserdata++

    const identified = identifyEpcHex(epc)
    schemeMap.set(identified.scheme, (schemeMap.get(identified.scheme) ?? 0) + 1)

    if (rows.length < maxRows) {
      rows.push({
        lineNumber,
        epc: epc.toUpperCase(),
        scheme: identified.scheme,
        bits: identified.bits,
        tid,
        userdata,
      })
    } else {
      rowsTruncated = true
    }
  }

  const schemeCounts = [...schemeMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([scheme, count]) => ({ scheme, count }))

  return { rows, rowsTruncated, schemeCounts, withTid, withUserdata, valid }
}
