import fs from 'fs'
import path from 'path'
import { finished } from 'stream/promises'
import type { Connection } from 'mysql2/promise'
import { formatCsvRow } from '../src/lib/db-export-format.js'
import { formatSqlInserts } from '../src/lib/db-export-format.js'
import { assertSafeSqlIdentifier } from './db-sql-utils.js'

const BATCH_SIZE = 10_000

export type DbExportProgress = {
  message: string
  exportedRows?: number
  totalRows?: number
  tableIndex?: number
  tableCount?: number
}

function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null
  if (typeof val === 'bigint') return Number(val)
  if (Buffer.isBuffer(val)) return val.toString('hex')
  if (val instanceof Date) return val.toISOString()
  return val
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    out[key] = sanitizeValue(row[key])
  }
  return out
}

async function writeChunk(stream: fs.WriteStream, chunk: string): Promise<void> {
  if (stream.write(chunk)) return
  await new Promise<void>((resolve) => stream.once('drain', resolve))
}

async function getTableColumns(conn: Connection, database: string, table: string): Promise<string[]> {
  const [colRows] = await conn.query(`SHOW FULL COLUMNS FROM \`${table}\` FROM \`${database}\``)
  return (colRows as { Field: string }[]).map((r) => String(r.Field))
}

async function getTableRowCount(conn: Connection, table: string): Promise<number> {
  const [countResult] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${table}\``)
  return parseInt(String((countResult as { cnt: number }[])[0]?.cnt), 10) || 0
}

async function streamTableRows(
  conn: Connection,
  table: string,
  columns: string[],
  total: number,
  onBatch: (rows: Record<string, unknown>[], exported: number) => Promise<void>,
  onProgress?: (exported: number, total: number) => void,
): Promise<number> {
  let offset = 0
  let exported = 0

  while (true) {
    const [batch] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [BATCH_SIZE, offset])
    const batchArr = batch as Record<string, unknown>[]
    if (batchArr.length === 0) break

    const sanitized = batchArr.map((r) => sanitizeRow(r))
    await onBatch(sanitized, exported)
    exported += sanitized.length
    offset += sanitized.length
    onProgress?.(exported, total)
    if (sanitized.length < BATCH_SIZE) break
  }

  return exported
}

export async function streamTableExportToFile(
  conn: Connection,
  database: string,
  table: string,
  filePath: string,
  format: 'csv' | 'sql',
  onProgress?: (progress: DbExportProgress) => void,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const safeDb = assertSafeSqlIdentifier(database)
  const safeTable = assertSafeSqlIdentifier(table)
  if (!safeDb || !safeTable) return { ok: false, error: 'Invalid database or table name' }

  try {
    await conn.query(`USE \`${safeDb}\``)
    const columns = await getTableColumns(conn, safeDb, safeTable)
    const total = await getTableRowCount(conn, safeTable)

    onProgress?.({ message: `Exporting ${safeTable}…`, exportedRows: 0, totalRows: total })

    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })

    if (format === 'csv') {
      await writeChunk(stream, `${columns.join(',')}\n`)
    } else {
      await writeChunk(stream, `-- Table: ${safeDb}.${safeTable}\n\n`)
    }

    const exported = await streamTableRows(
      conn,
      safeTable,
      columns,
      total,
      async (rows) => {
        if (format === 'csv') {
          for (const row of rows) {
            await writeChunk(stream, `${formatCsvRow(columns, row)}\n`)
          }
        } else if (rows.length > 0) {
          await writeChunk(stream, `${formatSqlInserts(safeTable, columns, rows)}\n`)
        }
      },
      (done, tot) => {
        onProgress?.({
          message: `Exporting ${safeTable}…`,
          exportedRows: done,
          totalRows: tot,
        })
      },
    )

    stream.end()
    await finished(stream)
    return { ok: true, total: exported }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Export failed'
    try {
      fs.unlinkSync(filePath)
    } catch {
      /* ignore partial file cleanup errors */
    }
    return { ok: false, error: message }
  }
}

export async function streamDatabaseSqlToFile(
  conn: Connection,
  database: string,
  filePath: string,
  listTables: (db: string) => Promise<{ ok: true; tables: { name: string }[] } | { ok: false; error: string }>,
  onProgress?: (progress: DbExportProgress) => void,
): Promise<{ ok: true; tableCount: number; totalRows: number } | { ok: false; error: string }> {
  const safeDb = assertSafeSqlIdentifier(database)
  if (!safeDb) return { ok: false, error: 'Invalid database name' }

  try {
    await conn.query(`USE \`${safeDb}\``)
    const tablesResult = await listTables(safeDb)
    if (!tablesResult.ok) return { ok: false, error: 'Failed to list tables' }

    const tables = tablesResult.tables
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
    const ts = new Date().toISOString()

    await writeChunk(
      stream,
      `-- MySQL dump generated ${ts}\n-- Database: \`${safeDb}\`\n\nCREATE DATABASE IF NOT EXISTS \`${safeDb}\`;\nUSE \`${safeDb}\`;\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`,
    )

    let totalRows = 0

    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].name
      const safeTable = assertSafeSqlIdentifier(tableName)
      if (!safeTable) continue

      onProgress?.({
        message: `Dumping structure for ${safeTable}…`,
        tableIndex: i + 1,
        tableCount: tables.length,
      })

      const [createResult] = await conn.query(`SHOW CREATE TABLE \`${safeTable}\``)
      const createRow = (createResult as Record<string, string>[])[0]
      const createSql = createRow?.['Create Table'] ?? createRow?.['Create View']
      if (!createSql) continue

      await writeChunk(
        stream,
        `--\n-- Table structure for table \`${safeTable}\`\n--\n\nDROP TABLE IF EXISTS \`${safeTable}\`;\n${createSql};\n\n`,
      )

      const columns = await getTableColumns(conn, safeDb, safeTable)
      const rowCount = await getTableRowCount(conn, safeTable)
      if (rowCount === 0) continue

      await writeChunk(stream, `--\n-- Dumping data for table \`${safeTable}\`\n--\n\n`)

      const exported = await streamTableRows(
        conn,
        safeTable,
        columns,
        rowCount,
        async (rows) => {
          if (rows.length > 0) {
            await writeChunk(stream, `${formatSqlInserts(safeTable, columns, rows)}\n`)
          }
        },
        (done, tot) => {
          onProgress?.({
            message: `Exporting ${safeTable}…`,
            exportedRows: done,
            totalRows: tot,
            tableIndex: i + 1,
            tableCount: tables.length,
          })
        },
      )
      totalRows += exported
      await writeChunk(stream, '\n')
    }

    await writeChunk(stream, 'SET FOREIGN_KEY_CHECKS=1;\n')
    stream.end()
    await finished(stream)
    return { ok: true, tableCount: tables.length, totalRows }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database export failed'
    try {
      fs.unlinkSync(filePath)
    } catch {
      /* ignore */
    }
    return { ok: false, error: message }
  }
}

export async function streamDatabaseCsvToFolder(
  conn: Connection,
  database: string,
  folderPath: string,
  listTables: (db: string) => Promise<{ ok: true; tables: { name: string }[] } | { ok: false; error: string }>,
  onProgress?: (progress: DbExportProgress) => void,
): Promise<{ ok: true; tableCount: number; totalRows: number } | { ok: false; error: string }> {
  const safeDb = assertSafeSqlIdentifier(database)
  if (!safeDb) return { ok: false, error: 'Invalid database name' }

  try {
    const tablesResult = await listTables(safeDb)
    if (!tablesResult.ok) return { ok: false, error: 'Failed to list tables' }

    let totalRows = 0
    const tables = tablesResult.tables

    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].name
      const safeTable = assertSafeSqlIdentifier(tableName)
      if (!safeTable) continue

      const filePath = path.join(folderPath, `${safeDb}_${safeTable}.csv`)
      onProgress?.({
        message: `Exporting ${safeTable} to CSV…`,
        tableIndex: i + 1,
        tableCount: tables.length,
      })

      const result = await streamTableExportToFile(conn, safeDb, safeTable, filePath, 'csv', (p) => {
        onProgress?.({
          ...p,
          tableIndex: i + 1,
          tableCount: tables.length,
        })
      })
      if (!result.ok) return result
      totalRows += result.total
    }

    return { ok: true, tableCount: tables.length, totalRows }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'CSV export failed' }
  }
}
