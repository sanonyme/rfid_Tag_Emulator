export interface ParsedImport {
  columns: string[]
  rows: Record<string, string>[]
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      fields.push(current)
      current = ''
      continue
    }
    current += ch
  }
  fields.push(current)
  return fields
}

export function parseCsvImport(text: string): ParsedImport {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) throw new Error('CSV file is empty')

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new Error('CSV must include a header row')
  }

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((col, idx) => {
      if (!col) return
      row[col] = values[idx] ?? ''
    })
    rows.push(row)
  }

  return { columns: headers.filter(Boolean), rows }
}

export function parseJsonImport(text: string): ParsedImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON')
  }

  let rowsRaw: unknown[]
  if (Array.isArray(parsed)) {
    rowsRaw = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows)) {
    rowsRaw = (parsed as { rows: unknown[] }).rows
  } else {
    throw new Error('JSON must be an array of objects or { "rows": [...] }')
  }

  if (rowsRaw.length === 0) throw new Error('JSON contains no rows')

  const columns = new Set<string>()
  for (const row of rowsRaw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Each JSON row must be an object')
    }
    Object.keys(row as object).forEach((k) => columns.add(k))
  }

  const colList = Array.from(columns)
  const rows = rowsRaw.map((row) => {
    const out: Record<string, string> = {}
    for (const col of colList) {
      const val = (row as Record<string, unknown>)[col]
      out[col] = val === null || val === undefined ? '' : String(val)
    }
    return out
  })

  return { columns: colList, rows }
}

export function parseImportFile(text: string, filename: string): ParsedImport {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) return parseJsonImport(text)
  if (lower.endsWith('.csv')) return parseCsvImport(text)
  const trimmed = text.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseJsonImport(text)
    } catch {
      /* fall through to CSV */
    }
  }
  return parseCsvImport(text)
}

/** Map string cell values to SQL-friendly values (NULL token, numbers unchanged). */
export function coerceImportValue(raw: string): string | number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.toUpperCase() === 'NULL') return null
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  return raw
}
