export type HandheldTagPayload = {
  epc: string
  tid?: string
  rssi?: string
}

export function formatHandheldBroadcastLine(
  tag: HandheldTagPayload,
  date: string,
  rssi: number,
): string {
  return (
    JSON.stringify({
      epc: tag.epc,
      tid: tag.tid || tag.epc,
      date,
      rssi,
    }) + '\r\n'
  )
}

export function formatHandheldBroadcastPayload(
  tags: HandheldTagPayload[],
  date: string,
  rssiForTag: (tag: HandheldTagPayload) => number,
): string {
  return tags.map((tag) => formatHandheldBroadcastLine(tag, date, rssiForTag(tag))).join('')
}
