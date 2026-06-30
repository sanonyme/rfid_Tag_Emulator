/**
 * Fast tag counting for UPC / EPC lists without materializing EPC hex strings.
 * Safe to call while typing — used for Send button state and summaries.
 */

import { iterateNonBlankLines } from './tag-list-lines'

export function countUpcTagsFromText(upcList: string): number {
  let count = 0
  for (const line of iterateNonBlankLines(upcList)) {
    const [upc, countStr] = line.split(',')
    const qty = parseInt(countStr?.trim() || '0', 10)
    if (qty > 0 && upc?.trim()) count += qty
  }
  return count
}

export function countEpcTagsFromText(epcList: string): number {
  let count = 0
  for (const line of iterateNonBlankLines(epcList)) {
    const epc = line.split(',')[0]?.trim()
    if (epc) count++
  }
  return count
}

export function countHandheldSlotTags(slot: { upcList: string; epcList: string }): number {
  return countUpcTagsFromText(slot.upcList) + countEpcTagsFromText(slot.epcList)
}
