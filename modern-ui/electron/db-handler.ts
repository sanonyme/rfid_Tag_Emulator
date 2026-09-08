import mysql from 'mysql2/promise'
import type { Connection } from 'mysql2/promise'
import pg from 'pg'
import { applyQueryRowLimit, assertSafeSqlIdentifier, DB_QUERY_MAX_ROWS } from './db-sql-utils.js'
import {
  type DbEngine,
  PG_SYSTEM_SCHEMAS,
  quoteIdent,
  resolveDbPort,
  toPgText,
} from './db-engine.js'
import { formatSqlInserts, formatSqlInsertValue } from '../src/lib/db-export-format.js'
import type {
  DbSchemaForeignKey,
  DbSchemaTable,
} from '../src/lib/db-schema-types.js'

export type { DbEngine } from './db-engine.js'

export type DbConnectOptions = {
  engine?: DbEngine
  database?: string
  ssl?: boolean
  port?: number
}

let engine: DbEngine = 'mysql'
let mysqlConn: Connection | null = null
let pgClient: import('pg').Client | null = null
/** MySQL: selected database. PostgreSQL: selected schema (search_path). */
let currentDatabase: string | null = null
/** Actual PostgreSQL database name we connected to. */
let pgDatabaseName: string | null = null

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

function isConnected(): boolean {
  return engine === 'postgres' ? pgClient !== null : mysqlConn !== null
}

function qIdent(name: string): string {
  return quoteIdent(engine, name)
}

async function closeAllConnections(): Promise<void> {
  if (mysqlConn) {
    await mysqlConn.end().catch(() => {})
    mysqlConn = null
  }
  if (pgClient) {
    await pgClient.end().catch(() => {})
    pgClient = null
  }
  currentDatabase = null
  pgDatabaseName = null
  tableMetaCache.clear()
}

async function execQuery(
  sql: string,
  params: any[] = [],
): Promise<{ rows: any[]; fields?: any[]; affectedRows?: number; insertId?: any }> {
  if (engine === 'postgres') {
    if (!pgClient) throw new Error('Not connected')
    const result = await pgClient.query(toPgText(sql), params)
    return {
      rows: result.rows ?? [],
      fields: result.fields as any[] | undefined,
      affectedRows: result.rowCount ?? 0,
    }
  }
  if (!mysqlConn) throw new Error('Not connected')
  const [result, fields] = await mysqlConn.query(sql, params)
  if (Array.isArray(result)) {
    return { rows: result, fields: fields as any[] }
  }
  return {
    rows: [],
    fields: fields as any[] | undefined,
    affectedRows: parseInt(String((result as any).affectedRows ?? '0'), 10) || 0,
    insertId: (result as any).insertId,
  }
}

async function selectDatabase(database: string): Promise<void> {
  if (!isConnected()) throw new Error('Not connected')
  const safe = assertSafeSqlIdentifier(database)
  if (!safe) throw new Error('Invalid database name')
  if (currentDatabase === safe) return

  if (engine === 'postgres') {
    await execQuery(`SET search_path TO ${quoteIdent('postgres', safe)}`)
  } else {
    await mysqlConn!.query(`USE \`${safe}\``)
  }
  currentDatabase = safe
}

async function listSchemasOrDatabases(): Promise<string[]> {
  if (engine === 'postgres') {
    const { rows } = await execQuery(
      `SELECT schema_name AS name
       FROM information_schema.schemata
       ORDER BY schema_name`,
    )
    return rows
      .map((r) => String(r.name))
      .filter((name) => !PG_SYSTEM_SCHEMAS.has(name))
  }
  const { rows } = await execQuery('SHOW DATABASES')
  return rows.map((r: any) => Object.values(r)[0] as string)
}

async function fetchTableMeta(safeDb: string, safeTable: string): Promise<TableMeta> {
  if (!isConnected()) throw new Error('Not connected')

  if (engine === 'postgres') {
    const [colResult, keyResult, estResult] = await Promise.all([
      execQuery(
        `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [safeDb, safeTable],
      ),
      execQuery(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_schema = kcu.constraint_schema
          AND tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = ?
           AND tc.table_name = ?
         ORDER BY kcu.ordinal_position`,
        [safeDb, safeTable],
      ),
      execQuery(
        `SELECT COALESCE(c.reltuples, 0)::bigint AS estimate
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = ? AND c.relname = ? AND c.relkind = 'r'`,
        [safeDb, safeTable],
      ),
    ])
    const columnTypes: Record<string, string> = {}
    for (const r of colResult.rows) {
      const udt = String(r.udt_name ?? '')
      const dt = String(r.data_type ?? '')
      columnTypes[String(r.column_name)] = udt || dt
    }
    const primaryKeys = keyResult.rows.map((r) => String(r.column_name))
    const rowEstimate = parseInt(String(estResult.rows[0]?.estimate ?? 0), 10) || 0
    return { columnTypes, primaryKeys, rowEstimate }
  }

  const [colResult, keyResult, estResult] = await Promise.all([
    mysqlConn!.query(`SHOW FULL COLUMNS FROM \`${safeTable}\` FROM \`${safeDb}\``),
    mysqlConn!.query(
      `SHOW KEYS FROM \`${safeTable}\` FROM \`${safeDb}\` WHERE Key_name = 'PRIMARY'`,
    ),
    mysqlConn!.query(
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

function formatPgSqlInserts(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0 || columns.length === 0) return ''
  const colList = columns.map((c) => quoteIdent('postgres', c)).join(', ')
  const qTable = quoteIdent('postgres', table)
  return rows
    .map((row) => {
      const vals = columns.map((c) => formatSqlInsertValue(row[c]))
      return `INSERT INTO ${qTable} (${colList}) VALUES (${vals.join(', ')});`
    })
    .join('\n')
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

function parseConnectArgs(
  portOrOptions?: number | DbConnectOptions,
  maybeOptions?: DbConnectOptions,
): { engine: DbEngine; port?: number; database?: string; ssl: boolean } {
  let options: DbConnectOptions = {}
  let port: number | undefined

  if (typeof portOrOptions === 'number') {
    port = portOrOptions
    if (maybeOptions) options = maybeOptions
  } else if (portOrOptions && typeof portOrOptions === 'object') {
    options = portOrOptions
    port = options.port
  }

  const resolvedEngine: DbEngine = options.engine === 'postgres' ? 'postgres' : 'mysql'
  return {
    engine: resolvedEngine,
    port: port ?? options.port,
    database: options.database,
    ssl: Boolean(options.ssl),
  }
}

export async function dbConnect(
  host: string,
  user: string,
  password: string,
  portOrOptions?: number | DbConnectOptions,
  maybeOptions?: DbConnectOptions,
): Promise<{ ok: true; databases: string[]; engine: DbEngine } | { ok: false; error: string }> {
  try {
    await closeAllConnections()

    const parsed = parseConnectArgs(portOrOptions, maybeOptions)
    engine = parsed.engine
    const resolvedPort = resolveDbPort(engine, parsed.port)

    if (engine === 'postgres') {
      const dbName = parsed.database?.trim() || 'postgres'
      pgDatabaseName = dbName
      pgClient = new pg.Client({
        host,
        port: resolvedPort,
        user,
        password,
        database: dbName,
        connectionTimeoutMillis: 10000,
        ...(parsed.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
      })
      await pgClient.connect()
    } else {
      mysqlConn = await mysql.createConnection({
        host,
        port: resolvedPort,
        user,
        password,
        connectTimeout: 10000,
        supportBigNumbers: true,
        bigNumberStrings: true,
      })
    }

    const databases = await listSchemasOrDatabases()
    return { ok: true, databases, engine }
  } catch (err: any) {
    await closeAllConnections()
    engine = 'mysql'
    return { ok: false, error: err.message || 'Connection failed' }
  }
}

export async function dbDisconnect(): Promise<void> {
  await closeAllConnections()
  engine = 'mysql'
}

/** List databases on the existing connection (no reconnect). */
export async function dbListDatabases(): Promise<{ ok: true; databases: string[] } | { ok: false; error: string }> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    const databases = await listSchemasOrDatabases()
    return { ok: true, databases }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Failed to list databases' }
  }
}

export async function dbGetTables(database: string): Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  const safe = assertSafeSqlIdentifier(database)
  if (!safe) return { ok: false, error: 'Invalid database name' }
  try {
    if (engine === 'postgres') {
      const { rows } = await execQuery(
        `SELECT t.table_name AS name,
                COALESCE((
                  SELECT c.reltuples::bigint
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = t.table_schema
                    AND c.relname = t.table_name
                    AND c.relkind = 'r'
                ), 0) AS row_estimate
         FROM information_schema.tables t
         WHERE t.table_schema = ?
           AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name`,
        [safe],
      )
      const tables = rows.map((r) => ({
        name: String(r.name),
        rows: parseInt(String(r.row_estimate), 10) || 0,
      }))
      return { ok: true, tables }
    }

    const { rows } = await execQuery(
      `SELECT TABLE_NAME, TABLE_ROWS
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
         AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [safe],
    )

    const tables = rows.map((r) => ({
      name: String(r.TABLE_NAME),
      rows: parseInt(String(r.TABLE_ROWS), 10) || 0,
    }))

    return { ok: true, tables }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export type DbTableDataFilter = {
  search?: string
  sortColumn?: string
  sortDir?: 'asc' | 'desc'
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function buildTableDataClauses(
  columnNames: string[],
  filter?: DbTableDataFilter,
): { whereClause: string; orderClause: string; whereParams: string[] } {
  const search = filter?.search?.trim()
  let whereClause = ''
  const whereParams: string[] = []

  if (search) {
    const like = `%${escapeLikePattern(search)}%`
    const castType = engine === 'postgres' ? 'text' : 'CHAR'
    const parts = columnNames.map((c) => `CAST(${qIdent(c)} AS ${castType}) LIKE ?`)
    whereClause = ` WHERE (${parts.join(' OR ')})`
    whereParams.push(...columnNames.map(() => like))
  }

  let orderClause = ''
  if (filter?.sortColumn && filter.sortDir) {
    const safeCol = assertSafeSqlIdentifier(filter.sortColumn)
    if (safeCol && columnNames.includes(safeCol)) {
      orderClause = ` ORDER BY ${qIdent(safeCol)} ${filter.sortDir === 'desc' ? 'DESC' : 'ASC'}`
    }
  }

  return { whereClause, orderClause, whereParams }
}

export async function dbGetTableData(
  database: string,
  table: string,
  limit = 1000,
  offset = 0,
  filter?: DbTableDataFilter,
): Promise<
  | { ok: true; columns: string[]; rows: any[]; total: number; columnTypes: Record<string, string>; primaryKeys: string[] }
  | { ok: false; error: string }
> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  const safeTable = assertSafeSqlIdentifier(table)
  if (!safeDb || !safeTable) return { ok: false, error: 'Invalid database or table name' }
  try {
    await selectDatabase(safeDb)

    const cacheKey = tableMetaKey(safeDb, safeTable)
    const cached = tableMetaCache.get(cacheKey)
    const meta = cached ?? await fetchTableMeta(safeDb, safeTable)
    if (!cached) tableMetaCache.set(cacheKey, meta)

    const columnNames = Object.keys(meta.columnTypes)
    const { whereClause, orderClause, whereParams } = buildTableDataClauses(columnNames, filter)
    const searchActive = Boolean(filter?.search?.trim())

    const dataSql = `SELECT * FROM ${qIdent(safeTable)}${whereClause}${orderClause} LIMIT ? OFFSET ?`
    const dataParams = [...whereParams, limit, offset]

    const countPromise = searchActive
      ? execQuery(`SELECT COUNT(*) AS cnt FROM ${qIdent(safeTable)}${whereClause}`, whereParams)
      : Promise.resolve(null)

    const [dataResult, countResult] = await Promise.all([
      execQuery(dataSql, dataParams),
      countPromise,
    ])

    const rowArr = dataResult.rows
    let columns =
      dataResult.fields && dataResult.fields.length > 0
        ? dataResult.fields.map((f: any) => f.name)
        : columnNames
    if (columns.length === 0 && rowArr.length > 0) {
      columns = Object.keys(rowArr[0])
    }

    let total: number
    if (searchActive && countResult) {
      total = parseInt(String(countResult.rows[0]?.cnt), 10) || 0
    } else if (rowArr.length < limit) {
      total = offset + rowArr.length
    } else {
      total = Math.max(meta.rowEstimate, offset + limit + 1)
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
  database?: string,
  maxRows: number = DB_QUERY_MAX_ROWS,
): Promise<{ ok: true; columns: string[]; rows: any[]; affectedRows?: number; insertId?: number | string; message?: string } | { ok: false; error: string }> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    if (database) {
      await selectDatabase(database)
    }

    const cap = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : DB_QUERY_MAX_ROWS
    const sql = applyQueryRowLimit(query, cap)

    if (engine === 'postgres') {
      if (!pgClient) return { ok: false, error: 'Not connected' }
      const pgResult = await pgClient.query(toPgText(sql))
      const cmd = String(pgResult.command || '').toUpperCase()
      const isResultSet =
        cmd === 'SELECT' ||
        cmd === 'SHOW' ||
        cmd === 'WITH' ||
        (Boolean(pgResult.fields?.length) && !['INSERT', 'UPDATE', 'DELETE'].includes(cmd))

      if (isResultSet || (pgResult.fields?.length && cmd === '')) {
        const columns = (pgResult.fields || []).map((f: any) => f.name)
        const rows = (pgResult.rows || []).map(sanitizeRow).slice(0, cap)
        const truncated = (pgResult.rows || []).length > cap
        return {
          ok: true,
          columns,
          rows,
          ...(truncated ? { message: `Results truncated to ${cap} rows` } : {}),
        }
      }

      // INSERT/UPDATE/DELETE — optionally with RETURNING rows
      if (pgResult.fields?.length && pgResult.rows?.length) {
        const columns = pgResult.fields.map((f: any) => f.name)
        const rows = pgResult.rows.map(sanitizeRow).slice(0, cap)
        const affected = pgResult.rowCount ?? rows.length
        return {
          ok: true,
          columns,
          rows,
          affectedRows: affected,
          message: `OK — ${affected} row(s) affected`,
        }
      }

      const affected = pgResult.rowCount ?? 0
      return {
        ok: true,
        columns: [],
        rows: [],
        affectedRows: affected,
        message: `OK — ${affected} row(s) affected`,
      }
    }

    if (!mysqlConn) return { ok: false, error: 'Not connected' }
    const [result, fields] = await mysqlConn.query(sql)

    if (Array.isArray(result)) {
      const columns = fields ? (fields as any[]).map((f: any) => f.name) : []
      const rows = (result as any[]).map(sanitizeRow).slice(0, cap)
      const truncated = (result as any[]).length > cap
      return {
        ok: true,
        columns,
        rows,
        ...(truncated ? { message: `Results truncated to ${cap} rows` } : {}),
      }
    }

    const affected = parseInt(String((result as any).affectedRows ?? '0'), 10) || 0
    const insertId = sanitizeValue((result as any).insertId)
    return {
      ok: true,
      columns: [],
      rows: [],
      affectedRows: affected,
      ...(insertId !== null && insertId !== undefined && insertId !== 0 ? { insertId } : {}),
      message: `OK — ${affected} row(s) affected${insertId ? `, insertId ${insertId}` : ''}`,
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbGetPrimaryKeys(
  database: string,
  table: string
): Promise<string[]> {
  if (!isConnected()) return []
  try {
    if (engine === 'postgres') {
      const { rows } = await execQuery(
        `SELECT kcu.column_name AS COLUMN_NAME
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_schema = kcu.constraint_schema
          AND tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = ?
           AND tc.table_name = ?
         ORDER BY kcu.ordinal_position`,
        [database, table],
      )
      return rows.map((r: any) => String(r.COLUMN_NAME ?? r.column_name))
    }

    const { rows } = await execQuery(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY ORDINAL_POSITION`,
      [database, table],
    )
    return rows.map((r: any) => r.COLUMN_NAME)
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    await selectDatabase(database)

    const setClauses = `${qIdent(column)} = ?`
    const whereEntries = Object.entries(primaryKeys)
    if (whereEntries.length === 0) return { ok: false, error: 'No primary key provided' }

    const whereClauses = whereEntries.map(([k]) => `${qIdent(k)} = ?`).join(' AND ')
    const whereValues = whereEntries.map(([, v]) => v)

    const limitSql = engine === 'postgres' ? '' : ' LIMIT 1'
    const sql = `UPDATE ${qIdent(table)} SET ${setClauses} WHERE ${whereClauses}${limitSql}`
    const params = [value === '' ? null : value, ...whereValues]

    const result = await execQuery(sql, params)
    const affected = parseInt(String(result.affectedRows ?? '0'), 10) || 0
    return { ok: true, affectedRows: affected }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function dbGetTableStructure(
  database: string,
  table: string
): Promise<{ ok: true; columns: ColumnInfo[] } | { ok: false; error: string }> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    if (engine === 'postgres') {
      const [colResult, pkResult] = await Promise.all([
        execQuery(
          `SELECT column_name, data_type, udt_name, is_nullable, column_default,
                  character_maximum_length, numeric_precision, numeric_scale
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ?
           ORDER BY ordinal_position`,
          [database, table],
        ),
        dbGetPrimaryKeys(database, table),
      ])
      const pkSet = new Set(pkResult)
      const columns: ColumnInfo[] = colResult.rows.map((r: any) => {
        const udt = String(r.udt_name ?? '')
        const dt = String(r.data_type ?? '')
        let type = udt || dt
        if (r.character_maximum_length != null && (dt === 'character varying' || dt === 'character')) {
          type = `${dt === 'character' ? 'char' : 'varchar'}(${r.character_maximum_length})`
        } else if (r.numeric_precision != null && (dt === 'numeric' || dt === 'decimal')) {
          type = `${dt}(${r.numeric_precision}${r.numeric_scale != null ? `,${r.numeric_scale}` : ''})`
        }
        return {
          name: String(r.column_name),
          type,
          nullable: String(r.is_nullable).toUpperCase() === 'YES',
          defaultValue: r.column_default === null || r.column_default === undefined ? null : String(r.column_default),
          key: pkSet.has(String(r.column_name)) ? 'PRI' : '',
          extra: '',
          comment: '',
        }
      })
      return { ok: true, columns }
    }

    const { rows } = await execQuery(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
    const columns: ColumnInfo[] = rows.map((r: any) => ({
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    await selectDatabase(database)

    const whereEntries = Object.entries(primaryKeys)
    if (whereEntries.length === 0) return { ok: false, error: 'No primary key provided' }

    const whereClauses = whereEntries.map(([k]) => `${qIdent(k)} = ?`).join(' AND ')
    const whereValues = whereEntries.map(([, v]) => v)

    const limitSql = engine === 'postgres' ? '' : ' LIMIT 1'
    const sql = `DELETE FROM ${qIdent(table)} WHERE ${whereClauses}${limitSql}`
    const result = await execQuery(sql, whereValues)
    const affected = parseInt(String(result.affectedRows ?? '0'), 10) || 0
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    await selectDatabase(database)

    const entries = Object.entries(values)
    if (entries.length === 0) return { ok: false, error: 'No columns to insert' }

    const colList = entries.map(([k]) => qIdent(k)).join(', ')
    const placeholders = entries.map(() => '?').join(', ')
    const params = entries.map(([, v]) => v)

    if (engine === 'postgres') {
      const sql = `INSERT INTO ${qIdent(table)} (${colList}) VALUES (${placeholders}) RETURNING *`
      const result = await execQuery(sql, params)
      const returned = result.rows[0]
      const insertId = returned ? sanitizeValue(Object.values(returned)[0]) : null
      return { ok: true, insertId }
    }

    const sql = `INSERT INTO ${qIdent(table)} (${colList}) VALUES (${placeholders})`
    const result = await execQuery(sql, params)
    const insertId = sanitizeValue(result.insertId)
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    await selectDatabase(database)

    const pkCols = await dbGetPrimaryKeys(database, table)
    if (pkCols.length === 0) return { ok: false, error: 'No primary key on table' }

    let totalAffected = 0
    const limitSql = engine === 'postgres' ? '' : ' LIMIT 1'
    for (const row of rows) {
      const whereEntries = pkCols.map((col) => [col, row[col]] as [string, any])
      if (whereEntries.some(([, v]) => v === undefined)) {
        return { ok: false, error: 'Row missing primary key field' }
      }
      const whereClauses = whereEntries.map(([k]) => `${qIdent(k)} = ?`).join(' AND ')
      const whereValues = whereEntries.map(([, v]) => v)
      const sql = `DELETE FROM ${qIdent(table)} WHERE ${whereClauses}${limitSql}`
      const result = await execQuery(sql, whereValues)
      totalAffected += parseInt(String(result.affectedRows ?? '0'), 10) || 0
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  try {
    await selectDatabase(database)
    const safeTable = assertSafeSqlIdentifier(table)
    if (!safeTable) return { ok: false, error: 'Invalid table name' }

    const countResult = await execQuery(`SELECT COUNT(*) as cnt FROM ${qIdent(safeTable)}`)
    const total = parseInt(String(countResult.rows[0]?.cnt), 10) || 0

    let columns: string[]
    if (engine === 'postgres') {
      const colResult = await execQuery(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [database, safeTable],
      )
      columns = colResult.rows.map((r: any) => String(r.column_name))
    } else {
      const colResult = await execQuery(`SHOW FULL COLUMNS FROM \`${safeTable}\` FROM \`${database}\``)
      columns = colResult.rows.map((r: any) => String(r.Field))
    }

    const allRows: any[] = []
    const batchSize = 5000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const batch = await execQuery(
        `SELECT * FROM ${qIdent(safeTable)} LIMIT ? OFFSET ?`,
        [batchSize, offset],
      )
      const batchArr = batch.rows
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  if (!safeDb) return { ok: false, error: 'Invalid database name' }
  try {
    await selectDatabase(safeDb)
    const tablesResult = await dbGetTables(safeDb)
    if (!tablesResult.ok) return { ok: false, error: 'Failed to list tables' }

    const chunks: string[] = []
    const ts = new Date().toISOString()

    if (engine === 'postgres') {
      chunks.push(`-- PostgreSQL dump generated ${ts}\n`)
      chunks.push(`-- Schema: ${quoteIdent('postgres', safeDb)}\n`)
      chunks.push(`-- Database: ${quoteIdent('postgres', pgDatabaseName || 'postgres')}\n`)
      chunks.push(`-- Data-only dump (CREATE TABLE omitted)\n\n`)
      chunks.push(`SET search_path TO ${quoteIdent('postgres', safeDb)};\n\n`)

      for (const { name: tableName } of tablesResult.tables) {
        const safeTable = assertSafeSqlIdentifier(tableName)
        if (!safeTable) continue

        const data = await dbExportTable(safeDb, safeTable)
        if (data.ok === false) {
          return { ok: false, error: data.error }
        }
        chunks.push(`-- table ${safeDb}.${safeTable}\n`)
        if (data.rows.length > 0) {
          chunks.push(formatPgSqlInserts(safeTable, data.columns, data.rows))
          chunks.push('\n\n')
        } else {
          chunks.push('-- (no rows)\n\n')
        }
      }

      return { ok: true, sql: chunks.join('') }
    }

    chunks.push(`-- MySQL dump generated ${ts}\n-- Database: \`${safeDb}\`\n\n`)
    chunks.push(`CREATE DATABASE IF NOT EXISTS \`${safeDb}\`;\nUSE \`${safeDb}\`;\n\n`)
    chunks.push('SET FOREIGN_KEY_CHECKS=0;\n\n')

    for (const { name: tableName } of tablesResult.tables) {
      const safeTable = assertSafeSqlIdentifier(tableName)
      if (!safeTable) continue

      const createResult = await execQuery(`SHOW CREATE TABLE \`${safeTable}\``)
      const createRow = createResult.rows[0] as Record<string, string> | undefined
      const createSql = createRow?.['Create Table'] ?? createRow?.['Create View']
      if (!createSql) continue

      chunks.push(`--\n-- Table structure for table \`${safeTable}\`\n--\n\n`)
      chunks.push(`DROP TABLE IF EXISTS \`${safeTable}\`;\n`)
      chunks.push(`${createSql};\n\n`)

      const data = await dbExportTable(safeDb, safeTable)
      if (data.ok === false) {
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

export async function dbGetDatabaseSchema(
  database: string
): Promise<
  | { ok: true; tables: DbSchemaTable[]; foreignKeys: DbSchemaForeignKey[] }
  | { ok: false; error: string }
> {
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  if (database.includes('`') || database.includes('"') || database.includes('\0')) {
    return { ok: false, error: 'Invalid database name' }
  }
  try {
    await selectDatabase(database)

    const tableMap = new Map<string, DbSchemaTable>()

    if (engine === 'postgres') {
      const colResult = await execQuery(
        `SELECT table_name, column_name, data_type, udt_name, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = ?
         ORDER BY table_name, ordinal_position`,
        [database],
      )

      const pkResult = await execQuery(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_schema = kcu.constraint_schema
          AND tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = ?`,
        [database],
      )
      const pkByTable = new Map<string, Set<string>>()
      for (const r of pkResult.rows) {
        const tname = String(r.table_name)
        if (!pkByTable.has(tname)) pkByTable.set(tname, new Set())
        pkByTable.get(tname)!.add(String(r.column_name))
      }

      for (const r of colResult.rows) {
        const tname = String(r.table_name)
        if (!tableMap.has(tname)) {
          tableMap.set(tname, { name: tname, columns: [] })
        }
        const colName = String(r.column_name)
        const type = String(r.udt_name || r.data_type || '')
        const key = pkByTable.get(tname)?.has(colName) ? 'PRI' : ''
        tableMap.get(tname)!.columns.push({
          name: colName,
          type,
          key,
        })
      }

      const fkRows = await execQuery(
        `SELECT
           rc.constraint_name AS constraint_name,
           kcu.table_name AS table_name,
           kcu.column_name AS column_name,
           kcu.ordinal_position AS ordinal_position,
           ccu.table_name AS referenced_table_name,
           ccu.column_name AS referenced_column_name
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name
          AND kcu.constraint_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = rc.unique_constraint_name
          AND ccu.constraint_schema = rc.unique_constraint_schema
         WHERE kcu.table_schema = ?
         ORDER BY kcu.table_name, rc.constraint_name, kcu.ordinal_position`,
        [database],
      )

      type FkGroup = {
        constraintName: string
        childTable: string
        parentTable: string
        pairs: { child: string; parent: string }[]
      }
      const fkGroups = new Map<string, FkGroup>()
      for (const r of fkRows.rows) {
        const childTable = String(r.table_name)
        const cname = String(r.constraint_name)
        const key = `${childTable}\0${cname}`
        const parentTable = String(r.referenced_table_name)
        if (!fkGroups.has(key)) {
          fkGroups.set(key, {
            constraintName: cname,
            childTable,
            parentTable,
            pairs: [],
          })
        }
        fkGroups.get(key)!.pairs.push({
          child: String(r.column_name),
          parent: String(r.referenced_column_name),
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
    }

    const colResult = await execQuery(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database],
    )

    for (const r of colResult.rows) {
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

    const fkResult = await execQuery(
      `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
              REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
      [database],
    )

    type FkGroup = {
      constraintName: string
      childTable: string
      parentTable: string
      pairs: { child: string; parent: string }[]
    }
    const fkGroups = new Map<string, FkGroup>()
    for (const r of fkResult.rows) {
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
  if (!isConnected()) return { ok: false, error: 'Not connected' }
  const safeDb = assertSafeSqlIdentifier(database)
  const safeTable = assertSafeSqlIdentifier(table)
  if (!safeDb || !safeTable) return { ok: false, error: 'Invalid database or table name' }
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows to import' }
  if (rows.length > DB_IMPORT_MAX_ROWS) {
    return { ok: false, error: `Import limited to ${DB_IMPORT_MAX_ROWS} rows per batch` }
  }

  try {
    await selectDatabase(safeDb)

    let validCols: Set<string>
    if (engine === 'postgres') {
      const colResult = await execQuery(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?`,
        [safeDb, safeTable],
      )
      validCols = new Set(colResult.rows.map((r: any) => String(r.column_name)))
    } else {
      const colResult = await execQuery(`SHOW FULL COLUMNS FROM \`${safeTable}\` FROM \`${safeDb}\``)
      validCols = new Set(colResult.rows.map((r: any) => String(r.Field)))
    }

    let inserted = 0
    let skipped = 0

    if (engine === 'postgres') {
      await execQuery('BEGIN')
      try {
        for (const row of rows) {
          const entries = Object.entries(row).filter(([k, v]) => validCols.has(k) && v !== undefined)
          if (entries.length === 0) {
            skipped++
            continue
          }
          const colList = entries.map(([k]) => qIdent(k)).join(', ')
          const placeholders = entries.map(() => '?').join(', ')
          const sql = `INSERT INTO ${qIdent(safeTable)} (${colList}) VALUES (${placeholders})`
          const params = entries.map(([, v]) => v)
          await execQuery(sql, params)
          inserted++
        }
        await execQuery('COMMIT')
      } catch (err) {
        await execQuery('ROLLBACK').catch(() => {})
        throw err
      }
    } else {
      const conn = mysqlConn!
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
    }

    return { ok: true, inserted, skipped }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Import failed' }
  }
}

export function dbIsConnected(): boolean {
  return mysqlConn !== null || pgClient !== null
}

export function getDbEngine(): DbEngine {
  return engine
}

export function dbIsPostgres(): boolean {
  return engine === 'postgres'
}

/** Exposes the active MySQL connection for streaming export helpers in main process. */
export function getDbConnection(): Connection | null {
  return mysqlConn
}
