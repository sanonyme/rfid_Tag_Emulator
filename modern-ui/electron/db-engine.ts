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

/** Convert `?` placeholders to `$1…$n` for node-postgres. */
export function toPgText(sql: string): string {
  let i = 0
  return sql.replace(/\?/g, () => `$${++i}`)
}

export const PG_SYSTEM_SCHEMAS = new Set([
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
])
