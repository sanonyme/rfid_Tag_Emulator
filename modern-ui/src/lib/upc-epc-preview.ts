import { EPCGenerator, expandUpcListToEpcs, parseStartSerial, type ExpandedUpcTag } from './tcp-client'

export interface UpcEpcPreviewData {
  tags: ExpandedUpcTag[]
  count: number
  firstEpc: string | null
  lastEpc: string | null
}

export interface UpcEpcPreviewSummary {
  count: number
  firstEpc: string | null
  lastEpc: string | null
}

interface ParsedUpcLine {
  upc: string
  count: number
}

function parseUpcLines(upcList: string): ParsedUpcLine[] {
  const out: ParsedUpcLine[] = []
  for (const line of upcList.trim().split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [upc, countStr] = trimmed.split(',')
    const count = parseInt(countStr?.trim() || '0', 10)
    if (count <= 0 || !upc?.trim()) continue
    out.push({ upc: upc.trim(), count })
  }
  return out
}

/**
 * Lightweight preview for live typing — avoids materializing every EPC on each keystroke.
 */
export function buildUpcEpcPreviewSummary(
  upcList: string,
  startSerial: string | number | undefined,
  continuesAcrossLines: boolean,
): UpcEpcPreviewSummary {
  const lines = parseUpcLines(upcList)
  if (lines.length === 0) {
    return { count: 0, firstEpc: null, lastEpc: null }
  }

  const baseSerial = parseStartSerial(startSerial)
  let count = 0
  for (const line of lines) {
    count += line.count
  }

  const firstLine = lines[0]
  const firstEpcs = EPCGenerator.generateFromUpc(firstLine.upc, 1, baseSerial)
  const firstEpc = firstEpcs[0] ?? null

  const lastLine = lines[lines.length - 1]
  let lastStart = baseSerial
  if (continuesAcrossLines && lines.length > 1) {
    for (let i = 0; i < lines.length - 1; i++) {
      lastStart += lines[i].count
    }
  }
  // Only encode the final serial — never materialize the whole quantity for preview.
  const lastSerial = lastStart + lastLine.count - 1
  const lastEpc = EPCGenerator.generateFromUpc(lastLine.upc, 1, lastSerial)[0] ?? null

  return { count, firstEpc, lastEpc }
}

/** Expand a UPC tag list to the EPC hex strings that Fixed/Handheld send will emit. */
export function buildUpcEpcPreview(
  upcList: string,
  startSerial: string | number | undefined,
  continuesAcrossLines: boolean,
): UpcEpcPreviewData {
  const tags = expandUpcListToEpcs(upcList, startSerial, continuesAcrossLines)
  const count = tags.length
  return {
    tags,
    count,
    firstEpc: tags[0]?.epc ?? null,
    lastEpc: count > 0 ? (tags[count - 1]?.epc ?? null) : null,
  }
}
