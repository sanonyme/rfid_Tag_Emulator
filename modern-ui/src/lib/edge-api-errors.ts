/** Parse Edge REST error bodies (often `{ "error": "..." }`). */
export function formatEdgeApiError(data: string | null | undefined, status?: number): string {
  const fallback = status ? `Request failed (${status})` : 'Request failed'
  if (!data?.trim()) return fallback

  const trimmed = data.trim()
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown }
    if (typeof parsed.error === 'string') return formatEdgeBlockError(parsed.error)
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    /* plain text */
  }
  return trimmed
}

function formatEdgeBlockError(raw: string): string {
  if (!raw.includes('InvocationTargetException') && !raw.includes('Exception')) {
    return raw
  }

  const paramsMatch = raw.match(/Params:\s*(\{[^}]+\})/)
  const paramsLine = paramsMatch ? `Parameters: ${paramsMatch[1]}` : null
  const hint =
    'The invoke request reached Edge, but the block failed while running. ' +
    'Check that the logical device exists, the reader is connected, and review Edge server logs for the underlying cause.'

  const lines = ['Block execution failed on Edge.']
  if (paramsLine) lines.push(paramsLine)
  lines.push(hint)
  return lines.join('\n')
}

/** Edge UI success: HTTP 200, Content-Length 17, body `{"success":true}`. */
export function aleResponseIsInvokeSuccess(
  data: string | null | undefined,
  status: number,
): boolean {
  if (status < 200 || status >= 300) return false
  if (!data?.trim()) return true
  try {
    const parsed = JSON.parse(data.trim()) as {
      success?: unknown
      ok?: unknown
      error?: unknown
    }
    if (parsed.success === true || parsed.ok === true) return true
    if (typeof parsed.error === 'string' && parsed.error.length > 0) return false
    return true
  } catch {
    return true
  }
}

/** Edge may return HTTP 200/500 with `{ "error": "..." }` when block execution fails. */
export function aleResponseHasBlockError(data: string | null | undefined): boolean {
  if (!data?.trim()) return false
  try {
    const parsed = JSON.parse(data.trim()) as { error?: unknown; success?: unknown }
    if (parsed.success === true) return false
    return typeof parsed.error === 'string' && parsed.error.length > 0
  } catch {
    return false
  }
}

/** HTTP timeout for block invoke — must exceed ReadDuration-style params. */
export function computeInvokeTimeoutMs(params: Record<string, unknown>): number {
  const PAD_MS = 20_000
  const MIN_MS = 35_000
  const DEFAULT_MS = 15_000

  let maxDuration = 0
  for (const [key, value] of Object.entries(params)) {
    if (!/duration|timeout|wait/i.test(key)) continue
    const n = parseInt(String(value), 10)
    if (!Number.isNaN(n) && n > maxDuration) maxDuration = n
  }

  if (maxDuration > 0) return Math.max(MIN_MS, maxDuration + PAD_MS)
  return DEFAULT_MS
}
