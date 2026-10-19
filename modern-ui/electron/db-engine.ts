/** Shared DB engine helpers for MySQL and PostgreSQL. */

export type DbEngine = 'mysql' | 'postgres'

export const DEFAULT_PORTS: Record<DbEngine, number> = {
  mysql: 3306,
  postgres: 5432,
}

export function resolveDbPort(engine: DbEngine, port?: number): number {
  const fallback = DEFAULT_PORTS[engine]
  if (port == null || !Number.isFinite(port)) return fallback
  const n = Math.floor(port)
  return n >= 1 && n <= 65535 ? n : fallback
}

export function quoteIdent(engine: DbEngine, name: string): string {
  if (engine === 'postgres') return `"${String(name).replace(/"/g, '""')}"`
  return `\`${String(name).replace(/`/g, '``')}\``
}

/**
 * Convert MySQL-style `` `ident` `` quoting to PostgreSQL `"ident"`, then
 * turn `?` placeholders into `$1…$n` for node-postgres.
 * String literals stay untouched so values containing backticks are safe.
 */
export function toPgText(sql: string): string {
  const quoted = translateMysqlIdentsToPg(sql)
  let i = 0
  return quoted.replace(/\?/g, () => `$${++i}`)
}

/** Exported for unit tests — identifier rewrite only. */
export function translateMysqlIdentsToPg(sql: string): string {
  let out = ''
  let i = 0
  let inSingle = false
  let inDouble = false
  while (i < sql.length) {
    const ch = sql[i]!
    if (inSingle) {
      out += ch
      if (ch === "'" && sql[i + 1] === "'") {
        out += sql[++i]
        i++
        continue
      }
      if (ch === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      out += ch
      if (ch === '"' && sql[i + 1] === '"') {
        out += sql[++i]
        i++
        continue
      }
      if (ch === '"') inDouble = false
      i++
      continue
    }
    if (ch === "'") {
      inSingle = true
      out += ch
      i++
      continue
    }
    if (ch === '"') {
      inDouble = true
      out += ch
      i++
      continue
    }
    if (ch === '`') {
      let j = i + 1
      let name = ''
      while (j < sql.length) {
        if (sql[j] === '`' && sql[j + 1] === '`') {
          name += '`'
          j += 2
          continue
        }
        if (sql[j] === '`') break
        name += sql[j]!
        j++
      }
      out += `"${name.replace(/"/g, '""')}"`
      i = j < sql.length ? j + 1 : j
      continue
    }
    out += ch
    i++
  }
  return out
}

export const PG_SYSTEM_SCHEMAS = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
])
