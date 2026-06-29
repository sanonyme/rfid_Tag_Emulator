const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'AS',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP',
  'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'TRUNCATE', 'REPLACE', 'SHOW', 'DESCRIBE',
  'EXPLAIN', 'USE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC',
])

const CLAUSE_BREAK = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'UNION',
  'INSERT', 'UPDATE', 'DELETE', 'SET', 'VALUES', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'ON',
])

function splitStatements(sql: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const prev = sql[i - 1]

    if (inSingle) {
      current += ch
      if (ch === "'" && prev !== '\\') inSingle = false
      continue
    }
    if (inDouble) {
      current += ch
      if (ch === '"' && prev !== '\\') inDouble = false
      continue
    }
    if (inBacktick) {
      current += ch
      if (ch === '`') inBacktick = false
      continue
    }

    if (ch === "'") { inSingle = true; current += ch; continue }
    if (ch === '"') { inDouble = true; current += ch; continue }
    if (ch === '`') { inBacktick = true; current += ch; continue }
    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; continue }

    if (ch === ';' && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) parts.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }

  const tail = current.trim()
  if (tail) parts.push(tail)
  return parts.length > 0 ? parts : ['']
}

function tokenize(sql: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (/\s/.test(ch)) { i++; continue }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      let token = ch
      i++
      while (i < sql.length) {
        token += sql[i]
        if (sql[i] === quote && sql[i - 1] !== '\\') { i++; break }
        i++
      }
      tokens.push(token)
      continue
    }

    if (/[(),;=]/.test(ch)) {
      tokens.push(ch)
      i++
      continue
    }

    let word = ''
    while (i < sql.length && !/\s/.test(sql[i]) && !/[(),;=]/.test(sql[i])) {
      word += sql[i]
      i++
    }
    if (word) tokens.push(word)
  }
  return tokens
}

function formatStatement(sql: string): string {
  const tokens = tokenize(sql.replace(/\s+/g, ' ').trim())
  if (tokens.length === 0) return sql.trim()

  const lines: string[] = []
  let indent = 0
  let line = ''
  let pendingClauseBreak = false

  const pushLine = () => {
    const trimmed = line.trimEnd()
    if (trimmed) lines.push(trimmed)
    line = '  '.repeat(indent)
  }

  const appendToken = (token: string, upper: string) => {
    if (CLAUSE_BREAK.has(upper)) {
      if (line.trim()) pushLine()
      pendingClauseBreak = false
      line = '  '.repeat(indent) + upper
      if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'SET', 'VALUES', 'GROUP', 'ORDER', 'HAVING', 'LIMIT'].includes(upper)) {
        pendingClauseBreak = true
      }
      return
    }

    if (token === '(') {
      line += (line.endsWith(' ') || line === '' ? '' : ' ') + '('
      indent++
      return
    }
    if (token === ')') {
      if (line.trim()) pushLine()
      indent = Math.max(0, indent - 1)
      line = '  '.repeat(indent) + ')'
      return
    }
    if (token === ',') {
      line += ','
      pushLine()
      return
    }

    const display = KEYWORDS.has(upper) ? upper : token
    if (line === '' || line.endsWith('(')) {
      line += display
    } else if (pendingClauseBreak) {
      line += '\n' + '  '.repeat(indent) + display
      pendingClauseBreak = false
    } else {
      line += ' ' + display
    }
  }

  for (const token of tokens) {
    const upper = token.toUpperCase()
    appendToken(token, upper)
  }
  if (line.trim()) pushLine()
  return lines.join('\n')
}

/** Best-effort SQL prettifier for the query editor (MySQL-oriented). */
export function prettifySql(sql: string): string {
  const trimmed = sql.trim()
  if (!trimmed) return trimmed
  return splitStatements(trimmed)
    .map((stmt) => formatStatement(stmt))
    .join(';\n\n')
}
