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

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  key: string
  extra: string
  comment: string
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
): Promise<
  { ok: true; columns: string[]; rows: any[]; total: number; columnTypes: Record<string, string> } | { ok: false; error: string }
> {
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

    const [colRows] = await connection.query(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
    const columnTypes: Record<string, string> = {}
    for (const r of colRows as any[]) {
      columnTypes[String(r.Field)] = String(r.Type)
    }

    return { ok: true, columns, rows: (rows as any[]).map(sanitizeRow), total, columnTypes }
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

export async function dbGetTableStructure(
  database: string,
  table: string
): Promise<{ ok: true; columns: ColumnInfo[] } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    const [rows] = await connection.query(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
    const columns: ColumnInfo[] = (rows as any[]).map((r: any) => ({
      name: String(r.Field),
      type: String(r.Type),
      nullable: r.Null === 'YES',
      defaultValue: r.Default === null || r.Default === undefined ? null : String(r.Default),
      key: String(r.Key ?? ''),
      extra: String(r.Extra ?? ''),
      comment: String(r.Comment ?? ''),
    }))
    return { ok: true, columns }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbDeleteRow(
  database: string,
  table: string,
  primaryKeys: Record<string, any>
): Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const whereEntries = Object.entries(primaryKeys)
    if (whereEntries.length === 0) return { ok: false, error: 'No primary key provided' }

    const whereClauses = whereEntries.map(([k]) => `\`${k}\` = ?`).join(' AND ')
    const whereValues = whereEntries.map(([, v]) => v)

    const sql = `DELETE FROM \`${table}\` WHERE ${whereClauses} LIMIT 1`
    const [result] = await connection.query(sql, whereValues)
    const affected = parseInt(String((result as any).affectedRows ?? '0'), 10) || 0
    return { ok: true, affectedRows: affected }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbInsertRow(
  database: string,
  table: string,
  values: Record<string, any>
): Promise<{ ok: true; insertId: any } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const entries = Object.entries(values)
    if (entries.length === 0) return { ok: false, error: 'No columns to insert' }

    const colList = entries.map(([k]) => `\`${k}\``).join(', ')
    const placeholders = entries.map(() => '?').join(', ')
    const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`
    const params = entries.map(([, v]) => v)

    const [result] = await connection.query(sql, params)
    const insertId = sanitizeValue((result as any).insertId)
    return { ok: true, insertId }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbDeleteRows(
  database: string,
  table: string,
  rows: Record<string, any>[]
): Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const pkCols = await dbGetPrimaryKeys(database, table)
    if (pkCols.length === 0) return { ok: false, error: 'No primary key on table' }

    let totalAffected = 0
    const conn = connection
    for (const row of rows) {
      const whereEntries = pkCols.map((col) => [col, row[col]] as [string, any])
      if (whereEntries.some(([, v]) => v === undefined)) {
        return { ok: false, error: 'Row missing primary key field' }
      }
      const whereClauses = whereEntries.map(([k]) => `\`${k}\` = ?`).join(' AND ')
      const whereValues = whereEntries.map(([, v]) => v)
      const sql = `DELETE FROM \`${table}\` WHERE ${whereClauses} LIMIT 1`
      const [result] = await conn.query(sql, whereValues)
      totalAffected += parseInt(String((result as any).affectedRows ?? '0'), 10) || 0
    }
    return { ok: true, affectedRows: totalAffected }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Delete failed' }
  }
}

export async function dbExportTable(
  database: string,
  table: string
): Promise<{ ok: true; columns: string[]; rows: any[]; total: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    await connection.query(`USE \`${database}\``)

    const [countResult] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${table}\``)
    const total = parseInt(String((countResult as any[])[0].cnt), 10) || 0

    const [colRows] = await connection.query(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
    const columns = (colRows as any[]).map((r: any) => String(r.Field))

    const allRows: any[] = []
    const batchSize = 5000
    let offset = 0
    const conn = connection

    while (true) {
      const [batch] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [batchSize, offset])
      const batchArr = batch as any[]
      if (batchArr.length === 0) break
      for (const r of batchArr) {
        allRows.push(sanitizeRow(r))
      }
      offset += batchSize
    }

    return { ok: true, columns, rows: allRows, total }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Export failed' }
  }
}

export interface DbSchemaColumn {
  name: string
  type: string
  key: string
}

export interface DbSchemaTable {
  name: string
  columns: DbSchemaColumn[]
}

export interface DbSchemaForeignKey {
  constraintName: string
  childTable: string
  childColumns: string[]
  parentTable: string
  parentColumns: string[]
}

/** Tables + foreign keys from INFORMATION_SCHEMA for ER-style visualization */
export async function dbGetDatabaseSchema(
  database: string
): Promise<
  | { ok: true; tables: DbSchemaTable[]; foreignKeys: DbSchemaForeignKey[] }
  | { ok: false; error: string }
> {
  if (!connection) return { ok: false, error: 'Not connected' }
  if (database.includes('`') || database.includes('\0')) {
    return { ok: false, error: 'Invalid database name' }
  }
  try {
    await connection.query(`USE \`${database}\``)

    const [colRows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database]
    )

    const tableMap = new Map<string, DbSchemaTable>()
    for (const r of colRows as any[]) {
      const tname = String(r.TABLE_NAME)
      if (!tableMap.has(tname)) {
        tableMap.set(tname, { name: tname, columns: [] })
      }
      tableMap.get(tname)!.columns.push({
        name: String(r.COLUMN_NAME),
        type: String(r.COLUMN_TYPE),
        key: String(r.COLUMN_KEY || ''),
      })
    }

    const [fkRows] = await connection.query(
      `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
              REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
      [database]
    )

    type FkGroup = {
      constraintName: string
      childTable: string
      parentTable: string
      pairs: { child: string; parent: string }[]
    }
    const fkGroups = new Map<string, FkGroup>()
    for (const r of fkRows as any[]) {
      const childTable = String(r.TABLE_NAME)
      const cname = String(r.CONSTRAINT_NAME)
      const key = `${childTable}\0${cname}`
      const parentTable = String(r.REFERENCED_TABLE_NAME)
      if (!fkGroups.has(key)) {
        fkGroups.set(key, {
          constraintName: cname,
          childTable,
          parentTable,
          pairs: [],
        })
      }
      fkGroups.get(key)!.pairs.push({
        child: String(r.COLUMN_NAME),
        parent: String(r.REFERENCED_COLUMN_NAME),
      })
    }

    const foreignKeys: DbSchemaForeignKey[] = []
    for (const g of fkGroups.values()) {
      foreignKeys.push({
        constraintName: g.constraintName,
        childTable: g.childTable,
        childColumns: g.pairs.map((p) => p.child),
        parentTable: g.parentTable,
        parentColumns: g.pairs.map((p) => p.parent),
      })
    }

    const tables = Array.from(tableMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return { ok: true, tables, foreignKeys }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Schema load failed' }
  }
}

export function dbIsConnected(): boolean {
  return connection !== null
}
