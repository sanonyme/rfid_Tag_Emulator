const ATS_DATABASES = ['ats_db_staging', 'ats_db'] as const

export type AtsDatabase = (typeof ATS_DATABASES)[number]

export interface DefinedItem {
  barcode: string
}

export interface FetchDefinedItemsResult {
  database: AtsDatabase
  items: DefinedItem[]
  skippedNonNumeric: number
}

function isUsableUpcBarcode(value: string): boolean {
  return /^\d{1,14}$/.test(value)
}

async function listAtsDatabases(available: string[]): Promise<AtsDatabase[]> {
  return ATS_DATABASES.filter((name) => available.includes(name))
}

/**
 * Fetch distinct barcodes from `item.barcode` on the connected edge host.
 * Prefers `ats_db_staging` when both staging and production databases exist.
 */
export async function fetchDefinedItems(
  host: string,
  user: string,
  password: string,
): Promise<FetchDefinedItemsResult> {
  const api = window.electronAPI
  if (!api?.dbConnect || !api.dbExecuteQuery || !api.dbDisconnect) {
    throw new Error('Database access requires the desktop app')
  }

  const conn = await api.dbConnect(host.trim(), user.trim(), password)
  if (!conn.ok) {
    throw new Error(conn.error || 'Database connection failed')
  }

  try {
    const candidates = await listAtsDatabases(conn.databases)
    if (candidates.length === 0) {
      throw new Error('Neither ats_db_staging nor ats_db was found on this host')
    }

    const database = candidates[0]
    const query = `
      SELECT DISTINCT TRIM(barcode) AS barcode
      FROM item
      WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
      ORDER BY barcode
    `
    const result = await api.dbExecuteQuery(query, database)
    if (!result.ok) {
      throw new Error(result.error || `Failed to read item.barcode from ${database}`)
    }

    const items: DefinedItem[] = []
    let skippedNonNumeric = 0
    for (const row of result.rows) {
      const barcode = String(row.barcode ?? '').trim()
      if (!barcode) continue
      if (!isUsableUpcBarcode(barcode)) {
        skippedNonNumeric++
        continue
      }
      items.push({ barcode })
    }

    return { database, items, skippedNonNumeric }
  } finally {
    await api.dbDisconnect()
  }
}

export function definedItemsToUpcLines(items: DefinedItem[], countPerItem = 1): string {
  const count = Math.max(1, Math.floor(countPerItem))
  return items.map((item) => `${item.barcode},${count}`).join('\n')
}
