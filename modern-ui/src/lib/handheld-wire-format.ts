export type HandheldTagPayload = {
  epc: string
  tid?: string
  rssi?: string
  userdata?: string
}

export function formatHandheldBroadcastLine(
  tag: HandheldTagPayload,
  date: string,
  rssi: number,
): string {
  const payload: Record<string, string | number> = {
    epc: tag.epc,
    tid: tag.tid || tag.epc,
    date,
    rssi,
  }
  if (tag.userdata?.trim()) payload.userdata = tag.userdata.trim()
  return JSON.stringify(payload) + '\r\n'
}

export function formatHandheldBroadcastPayload(
  tags: HandheldTagPayload[],
  date: string,
  rssiForTag: (tag: HandheldTagPayload) => number,
): string {
  return tags.map((tag) => formatHandheldBroadcastLine(tag, date, rssiForTag(tag))).join('')
}
