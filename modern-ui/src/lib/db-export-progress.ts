export interface DbExportProgressPayload {
  message: string
  exportedRows?: number
  totalRows?: number
  tableIndex?: number
  tableCount?: number
}

export function formatDbExportProgressMessage(p: DbExportProgressPayload): string {
  if (p.exportedRows !== undefined && p.totalRows !== undefined && p.totalRows > 0) {
    const pct = Math.min(100, Math.round((p.exportedRows / p.totalRows) * 100))
    return `${p.message} (${p.exportedRows.toLocaleString()} / ${p.totalRows.toLocaleString()} · ${pct}%)`
  }
  if (p.tableIndex !== undefined && p.tableCount !== undefined) {
    return `${p.message} (table ${p.tableIndex}/${p.tableCount})`
  }
  return p.message
}
