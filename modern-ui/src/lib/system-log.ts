/**
 * System log CSV parsing & cleanup.
 *
 * Automates the Excel steps:
 *   1. Open system_info_all.csv
 *   2. Filter `log_time` column, remove rows where the value is literally "log_time"
 *      (duplicate header rows created when logs are concatenated).
 *   3. Format `log_time` as "m/d/yyyy h:mm:ss".
 *   4. Format `time` as integer (decimal places: 0).
 *   5. Sort by `time` ascending.
 */

export type SystemLogRow = {
  log_time: string // formatted "m/d/yyyy h:mm:ss"
  log_time_ms: number // epoch ms parsed from log_time (NaN if unparseable)
  time: number // integer seconds (or whatever the source unit is)
  [key: string]: string | number
}

export interface ParseResult {
  headers: string[]
  rows: SystemLogRow[]
  droppedHeaderRows: number
  droppedBadRows: number
  totalRawRows: number
}

/**
 * Parse a CSV line into fields. Handles quoted fields with embedded commas
 * and escaped double-quotes ("").
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"') {
        inQuotes = true
      } else {
        cur += ch
      }
    }
  }
  out.push(cur)
  return out
}

function splitLines(text: string): string[] {
  // Normalize line endings and drop trailing blank lines.
  return text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.length > 0)
}

/** Parse any date-ish string. Supports ISO, "YYYY-MM-DD HH:MM:SS", and m/d/yyyy h:mm:ss. */
function parseDateMs(raw: string): number {
  if (!raw) return NaN
  const s = raw.trim()
  // Replace space between date and time with 'T' for ISO parsing.
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)
    ? s.replace(' ', 'T')
    : s
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

/** Format epoch ms → "m/d/yyyy h:mm:ss" (no zero-padding, matches the Excel custom format). */
export function formatLogTime(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const year = d.getFullYear()
  const hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`
}

/**
 * Clean & parse a system_info_all.csv string.
 *
 * Applies every step from the user's manual Excel workflow:
 *  - Drop rows where the `log_time` column literally contains the string "log_time".
 *  - Coerce numeric columns (anything that parses as a number).
 *  - Floor the `time` column to an integer.
 *  - Format `log_time` as "m/d/yyyy h:mm:ss".
 *  - Sort rows by `time` ascending.
 */
export function parseSystemInfoCsv(text: string): ParseResult {
  const lines = splitLines(text)
  if (lines.length === 0) {
    return { headers: [], rows: [], droppedHeaderRows: 0, droppedBadRows: 0, totalRawRows: 0 }
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const logTimeIdx = headers.findIndex((h) => h.toLowerCase() === 'log_time')
  const timeIdx = headers.findIndex((h) => h.toLowerCase() === 'time')

  const rows: SystemLogRow[] = []
  let droppedHeaderRows = 0
  let droppedBadRows = 0
  const totalRawRows = lines.length - 1

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length < headers.length) {
      // Pad short rows so index access is safe; still attempt to use them.
      while (fields.length < headers.length) fields.push('')
    }

    // Step 2/3: skip rows where the log_time cell equals the header literal.
    const logTimeRaw = logTimeIdx >= 0 ? (fields[logTimeIdx] ?? '').trim() : ''
    if (logTimeRaw.toLowerCase() === 'log_time') {
      droppedHeaderRows++
      continue
    }

    // Build row object with numeric coercion.
    const row: SystemLogRow = {
      log_time: '',
      log_time_ms: NaN,
      time: NaN,
    }

    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]
      if (!key) continue
      const raw = (fields[j] ?? '').trim()
      if (j === logTimeIdx) {
        const ms = parseDateMs(raw)
        row.log_time_ms = ms
        row.log_time = Number.isFinite(ms) ? formatLogTime(ms) : raw
      } else if (j === timeIdx) {
        const n = Number(raw)
        row.time = Number.isFinite(n) ? Math.trunc(n) : NaN
      } else {
        const n = Number(raw)
        row[key] = raw !== '' && Number.isFinite(n) ? n : raw
      }
    }

    if (!Number.isFinite(row.time)) {
      droppedBadRows++
      continue
    }

    rows.push(row)
  }

  // Step 8: sort by `time` ascending (smallest to largest).
  rows.sort((a, b) => a.time - b.time)

  return { headers, rows, droppedHeaderRows, droppedBadRows, totalRawRows }
}

/** Re-serialize cleaned rows back to CSV (for export). */
export function rowsToCsv(headers: string[], rows: SystemLogRow[]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const out: string[] = []
  out.push(headers.map(escape).join(','))
  for (const row of rows) {
    out.push(headers.map((h) => escape(row[h] as string | number)).join(','))
  }
  return out.join('\n')
}

/**
 * Max number of points a chart should render. Keep this in sync between the
 * in-app preview and the Excel exporter so both look identical.
 */
export const MAX_CHART_POINTS = 2000

/**
 * Pick up to `max` evenly-spaced row indices out of `total`. If `total <= max`
 * returns every index. This is the same primitive used by the on-screen chart,
 * so exports produce identical point sets.
 */
export function downsampleIndices(total: number, max: number): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i)
  const step = total / max
  const out: number[] = []
  for (let i = 0; i < max; i++) out.push(Math.floor(i * step))
  if (out[out.length - 1] !== total - 1) out.push(total - 1)
  return out
}

/** Columns used for the CPU chart. */
export const CPU_SERIES = ['nb_cpus', 'sys_load_avg'] as const

/** Columns used for the memory chart. */
export const MEM_SERIES = [
  'free_phys_mem',
  'used_phys_mem',
  'total_phys_mem',
  'free_mem',
  'used_mem',
  'min_mem_reached',
  'max_mem_reached',
  'total_mem',
  'max_mem',
] as const

/** Distinct colors per series (readable on both light & dark backgrounds). */
export const SERIES_COLORS: Record<string, string> = {
  nb_cpus: '#6366f1',
  sys_load_avg: '#f59e0b',
  free_phys_mem: '#22c55e',
  used_phys_mem: '#ef4444',
  total_phys_mem: '#0ea5e9',
  free_mem: '#84cc16',
  used_mem: '#f97316',
  min_mem_reached: '#14b8a6',
  max_mem_reached: '#a855f7',
  total_mem: '#3b82f6',
  max_mem: '#ec4899',
}
