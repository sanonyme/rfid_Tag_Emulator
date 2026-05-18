/**
 * Inline validation for the UPC / EPC tag-list textareas.
 *
 * Both Fixed and Handheld tabs silently drop malformed lines today, which makes
 * "I sent 30 tags but only 27 arrived" hard to debug. This module produces a
 * per-line breakdown so the UI can surface the count that *will* be emitted
 * and explain why anything was skipped.
 *
 * Rules (lenient enough to match the existing parsers):
 *  - UPC mode (`UPC,Count,TID`):
 *      * UPC must be 1..14 digits (we left-pad to GTIN-14 elsewhere)
 *      * Count is required and must be a positive integer
 *      * TID is optional; when present it must be hex (any length)
 *  - EPC mode (`EPC[,TID]`):
 *      * EPC must be a non-empty hex string with an even number of chars
 *      * TID is optional; when present it must be hex
 *
 * Each result row gets a 1-based `lineNumber` so the UI can show "line 12" to
 * users (matching what a code editor would show).
 */

export type TagListKind = 'upc' | 'epc'

export interface ValidLine {
  ok: true
  lineNumber: number
  raw: string
  /** EPCs that will be emitted from this line (>=1 for upc, exactly 1 for epc). */
  count: number
}

export interface InvalidLine {
  ok: false
  lineNumber: number
  raw: string
  error: string
}

export type ValidationLine = ValidLine | InvalidLine

export interface TagListValidation {
  kind: TagListKind
  /** Total tags that will be emitted across all valid lines. */
  totalTags: number
  /** Count of valid lines (each may contribute >=1 tags). */
  validLines: number
  /** Count of invalid lines (skipped at send time). */
  invalidLines: number
  /** Per-line entries, in source order (blank lines omitted). */
  lines: ValidationLine[]
}

const HEX_RE = /^[0-9a-fA-F]+$/

function validateUpcLine(raw: string, lineNumber: number): ValidationLine {
  const parts = raw.split(',').map((p) => p.trim())
  const [upc, countStr, tid] = parts
  if (!upc) {
    return { ok: false, lineNumber, raw, error: 'Missing UPC' }
  }
  if (!/^\d+$/.test(upc)) {
    return { ok: false, lineNumber, raw, error: 'UPC must be digits only' }
  }
  if (upc.length > 14) {
    return { ok: false, lineNumber, raw, error: `UPC is ${upc.length} digits; max is 14` }
  }
  if (!countStr) {
    return { ok: false, lineNumber, raw, error: 'Count is required (e.g. "12345,5")' }
  }
  if (!/^\d+$/.test(countStr)) {
    return { ok: false, lineNumber, raw, error: `Count "${countStr}" is not a positive integer` }
  }
  const count = parseInt(countStr, 10)
  if (count <= 0) {
    return { ok: false, lineNumber, raw, error: 'Count must be greater than zero' }
  }
  if (tid && !HEX_RE.test(tid)) {
    return { ok: false, lineNumber, raw, error: `TID "${tid}" must be hex` }
  }
  return { ok: true, lineNumber, raw, count }
}

function validateEpcLine(raw: string, lineNumber: number): ValidationLine {
  const parts = raw.split(',').map((p) => p.trim())
  const [epc, tid] = parts
  if (!epc) {
    return { ok: false, lineNumber, raw, error: 'Missing EPC' }
  }
  if (!HEX_RE.test(epc)) {
    return { ok: false, lineNumber, raw, error: 'EPC must be hex (0-9, A-F)' }
  }
  if (epc.length % 2 !== 0) {
    return { ok: false, lineNumber, raw, error: `EPC has ${epc.length} chars; must be even` }
  }
  if (tid && !HEX_RE.test(tid)) {
    return { ok: false, lineNumber, raw, error: `TID "${tid}" must be hex` }
  }
  return { ok: true, lineNumber, raw, count: 1 }
}

export function validateTagList(text: string, kind: TagListKind): TagListValidation {
  const lines: ValidationLine[] = []
  const raw = text ?? ''
  let lineNumber = 0
  let totalTags = 0
  let validLines = 0
  let invalidLines = 0

  for (const sourceLine of raw.split(/\r?\n/)) {
    lineNumber++
    const trimmed = sourceLine.trim()
    if (!trimmed) continue

    const result = kind === 'upc'
      ? validateUpcLine(trimmed, lineNumber)
      : validateEpcLine(trimmed, lineNumber)

    lines.push(result)
    if (result.ok) {
      validLines++
      totalTags += result.count
    } else {
      invalidLines++
    }
  }

  return { kind, totalTags, validLines, invalidLines, lines }
}

/** Convenience: just the count of EPCs the list will produce. */
export function countEmittedTags(text: string, kind: TagListKind): number {
  return validateTagList(text, kind).totalTags
}
