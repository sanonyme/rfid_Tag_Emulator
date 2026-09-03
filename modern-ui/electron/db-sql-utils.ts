const SAFE_IDENTIFIER = /^[A-Za-z0-9_$]+$/

export function assertSafeSqlIdentifier(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed || !SAFE_IDENTIFIER.test(trimmed)) return null
  return trimmed
}

export const DB_QUERY_MAX_ROWS = 1000

/**
 * Append a row cap to SELECT (and WITH … SELECT) only.
 * SHOW / DESCRIBE / EXPLAIN reject LIMIT on MariaDB/MySQL — results are still
 * sliced in JS after the query returns.
 */
export function applyQueryRowLimit(sql: string, cap: number): string {
  const trimmed = sql.trim()
  if (!Number.isFinite(cap) || cap <= 0) return trimmed
  const body = trimmed.replace(/;+\s*$/, '')
  const isSelect =
    /^\s*select\b/i.test(body) ||
    /^\s*with\b[\s\S]*\bselect\b/i.test(body)
  if (!isSelect) return trimmed
  if (/\blimit\b/i.test(body)) return trimmed
  return `${body} LIMIT ${Math.floor(cap)}`
}
