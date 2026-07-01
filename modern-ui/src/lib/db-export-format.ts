/** Shared SQL INSERT formatting for Database tab exports. */

export function formatCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export function formatCsvRow(columns: string[], row: Record<string, unknown>): string {
  return columns.map((c) => formatCsvCell(row[c])).join(',')
}

export function formatSqlInsertValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
}

export function formatSqlInserts(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0 || columns.length === 0) return ''
  const colList = columns.map((c) => `\`${c.replace(/`/g, '``')}\``).join(', ')
  return rows
    .map((row) => {
      const vals = columns.map((c) => formatSqlInsertValue(row[c]))
      return `INSERT INTO \`${table.replace(/`/g, '``')}\` (${colList}) VALUES (${vals.join(', ')});`
    })
    .join('\n')
}

export function formatSqlTableDump(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  database?: string,
): string {
  const header = database
    ? `-- Table: ${database}.${table}\n`
    : `-- Table: ${table}\n`
  const inserts = formatSqlInserts(table, columns, rows)
  return inserts ? `${header}\n${inserts}\n` : `${header}\n-- (no rows)\n`
}
