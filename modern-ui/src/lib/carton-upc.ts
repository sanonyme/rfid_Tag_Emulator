import {
  buildCartonInspectSql,
  groupCartonInspectRows,
  PACKING_QUERY_MAX_ROWS,
  type InspectLine,
} from '@/components/database/db-inspect'
import type { SchemaData } from '@/components/database/db-tab-shared'
import { isUsableUpcBarcode } from '@/lib/defined-items'

const ATS_DATABASES = ['ats_db_staging', 'ats_db'] as const

export type CartonUpcLines = {
  text: string
  itemCount: number
  tagCount: number
  skipped: number
}

export type FetchCartonUpcResult = {
  database: string
  sscc: string
  orderNumber: string
  text: string
  itemCount: number
  tagCount: number
  skipped: number
}

/**
 * Turn carton expected-item lines into Fixed-tab `UPC,QTY` text.
 * Duplicate barcodes are merged (quantities summed). Non-numeric barcodes are skipped.
 */
export function inspectLinesToUpcLines(lines: InspectLine[]): CartonUpcLines {
  const merged = new Map<string, number>()
  let skipped = 0

  for (const line of lines) {
    const barcode = line.barcode.trim()
    if (!barcode || !isUsableUpcBarcode(barcode)) {
      skipped++
      continue
    }
    const qty = Number.isFinite(line.quantity) && line.quantity > 0 ? Math.floor(line.quantity) : 1
    merged.set(barcode, (merged.get(barcode) ?? 0) + qty)
  }

  const entries = [...merged.entries()]
  return {
    text: entries.map(([barcode, qty]) => `${barcode},${qty}`).join('\n'),
    itemCount: entries.length,
    tagCount: entries.reduce((sum, [, qty]) => sum + qty, 0),
    skipped,
  }
}

export async function fetchCartonUpcLines(
  host: string,
  user: string,
  password: string,
  sscc: string,
): Promise<FetchCartonUpcResult> {
  const api = window.electronAPI
  if (!api?.dbConnect || !api.dbExecuteQuery || !api.dbDisconnect) {
    throw new Error('Database access requires the desktop app')
  }

  const carton = sscc.trim()
  if (!carton) {
    throw new Error('Enter a carton number')
  }

  const conn = await api.dbConnect(host.trim(), user.trim(), password)
  if (!conn.ok) {
    throw new Error(conn.error || 'Database connection failed')
  }

  try {
    const candidates = ATS_DATABASES.filter((name) => conn.databases.includes(name))
    if (candidates.length === 0) {
      throw new Error('Neither ats_db_staging nor ats_db was found on this host')
    }

    const database = candidates[0]
    let schema: SchemaData | null = null
    if (api.dbGetDatabaseSchema) {
      const schemaRes = await api.dbGetDatabaseSchema(database)
      if (schemaRes.ok) {
        schema = { tables: schemaRes.tables, foreignKeys: schemaRes.foreignKeys }
      }
    }

    const built = buildCartonInspectSql(schema, carton)
    if (!built.ok) {
      throw new Error(built.error)
    }

    const result = await api.dbExecuteQuery(built.sql, database, PACKING_QUERY_MAX_ROWS)
    if (!result.ok) {
      throw new Error(result.error || `Failed to look up carton in ${database}`)
    }

    const model = groupCartonInspectRows(result.rows, carton)
    if (!model.found) {
      throw new Error(`Carton ${carton} was not found`)
    }

    const converted = inspectLinesToUpcLines(model.lines)
    if (converted.itemCount === 0) {
      throw new Error(
        converted.skipped > 0
          ? `Carton ${model.sscc || carton} has expected items, but none have a numeric UPC`
          : `Carton ${model.sscc || carton} has no expected items`,
      )
    }

    return {
      database,
      sscc: model.sscc || carton,
      orderNumber: model.orderNumber,
      text: converted.text,
      itemCount: converted.itemCount,
      tagCount: converted.tagCount,
      skipped: converted.skipped,
    }
  } finally {
    await api.dbDisconnect()
  }
}
