import mysql from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'

let connection: Connection | null = null

function sanitizeValue(val: any): any {
  if (val === null || val === undefined) return null
  if (typeof val === 'bigint') return Number(val)
  if (Buffer.isBuffer(val)) return val.toString('hex')
  if (val instanceof Date) return val.toISOString()
  return val
}

function sanitizeRow(row: any): any {
  const out: any = {}
  for (const key of Object.keys(row)) {
    out[key] = sanitizeValue(row[key])
  }
  return out
}

export async function dbConnect(host: string, user: string, password: string): Promise<{ ok: true; databases: string[] } | { ok: false; error: string }> {
  try {
    if (connection) {
      await connection.end().catch(() => {})
      connection = null
    }

    connection = await mysql.createConnection({
      host,
      user,
      password,
      connectTimeout: 10000,
      supportBigNumbers: true,
      bigNumberStrings: true,
    })

    const [rows] = await connection.query('SHOW DATABASES')
    const databases = (rows as any[]).map((r: any) => Object.values(r)[0] as string)

    return { ok: true, databases }
  } catch (err: any) {
    connection = null
    return { ok: false, error: err.message || 'Connection failed' }
  }
}

export async function dbDisconnect(): Promise<void> {
  if (connection) {
    await connection.end().catch(() => {})
    connection = null
  }
}

export async function dbGetTables(database: string): Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const [tableRows] = await connection.query('SHOW TABLES')
    const tableNames = (tableRows as any[]).map((r: any) => String(Object.values(r)[0]))

    // Get exact row counts in parallel — each query is independent
    const conn = connection
    const counts = await Promise.allSettled(
      tableNames.map(async (t) => {
        const [cr] = await conn.query(`SELECT COUNT(*) AS c FROM \`${database}\`.\`${t}\``)
        return { name: t, count: parseInt(String((cr as any[])[0].c), 10) || 0 }
      })
    )

    const tables = tableNames.map((name, i) => {
      const result = counts[i]
      const rows = result.status === 'fulfilled' ? result.value.count : 0
      return { name, rows }
    })

    return { ok: true, tables }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbGetTableData(
  database: string,
  table: string,
  limit = 1000,
  offset = 0
): Promise<{ ok: true; columns: string[]; rows: any[]; total: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const [countResult] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${table}\``)
    const total = parseInt(String((countResult as any[])[0].cnt), 10) || 0

    const [rows, fields] = await connection.query(
      `SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`,
      [limit, offset]
    )
    const columns = (fields as any[]).map((f: any) => f.name)

    return { ok: true, columns, rows: (rows as any[]).map(sanitizeRow), total }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbExecuteQuery(
  query: string,
  database?: string
): Promise<{ ok: true; columns: string[]; rows: any[]; affectedRows?: number; message?: string } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    if (database) {
      await connection.query(`USE \`${database}\``)
    }

    const [result, fields] = await connection.query(query)

    if (Array.isArray(result)) {
      const columns = fields ? (fields as any[]).map((f: any) => f.name) : []
      return { ok: true, columns, rows: (result as any[]).map(sanitizeRow) }
    }

    const affected = parseInt(String((result as any).affectedRows ?? '0'), 10) || 0
    return {
      ok: true,
      columns: [],
      rows: [],
      affectedRows: affected,
      message: `Query OK, ${affected} row(s) affected`,
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbGetPrimaryKeys(
  database: string,
  table: string
): Promise<string[]> {
  if (!connection) return []
  try {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY ORDINAL_POSITION`,
      [database, table]
    )
    return (rows as any[]).map((r: any) => r.COLUMN_NAME)
  } catch {
    return []
  }
}

export async function dbUpdateCell(
  database: string,
  table: string,
  primaryKeys: Record<string, any>,
  column: string,
  value: any
): Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const setClauses = `\`${column}\` = ?`
    const whereEntries = Object.entries(primaryKeys)
    if (whereEntries.length === 0) return { ok: false, error: 'No primary key provided' }

    const whereClauses = whereEntries.map(([k]) => `\`${k}\` = ?`).join(' AND ')
    const whereValues = whereEntries.map(([, v]) => v)

    const sql = `UPDATE \`${table}\` SET ${setClauses} WHERE ${whereClauses} LIMIT 1`
    const params = [value === '' ? null : value, ...whereValues]

    const [result] = await connection.query(sql, params)
    const affected = parseInt(String((result as any).affectedRows ?? '0'), 10) || 0
    return { ok: true, affectedRows: affected }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export function dbIsConnected(): boolean {
  return connection !== null
}
