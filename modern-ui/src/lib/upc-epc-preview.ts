import { expandUpcListToEpcs, type ExpandedUpcTag } from './tcp-client'

export interface UpcEpcPreviewData {
  tags: ExpandedUpcTag[]
  count: number
  firstEpc: string | null
  lastEpc: string | null
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
