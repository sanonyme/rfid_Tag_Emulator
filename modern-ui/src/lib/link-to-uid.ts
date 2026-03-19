/**
 * Converts r-trac links (with Base64URL-encoded EPC param) to ISO15693-like UID hex (E016 + 12 hex chars).
 * Ported from Java - handles URL-encoded EPC, Base64URL variants, and various byte orderings.
 */

function extractParam(url: string, name: string): string | null {
  const m = url.match(new RegExp(`[?&]${name}=([^&]+)`))
  return m ? m[1] : null
}

function addBase64Padding(s: string): string {
  const mod = s.length % 4
  if (mod === 0) return s
  return s + '===='.substring(0, 4 - mod)
}

function indexOfPrefix(b: Uint8Array, p0: number, p1: number): number {
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] === p0 && b[i + 1] === p1) return i
  }
  return -1
}

function toUidFromSerial(b: Uint8Array, start: number, end: number, reverse: boolean): string {
  let sb = 'E016'
  if (!reverse) {
    for (let i = start; i < end; i++) {
      sb += b[i].toString(16).padStart(2, '0').toUpperCase()
    }
  } else {
    for (let i = end - 1; i >= start; i--) {
      sb += b[i].toString(16).padStart(2, '0').toUpperCase()
    }
  }
  return sb
}

function trySerial(b: Uint8Array, start: number, reverse: boolean): string | null {
  if (start < 0 || start + 6 > b.length) return null
  const uid = toUidFromSerial(b, start, start + 6, reverse)
  return /^E016[0-9A-F]{12}$/.test(uid) ? uid : null
}

/**
 * Best-effort UID extraction for r-trac links.
 * EPC is Base64URL encoded (may contain '_' or '-'), sometimes URL-encoded.
 * UID shown by r-trac is ISO15693-like: E016 + 6-byte serial (12 hex).
 */
export function epcToUidHexBest(epcParam: string): string | null {
  try {
    const epc = decodeURIComponent(epcParam)
    const base64 = addBase64Padding(epc.replace(/-/g, '+').replace(/_/g, '/'))
    const binary = atob(base64)
    const b = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) b[i] = binary.charCodeAt(i)

    const idx = indexOfPrefix(b, 0xe0, 0x16)
    if (idx >= 0 && idx + 8 <= b.length) {
      return toUidFromSerial(b, idx + 2, idx + 8, false)
    }

    let cand = trySerial(b, b.length - 6, false)
    if (cand) return cand
    cand = trySerial(b, b.length - 6, true)
    if (cand) return cand
    cand = trySerial(b, 0, false)
    if (cand) return cand
    cand = trySerial(b, 0, true)
    if (cand) return cand

    for (let s = 0; s + 6 <= b.length; s++) {
      cand = trySerial(b, s, false)
      if (cand) return cand
      cand = trySerial(b, s, true)
      if (cand) return cand
    }
    return null
  } catch {
    return null
  }
}

export interface LinkToUidResult {
  link: string
  uid: string | null
  error?: string
}

export function convertLinksToUids(links: string[]): LinkToUidResult[] {
  const results: LinkToUidResult[] = []
  for (const link of links) {
    const trimmed = link.trim()
    if (!trimmed) continue

    try {
      const epc = extractParam(trimmed, 'epc')
      if (!epc) {
        results.push({ link: trimmed, uid: null, error: 'EPC not found' })
        continue
      }

      const uid = epcToUidHexBest(epc)
      results.push({ link: trimmed, uid: uid ?? null, error: uid ? undefined : 'UID not found' })
    } catch (e) {
      results.push({
        link: trimmed,
        uid: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }
  return results
}
