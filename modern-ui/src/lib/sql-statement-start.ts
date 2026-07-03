function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '')
}

function nextLineStart(rest: string): string {
  const eol = rest.search(/[\r\n]/)
  if (eol === -1) return ''
  return rest.slice(eol).replace(/^[\r\n]+/, '')
}

/** Skip leading line/block SQL comments so statement classification matches the DB backend. */
export function sqlStatementStart(sql: string): string {
  let rest = sql.trim()
  for (;;) {
    rest = rest.trimStart()
    if (rest.startsWith('--') || rest.startsWith('#')) {
      rest = nextLineStart(rest)
      continue
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/')
      rest = end === -1 ? '' : rest.slice(end + 2)
      continue
    }
    break
  }
  return rest.trimStart()
}

function startsWithKeyword(sql: string, keyword: string): boolean {
  if (!sql.startsWith(keyword)) return false
  const next = sql.charAt(keyword.length)
  return next === '' || (!/[A-Za-z0-9_]/.test(next))
}

/** Whether the statement is a read-only query (matches the Rust DB backend). */
export function isReadQuery(sql: string): boolean {
  const lower = sqlStatementStart(stripTrailingSemicolon(sql.trim())).toLowerCase()
  return ['select', 'show', 'describe', 'desc', 'explain', 'with', 'table'].some((kw) =>
    startsWithKeyword(lower, kw),
  )
}

/** Token-based LIMIT detection (avoids false positives like column names containing "limit"). */
export function hasLimitClause(sql: string): boolean {
  return sql
    .split(/[^A-Za-z0-9_]+/)
    .some((token) => token.toLowerCase() === 'limit')
}

/** Strip leading comments and optional EXPLAIN prefix for plan analysis. */
export function sqlExplainTarget(sql: string): string {
  let stmt = sqlStatementStart(stripTrailingSemicolon(sql.trim()))
  stmt = stmt.replace(/^\s*explain\s+(?:analyze\s+)?/i, '')
  return sqlStatementStart(stmt)
}

export function normalizeReadQuery(sql: string): string {
  return sqlStatementStart(stripTrailingSemicolon(sql.trim()))
}

/** Build executable read SQL, dropping leading comments and applying a row cap when needed. */
export function prepareReadQuery(sql: string, maxRows: number): string {
  const body = stripTrailingSemicolon(sql.trim())
  const stmt = normalizeReadQuery(body)
  if (isReadQuery(body) && !hasLimitClause(stmt)) {
    return `${stmt} LIMIT ${maxRows}`
  }
  return body
}
