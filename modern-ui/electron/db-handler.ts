import mysql from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'
import { assertSafeSqlIdentifier, DB_QUERY_MAX_ROWS } from './db-sql-utils.js'
import { formatSqlInserts } from '../src/lib/db-export-format.js'

let connection: Connection | null = null
let currentDatabase: string | null = null

/** ponytail: per-table meta cache; cleared on disconnect. Page changes = SELECT only. */
type TableMeta = {
  columnTypes: Record<string, string>
  primaryKeys: string[]
  rowEstimate: number
}
const tableMetaCache = new Map<string, TableMeta>()

function tableMetaKey(db: string, table: string): string {
  return `${db}\0${table}`
}

async function selectDatabase(database: string): Promise<void> {
  if (!connection) throw new Error('Not connected')
  const safe = assertSafeSqlIdentifier(database)
  if (!safe) throw new Error('Invalid database name')
  if (currentDatabase === safe) return
  await connection.query(`USE \`${safe}\``)
  currentDatabase = safe
}

async function fetchTableMeta(safeDb: string, safeTable: string): Promise<TableMeta> {
  if (!connection) throw new Error('Not connected')
  const [colResult, keyResult, estResult] = await Promise.all([
    connection.query(`SHOW FULL COLUMNS FROM \`${safeTable}\` FROM \`${safeDb}\``),
    connection.query(
      `SHOW KEYS FROM \`${safeTable}\` FROM \`${safeDb}\` WHERE Key_name = 'PRIMARY'`,
    ),
    connection.query(
      `SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [safeDb, safeTable],
    ),
  ])
  const columnTypes: Record<string, string> = {}
  for (const r of colResult[0] as any[]) {
    columnTypes[String(r.Field)] = String(r.Type)
  }
  const primaryKeys = (keyResult[0] as any[])
    .sort((a, b) => (a.Seq_in_index ?? 0) - (b.Seq_in_index ?? 0))
    .map((r) => String(r.Column_name))
  const rowEstimate = parseInt(String((estResult[0] as any[])[0]?.TABLE_ROWS), 10) || 0
  return { columnTypes, primaryKeys, rowEstimate }
}

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
    currentDatabase = null
    tableMetaCache.clear()

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
  currentDatabase = null
  tableMetaCache.clear()
}

/** List databases on the existing connection (no reconnect). */
export async function dbListDatabases(): Promise<{ ok: true; databases: string[] } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  try {
    const [rows] = await connection.query('SHOW DATABASES')
    const databases = (rows as any[]).map((r: any) => Object.values(r)[0] as string)
    return { ok: true, databases }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to list databases' }
  }
}

export async function dbGetTables(database: string): Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  const safe = assertSafeSqlIdentifier(database)
  if (!safe) return { ok: false, error: 'Invalid database name' }
  try {
    const [rows] = await connection.query(
      `SELECT TABLE_NAME, TABLE_ROWS
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
         AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [safe],
    )

    const tables = (rows as any[]).map((r) => ({
      name: String(r.TABLE_NAME),
      rows: parseInt(String(r.TABLE_ROWS), 10) || 0,
    }))

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
  | { ok: true; columns: string[]; rows: any[]; total: number; columnTypes: Record<string, string>; primaryKeys: string[] }
  | { ok: false; error: string }
> {
  if (!connection) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  const safeTable = assertSafeSqlIdentifier(table)
  if (!safeDb || !safeTable) return { ok: false, error: 'Invalid database or table name' }
  try {
    await selectDatabase(safeDb)

    const cacheKey = tableMetaKey(safeDb, safeTable)
    const cached = tableMetaCache.get(cacheKey)

    const dataPromise = connection.query(
      `SELECT * FROM \`${safeTable}\` LIMIT ? OFFSET ?`,
      [limit, offset],
    )
    const metaPromise = cached ? Promise.resolve(cached) : fetchTableMeta(safeDb, safeTable)

    const [[rows, fields], meta] = await Promise.all([dataPromise, metaPromise])
    if (!cached) tableMetaCache.set(cacheKey, meta)

    const rowArr = rows as any[]
    const columns = (fields as any[]).map((f: any) => f.name)

    let total = meta.rowEstimate
    if (rowArr.length < limit) {
      total = offset + rowArr.length
    } else {
      total = Math.max(total, offset + limit + 1)
    }

    return {
      ok: true,
      columns,
      rows: rowArr.map(sanitizeRow),
      total,
      columnTypes: meta.columnTypes,
      primaryKeys: meta.primaryKeys,
    }
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
      await selectDatabase(database)
    }

    let sql = query.trim()
    const isSelect = /^\s*(select|show|describe|desc|explain)\b/i.test(sql)
    if (isSelect && !/\blimit\b/i.test(sql)) {
      sql = `${sql.replace(/;\s*$/, '')} LIMIT ${DB_QUERY_MAX_ROWS}`
    }

    const [result, fields] = await connection.query(sql)

    if (Array.isArray(result)) {
      const columns = fields ? (fields as any[]).map((f: any) => f.name) : []
      const rows = (result as any[]).map(sanitizeRow).slice(0, DB_QUERY_MAX_ROWS)
      const truncated = (result as any[]).length > DB_QUERY_MAX_ROWS
      return {
        ok: true,
        columns,
        rows,
        ...(truncated ? { message: `Results truncated to ${DB_QUERY_MAX_ROWS} rows` } : {}),
      }
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
    await selectDatabase(database)

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
    await selectDatabase(database)

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
    await selectDatabase(database)

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
    await selectDatabase(database)

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
    await selectDatabase(database)

    const [countResult] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${table}\``)
    const total = parseInt(String((countResult as any[])[0].cnt), 10) || 0

    const [colRows] = await connection.query(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
    const columns = (colRows as any[]).map((r: any) => String(r.Field))

    const allRows: any[] = []
    const batchSize = 5000
    let offset = 0
    const conn = connection
    let hasMore = true

    while (hasMore) {
      const [batch] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [batchSize, offset])
      const batchArr = batch as any[]
      if (batchArr.length === 0) {
        hasMore = false
        break
      }
      for (const r of batchArr) {
        allRows.push(sanitizeRow(r))
      }
      offset += batchArr.length
    }

    return { ok: true, columns, rows: allRows, total }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Export failed' }
  }
}

/** Full database dump: CREATE TABLE statements + INSERT rows for every table. */
export async function dbExportDatabaseSql(
  database: string,
): Promise<{ ok: true; sql: string } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  if (!safeDb) return { ok: false, error: 'Invalid database name' }
  try {
    await selectDatabase(safeDb)
    const tablesResult = await dbGetTables(safeDb)
    if (!tablesResult.ok) return { ok: false, error: 'Failed to list tables' }

    const chunks: string[] = []
    const ts = new Date().toISOString()
    chunks.push(`-- MySQL dump generated ${ts}\n-- Database: \`${safeDb}\`\n\n`)
    chunks.push(`CREATE DATABASE IF NOT EXISTS \`${safeDb}\`;\nUSE \`${safeDb}\`;\n\n`)
    chunks.push('SET FOREIGN_KEY_CHECKS=0;\n\n')

    for (const { name: tableName } of tablesResult.tables) {
      const safeTable = assertSafeSqlIdentifier(tableName)
      if (!safeTable) continue

      const [createResult] = await connection.query(`SHOW CREATE TABLE \`${safeTable}\``)
      const createRow = (createResult as any[])[0] as Record<string, string> | undefined
      const createSql = createRow?.['Create Table'] ?? createRow?.['Create View']
      if (!createSql) continue

      chunks.push(`--\n-- Table structure for table \`${safeTable}\`\n--\n\n`)
      chunks.push(`DROP TABLE IF EXISTS \`${safeTable}\`;\n`)
      chunks.push(`${createSql};\n\n`)

      const data = await dbExportTable(safeDb, safeTable)
      if (!data.ok) {
        return { ok: false, error: data.error }
      }
      if (data.rows.length > 0) {
        chunks.push(`--\n-- Dumping data for table \`${safeTable}\`\n--\n\n`)
        chunks.push(formatSqlInserts(safeTable, data.columns, data.rows))
        chunks.push('\n\n')
      }
    }

    chunks.push('SET FOREIGN_KEY_CHECKS=1;\n')
    return { ok: true, sql: chunks.join('') }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Database export failed' }
  }
}

import type {
  DbSchemaColumn,
  DbSchemaForeignKey,
  DbSchemaTable,
} from '../src/lib/db-schema-types.js'
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
    await selectDatabase(database)

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

const DB_IMPORT_MAX_ROWS = 10_000

export async function dbImportRows(
  database: string,
  table: string,
  rows: Record<string, any>[],
): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }> {
  if (!connection) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  const safeTable = assertSafeSqlIdentifier(table)
  if (!safeDb || !safeTable) return { ok: false, error: 'Invalid database or table name' }
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows to import' }
  if (rows.length > DB_IMPORT_MAX_ROWS) {
    return { ok: false, error: `Import limited to ${DB_IMPORT_MAX_ROWS} rows per batch` }
  }

  try {
    await selectDatabase(safeDb)

    const [colRows] = await connection.query(`SHOW FULL COLUMNS FROM \`${safeTable}\` FROM \`${safeDb}\``)
    const validCols = new Set((colRows as any[]).map((r) => String(r.Field)))

    let inserted = 0
    let skipped = 0
    const conn = connection

    await conn.beginTransaction()
    try {
      for (const row of rows) {
        const entries = Object.entries(row).filter(([k, v]) => validCols.has(k) && v !== undefined)
        if (entries.length === 0) {
          skipped++
          continue
        }
        const colList = entries.map(([k]) => `\`${k}\``).join(', ')
        const placeholders = entries.map(() => '?').join(', ')
        const sql = `INSERT INTO \`${safeTable}\` (${colList}) VALUES (${placeholders})`
        const params = entries.map(([, v]) => v)
        await conn.query(sql, params)
        inserted++
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    }

    return { ok: true, inserted, skipped }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Import failed' }
  }
}

export function dbIsConnected(): boolean {
  return connection !== null
}

/** Exposes the active connection for streaming export helpers in main process. */
export function getDbConnection(): Connection | null {
  return connection
}
