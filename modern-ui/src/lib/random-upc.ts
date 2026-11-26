import { EPCDecoder } from '@/lib/decoder'
import {
  definedItemsToUpcLines,
  isUsableUpcBarcode,
  type AtsDatabase,
  type DefinedItem,
} from '@/lib/defined-items'

const ATS_DATABASES = ['ats_db_staging', 'ats_db'] as const

export type RandomUpcSource = 'item' | 'generated'

export interface RandomUpcLinesResult {
  text: string
  itemCount: number
  tagCount: number
  source: RandomUpcSource
  database?: AtsDatabase
}

function clampPositiveInt(value: number, fallback: number, max = 500): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.floor(value)))
}

/** Build a GTIN-14 with a valid GS1 check digit. Inject `random` for tests. */
export function generateRandomGtin14(random: () => number = Math.random): string {
  let body = ''
  for (let i = 0; i < 13; i++) {
    body += Math.floor(random() * 10).toString()
  }
  return body + EPCDecoder.calculateCheckDigit(body)
}

export function generateRandomUpcLines(
  lineCount: number,
  countPerItem = 1,
  random: () => number = Math.random,
): RandomUpcLinesResult {
  const n = clampPositiveInt(lineCount, 5)
  const count = clampPositiveInt(countPerItem, 1, 9999)
  const seen = new Set<string>()
  const items: DefinedItem[] = []

  // Cap attempts so we still finish if RNG collides.
  let attempts = 0
  while (items.length < n && attempts < n * 20) {
    attempts++
    const barcode = generateRandomGtin14(random)
    if (seen.has(barcode)) continue
    seen.add(barcode)
    items.push({ barcode })
  }

  const text = definedItemsToUpcLines(items, count)
  return {
    text,
    itemCount: items.length,
    tagCount: items.length * count,
    source: 'generated',
  }
}

/** SQL used by the Fixed-tab “random from item” path (MySQL). */
export function buildRandomItemBarcodeSql(limit: number): string {
  const n = clampPositiveInt(limit, 5)
  return [
    'SELECT DISTINCT TRIM(barcode) AS barcode',
    'FROM item',
    "WHERE barcode IS NOT NULL",
    "  AND TRIM(barcode) <> ''",
    "  AND TRIM(barcode) REGEXP '^[0-9]{1,14}$'",
    'ORDER BY RAND()',
    `LIMIT ${n}`,
  ].join('\n')
}

function listAtsDatabases(available: string[]): AtsDatabase[] {
  return ATS_DATABASES.filter((name) => available.includes(name))
}

/**
 * Pick up to `lineCount` random numeric barcodes from `item.barcode`
 * on ats_db_staging (preferred) or ats_db.
 */
export async function fetchRandomItemUpcLines(
  host: string,
  user: string,
  password: string,
  lineCount: number,
  countPerItem = 1,
): Promise<RandomUpcLinesResult> {
  const api = window.electronAPI
  if (!api?.dbConnect || !api.dbExecuteQuery || !api.dbDisconnect) {
    throw new Error('Database access requires the desktop app')
  }

  const n = clampPositiveInt(lineCount, 5)
  const count = clampPositiveInt(countPerItem, 1, 9999)

  const conn = await api.dbConnect(host.trim(), user.trim(), password)
  if (!conn.ok) {
    throw new Error(conn.error || 'Database connection failed')
  }

  try {
    const candidates = listAtsDatabases(conn.databases)
    if (candidates.length === 0) {
      throw new Error('Neither ats_db_staging nor ats_db was found on this host')
    }

    const database = candidates[0]
    const result = await api.dbExecuteQuery(buildRandomItemBarcodeSql(n), database)
    if (!result.ok) {
      throw new Error(result.error || `Failed to read random item.barcode from ${database}`)
    }

    const items: DefinedItem[] = []
    for (const row of result.rows) {
      const barcode = String(row.barcode ?? '').trim()
      if (!isUsableUpcBarcode(barcode)) continue
      items.push({ barcode })
    }

    if (items.length === 0) {
      throw new Error(`No numeric barcodes found in ${database}.item`)
    }

    return {
      text: definedItemsToUpcLines(items, count),
      itemCount: items.length,
      tagCount: items.length * count,
      source: 'item',
      database,
    }
  } finally {
    await api.dbDisconnect()
  }
}
