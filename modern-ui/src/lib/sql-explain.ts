import { sqlExplainTarget, sqlStatementStart } from './sql-statement-start'

const EXPLAINABLE = /^(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i

const CREATE_TABLE =
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:`[^`]+`)|(?:[\w$]+))/i

export type BuildExplainResult =
  | { ok: true; sql: string; note?: string }
  | { ok: false; error: string }

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '')
}

/** Extract table identifier from a CREATE TABLE statement. */
export function extractCreateTableName(sql: string): string | null {
  const match = sqlStatementStart(stripTrailingSemicolon(sql.trim())).match(CREATE_TABLE)
  return match?.[1] ?? null
}

/** Whether MariaDB/MySQL can run EXPLAIN on this statement as-is. */
export function isDirectlyExplainable(sql: string): boolean {
  return EXPLAINABLE.test(sqlExplainTarget(sql))
}

/**
 * Build an EXPLAIN statement for the editor query.
 * DDL (e.g. CREATE TABLE) is mapped to EXPLAIN SELECT on that table when possible.
 */
export function buildExplainSql(query: string): BuildExplainResult {
  const trimmed = query.trim()
  if (!trimmed) {
    return { ok: false, error: 'Nothing to explain' }
  }

  const sql = stripTrailingSemicolon(trimmed)
  const stmt = sqlStatementStart(sql)
  const target = sqlExplainTarget(sql)

  if (/^\s*explain\b/i.test(stmt)) {
    if (isDirectlyExplainable(sql)) {
      return { ok: true, sql: `EXPLAIN ${target}` }
    }
    const createTable = extractCreateTableName(target)
    if (createTable) {
      return {
        ok: false,
        error: 'EXPLAIN does not apply to CREATE TABLE. Use a SELECT query instead.',
      }
    }
    return {
      ok: false,
      error: 'EXPLAIN only works on SELECT, INSERT, UPDATE, DELETE, and REPLACE queries.',
    }
  }

  if (isDirectlyExplainable(sql)) {
    return { ok: true, sql: `EXPLAIN ${target}` }
  }

  const tableName = extractCreateTableName(stmt)
  if (tableName) {
    return {
      ok: true,
      sql: `EXPLAIN SELECT * FROM ${tableName} LIMIT 0`,
      note: `EXPLAIN does not apply to CREATE TABLE — showing plan for SELECT on ${tableName}.`,
    }
  }

  if (/^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|USE|SHOW|DESCRIBE|DESC)\b/i.test(stmt)) {
    return {
      ok: false,
      error: 'EXPLAIN only works on SELECT, INSERT, UPDATE, DELETE, and REPLACE queries.',
    }
  }

  return {
    ok: false,
    error: 'Could not build an EXPLAIN for this statement. Try a SELECT query.',
  }
}
