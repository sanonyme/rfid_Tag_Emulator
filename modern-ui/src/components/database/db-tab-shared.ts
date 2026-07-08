import { formatSqlTableDump } from '@/lib/db-export-format'

/** Shared types, constants and pure helpers for the Database tab. */

export interface TableInfo {
  name: string
  rows: number
}

export interface DbNode {
  name: string
  tables?: TableInfo[]
  expanded: boolean
  loading: boolean
}

export interface QueryTab {
  id: string
  name: string
  content: string
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

export interface QueryHistoryEntry {
  sql: string
  timestamp: number
  database?: string
}

export interface SchemaData {
  tables: { name: string; columns: { name: string; type: string; key: string }[] }[]
  foreignKeys: {
    constraintName: string
    childTable: string
    childColumns: string[]
    parentTable: string
    parentColumns: string[]
  }[]
}

export type SortDir = 'asc' | 'desc' | null
export type TableView = 'data' | 'structure' | 'schema'
export type ExportFormat = 'csv' | 'json' | 'sql'

export type SidebarCtx =
  | { x: number; y: number; kind: 'pane' }
  | { x: number; y: number; kind: 'database'; dbName: string }
  | { x: number; y: number; kind: 'table'; dbName: string; tableName: string }

export type SchemaConfirmState =
  | { kind: 'truncate'; db: string; table: string }
  | { kind: 'dropTable'; db: string; table: string }
  | { kind: 'dropDatabase'; db: string }

export const PAGE_SIZES = [25, 50, 100, 500, 1000] as const
export const DANGEROUS_SQL = /^\s*(UPDATE|DELETE|INSERT|DROP|ALTER|TRUNCATE|REPLACE|RENAME|CREATE)\b/i
export const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

export const NEW_DB_NAME_RE = /^[a-zA-Z0-9$_-]{1,64}$/
export const NEW_TABLE_NAME_RE = NEW_DB_NAME_RE
export const DEFAULT_CREATE_TABLE_COLUMNS = 'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY'

export const DB_CREDS_KEY = 'db-credentials'

export function quoteIdent(name: string): string {
  return '`' + String(name).replace(/`/g, '``') + '`'
}

const HISTORY_KEY = 'db-query-history'

export function loadQueryHistory(): QueryHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}

export function saveQueryHistory(entries: QueryHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 100)))
}

export function exportToCsv(columns: string[], rows: any[]): string {
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n')
}

export function exportToJson(columns: string[], rows: any[]): string {
  return JSON.stringify(rows.map((r) => {
    const obj: any = {}
    columns.forEach((c) => { obj[c] = r[c] })
    return obj
  }), null, 2)
}

export function exportToSql(table: string, columns: string[], rows: any[]): string {
  return formatSqlTableDump(table, columns, rows)
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
