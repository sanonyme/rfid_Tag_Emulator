import { EPCDecoder } from './decoder'
import { iterateSourceLines } from './tag-list-lines'
export type UpcCheckDigitStatus =
  | { kind: 'none' }
  | { kind: 'hint13'; calculatedCheck: string }
  | { kind: 'valid14' }
  | { kind: 'invalid14'; expected: string; provided: string }
  | { kind: 'tooLong'; digitCount: number; checkValid: boolean; expected?: string; provided?: string }

export interface UpcLineCheckDigit {
  lineNumber: number
  upcDigits: string
  status: UpcCheckDigitStatus
}

/** Digits-only UPC/GTIN from the first CSV field on a tag-list line. */
export function extractUpcDigitsFromLine(line: string): string {
  const upc = line.split(',')[0]?.trim() ?? ''
  return upc.replace(/[^0-9]/g, '')
}

/**
 * Live GTIN check-digit feedback (matches Decoder tab behaviour).
 * 13 digits → suggest check digit; 14 digits → validate check digit;
 * >14 → warn about length and validate check digit on the rightmost 14 (used for encoding).
 */
export function analyzeUpcDigits(digits: string): UpcCheckDigitStatus {
  if (digits.length === 13) {
    return { kind: 'hint13', calculatedCheck: EPCDecoder.calculateCheckDigit(digits) }
  }
  if (digits.length === 14) {
    const payload = digits.slice(0, 13)
    const provided = digits.slice(-1)
    const expected = EPCDecoder.calculateCheckDigit(payload)
    if (provided === expected) return { kind: 'valid14' }
    return { kind: 'invalid14', expected, provided }
  }
  if (digits.length > 14) {
    const gtin14 = digits.slice(-14)
    const payload = gtin14.slice(0, 13)
    const provided = gtin14.slice(-1)
    const expected = EPCDecoder.calculateCheckDigit(payload)
    const checkValid = provided === expected
    return checkValid
      ? { kind: 'tooLong', digitCount: digits.length, checkValid: true }
      : { kind: 'tooLong', digitCount: digits.length, checkValid: false, expected, provided }
  }
  return { kind: 'none' }
}

export function getLineIndexAtCursor(text: string, cursorPos: number): number {
  if (cursorPos <= 0) return 1
  return text.slice(0, cursorPos).split(/\r?\n/).length
}

export function getLineAtIndex(text: string, lineIndex: number): string {
  const lines = text.split(/\r?\n/)
  return lines[lineIndex - 1] ?? ''
}

/** Max non-blank lines scanned for live check-digit hints (avoids UI freeze on huge lists). */
export const UPC_CHECK_DIGIT_SCAN_LIMIT = 500

/** Per-line check-digit analysis for a UPC tag list (blank lines omitted). */
export function analyzeUpcListCheckDigits(
  text: string,
  maxLines: number = UPC_CHECK_DIGIT_SCAN_LIMIT,
): UpcLineCheckDigit[] {
  const out: UpcLineCheckDigit[] = []
  let scanned = 0
  for (const { lineNumber, trimmed } of iterateSourceLines(text)) {
    if (!trimmed) continue
    scanned++
    if (scanned > maxLines) break
    const upcDigits = extractUpcDigitsFromLine(trimmed)
    const status = analyzeUpcDigits(upcDigits)
    if (status.kind === 'none') continue
    out.push({ lineNumber, upcDigits, status })
  }
  return out
}