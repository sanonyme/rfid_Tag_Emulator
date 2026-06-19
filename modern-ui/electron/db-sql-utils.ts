const SAFE_IDENTIFIER = /^[A-Za-z0-9_$]+$/

export function assertSafeSqlIdentifier(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed || !SAFE_IDENTIFIER.test(trimmed)) return null
  return trimmed
}

export const DB_QUERY_MAX_ROWS = 1000
