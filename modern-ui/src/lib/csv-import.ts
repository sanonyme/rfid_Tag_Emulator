/**
 * Smart CSV → tag-list importer.
 *
 * The Fixed and Handheld tabs both consume two free-form line formats:
 *  - UPC:  `upc,count,tid,userdata` (tid and userdata optional)
 *  - EPC:  `epc,tid,userdata` (tid and userdata optional)
 *
 * Users often paste CSVs from Excel/SAP that contain extra columns and a
 * header row with arbitrary column ordering. This module detects the header,
 * the delimiter, reorders columns to the canonical layout, and drops blank
 * rows so the result can be appended directly to the textarea.
 */

export type TagListKind = 'upc' | 'epc'

const DELIMITERS = [',', '\t', ';', '|'] as const

const HEADER_ALIASES: Record<string, 'upc' | 'epc' | 'count' | 'tid' | 'userdata'> = {
  upc: 'upc',
  gtin: 'upc',
  sku: 'upc',
  ean: 'upc',
  ean13: 'upc',
  ean14: 'upc',
  item: 'upc',
  itemcode: 'upc',
  product: 'upc',
  productcode: 'upc',
  barcode: 'upc',
  epc: 'epc',
  tag: 'epc',
  tagid: 'epc',
  tagvalue: 'epc',
  count: 'count',
  qty: 'count',
  quantity: 'count',
  qte: 'count',
  amount: 'count',
  number: 'count',
  num: 'count',
  tid: 'tid',
  tagtid: 'tid',
  userdata: 'userdata',
  usermemory: 'userdata',
  usermem: 'userdata',
  userbank: 'userdata',
}

function normalizeHeader(s: string): string {
  return s.replace(/[\s_\-/.]/g, '').toLowerCase()
}

function detectDelimiter(sample: string): string {
  // Score each delimiter by how consistent the column count is across the
  // first ~5 non-empty lines. Higher count of equally-sized rows wins.
  const lines = sample
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
  let best = ','
  let bestScore = -1
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => l.split(d).length)
    if (counts.length === 0) continue
    const max = Math.max(...counts)
    if (max < 2) continue
    const matches = counts.filter((c) => c === max).length
    const score = max * 10 + matches
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

interface HeaderInfo {
  hasHeader: boolean
  indexOf: Partial<Record<'upc' | 'epc' | 'count' | 'tid' | 'userdata', number>>
}

function detectHeader(firstRow: string[], kind: TagListKind): HeaderInfo {
  const mapped = firstRow.map((cell) => HEADER_ALIASES[normalizeHeader(cell)])
  const recognised = mapped.filter(Boolean).length
  if (recognised === 0) return { hasHeader: false, indexOf: {} }

  // It looks like a header only if at least one cell maps to the *primary*
  // column for this kind ("upc" / "gtin" for upc-mode, "epc" / "tag" for epc-mode).
  const primary = kind === 'upc' ? 'upc' : 'epc'
  if (!mapped.includes(primary)) return { hasHeader: false, indexOf: {} }

  const indexOf: HeaderInfo['indexOf'] = {}
  mapped.forEach((role, i) => {
    if (role && indexOf[role] === undefined) indexOf[role] = i
  })
  return { hasHeader: true, indexOf }
}

function splitRow(line: string, delim: string): string[] {
  // No quoting support — these data files don't contain commas inside fields
  // in practice. If we ever need it, switch to a real CSV parser here.
  return line.split(delim).map((cell) => cell.trim())
}

function joinCells(cells: Array<string | undefined>): string {
  // Strip trailing blank cells so a row with no TID renders as `upc,5` not `upc,5,`.
  const trimmed = [...cells]
  while (trimmed.length > 0 && (trimmed[trimmed.length - 1] === '' || trimmed[trimmed.length - 1] === undefined)) {
    trimmed.pop()
  }
  return trimmed.map((c) => c ?? '').join(',')
}

export interface CsvImportResult {
  text: string
  rows: number
  hasHeader: boolean
  delimiter: string
}

/**
 * Parse a pasted/dropped block of CSV-like text and return the canonical
 * comma-separated form expected by the textareas.
 *
 * - For `kind: 'upc'`: returns rows of `UPC,Count,TID[,userdata]` (extra cells dropped).
 * - For `kind: 'epc'`: returns rows of `EPC,TID[,userdata]`.
 */
export function smartImport(raw: string, kind: TagListKind): CsvImportResult {
  const cleanLines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (cleanLines.length === 0) {
    return { text: '', rows: 0, hasHeader: false, delimiter: ',' }
  }

  const delimiter = detectDelimiter(cleanLines.join('\n'))
  const firstRow = splitRow(cleanLines[0], delimiter)
  const { hasHeader, indexOf } = detectHeader(firstRow, kind)
  const dataLines = hasHeader ? cleanLines.slice(1) : cleanLines

  const out: string[] = []
  for (const line of dataLines) {
    const cells = splitRow(line, delimiter)
    if (cells.every((c) => c === '')) continue

    if (kind === 'upc') {
      if (hasHeader) {
        const upc = cells[indexOf.upc ?? 0]
        const count = indexOf.count !== undefined ? cells[indexOf.count] : ''
        const tid = indexOf.tid !== undefined ? cells[indexOf.tid] : ''
        const userdata = indexOf.userdata !== undefined ? cells[indexOf.userdata] : ''
        if (!upc) continue
        out.push(joinCells([upc, count, tid, userdata]))
      } else {
        // No header — assume UPC,Count,TID[,userdata]. Keep the first four cells.
        const [upc, count, tid, userdata] = cells
        if (!upc) continue
        out.push(joinCells([upc, count ?? '', tid ?? '', userdata ?? '']))
      }
    } else {
      if (hasHeader) {
        const epc = cells[indexOf.epc ?? 0]
        const tid = indexOf.tid !== undefined ? cells[indexOf.tid] : ''
        const userdata = indexOf.userdata !== undefined ? cells[indexOf.userdata] : ''
        if (!epc) continue
        out.push(joinCells([epc, tid, userdata]))
      } else {
        const [epc, tid, userdata] = cells
        if (!epc) continue
        out.push(joinCells([epc, tid ?? '', userdata ?? '']))
      }
    }
  }

  return {
    text: out.join('\n'),
    rows: out.length,
    hasHeader,
    delimiter,
  }
}
