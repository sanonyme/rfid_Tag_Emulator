/** Extract `name=value` from a Set-Cookie header line (drop Path, HttpOnly, etc.). */
export function cookiePairFromSetCookieLine(line: string): string {
  return line.split(';')[0]?.trim() ?? ''
}

/** Normalize Set-Cookie header(s) into a single Cookie request header value. */
export function normalizeSetCookieForRequest(setCookie: string | string[]): string {
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie]
  return lines.map(cookiePairFromSetCookieLine).filter(Boolean).join('; ')
}

/** Merge new Set-Cookie into an existing Cookie header jar. */
export function mergeCookieHeader(existing: string | null, setCookie: string): string {
  const jar = new Map<string, string>()
  if (existing) {
    for (const part of existing.split(';')) {
      const trimmed = part.trim()
      const eq = trimmed.indexOf('=')
      if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
    }
  }
  for (const part of normalizeSetCookieForRequest(setCookie).split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
