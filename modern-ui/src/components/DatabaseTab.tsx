import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Database,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Table2,
  Play,
  Loader2,
  PlugZap,
  Unplug,
  AlertCircle,
  CheckCircle2,
  Search,
  Copy,
  X,
  Hash,
  Clock,
  ArrowUpDown,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  Download,
  History,
  PlusCircle,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Timer,
  Lock,
  Unlock,
  CheckSquare,
  Square,
  Network,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTourInteractionOptional } from '@/contexts/TourInteractionContext'
import { DatabaseSchemaGraph } from './DatabaseSchemaGraph'
import { publishStatus, clearStatus } from '@/lib/workspace-status'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { sql, MySQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'

interface DatabaseTabProps {
  host: string
  connected: boolean
}

interface TableInfo {
  name: string
  rows: number
}

interface DbNode {
  name: string
  tables?: TableInfo[]
  expanded: boolean
  loading: boolean
}

interface QueryTab {
  id: string
  name: string
  content: string
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  key: string
  extra: string
  comment: string
}

interface QueryHistoryEntry {
  sql: string
  timestamp: number
  database?: string
}

type SortDir = 'asc' | 'desc' | null
type TableView = 'data' | 'structure' | 'schema'

const PAGE_SIZES = [25, 50, 100, 500, 1000] as const
const DANGEROUS_SQL = /^\s*(UPDATE|DELETE|INSERT|DROP|ALTER|TRUNCATE|REPLACE|RENAME|CREATE)\b/i

const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

function quoteIdent(name: string): string {
  return '`' + String(name).replace(/`/g, '``') + '`'
}

const NEW_DB_NAME_RE = /^[a-zA-Z0-9$_-]{1,64}$/

const HISTORY_KEY = 'db-query-history'
function loadQueryHistory(): QueryHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}
function saveQueryHistory(entries: QueryHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 100)))
}

function exportToCsv(columns: string[], rows: any[]): string {
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n')
}

function exportToJson(columns: string[], rows: any[]): string {
  return JSON.stringify(rows.map((r) => {
    const obj: any = {}
    columns.forEach((c) => { obj[c] = r[c] })
    return obj
  }), null, 2)
}

function exportToSql(table: string, columns: string[], rows: any[]): string {
  return rows.map((r) => {
    const vals = columns.map((c) => {
      const v = r[c]
      if (v === null || v === undefined) return 'NULL'
      if (typeof v === 'number') return String(v)
      return `'${String(v).replace(/'/g, "''")}'`
    })
    return `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${vals.join(', ')});`
  }).join('\n')
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const DB_CREDS_KEY = 'db-credentials'

export function DatabaseTab({ host, connected }: DatabaseTabProps) {
  const tourIx = useTourInteractionOptional()
  const [dbConnected, setDbConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [databases, setDatabases] = useState<DbNode[]>([])
  const [dbUser, setDbUser] = useState('')
  const [dbPass, setDbPass] = useState('')
  const [rememberCreds, setRememberCreds] = useState(false)
  const [credsLoaded, setCredsLoaded] = useState(false)

  useEffect(() => {
    tourIx?.setDbMysqlConnected(dbConnected)
    publishStatus('db', {
      status: dbConnected ? 'connected' : 'idle',
      host: dbConnected && host ? host : undefined,
      port: dbConnected ? 3306 : undefined,
      label: 'DB',
    })
  }, [dbConnected, host, tourIx])

  useEffect(() => () => clearStatus('db'), [])

  const [selectedDb, setSelectedDb] = useState('')
  const [selectedTable, setSelectedTable] = useState('')

  useEffect(() => {
    tourIx?.setDbTableSelected(Boolean(selectedTable))
  }, [selectedTable, tourIx])

  const [tableColumns, setTableColumns] = useState<string[]>([])
  const [tableRows, setTableRows] = useState<any[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const [tableLoading, setTableLoading] = useState(false)
  const [columnTypes, setColumnTypes] = useState<Record<string, string>>({})

  const [queryColumns, setQueryColumns] = useState<string[]>([])
  const [queryRows, setQueryRows] = useState<any[]>([])
  const [queryMessage, setQueryMessage] = useState('')
  const [queryError, setQueryError] = useState('')
  const [queryRunning, setQueryRunning] = useState(false)
  const [queryTime, setQueryTime] = useState(0)
  const [showQueryResults, setShowQueryResults] = useState(false)

  const [tableSearch, setTableSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const [editorHeight, setEditorHeight] = useState(240)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [sidebarWidth, setSidebarWidth] = useState(256)
  const isSidebarDragging = useRef(false)

  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([
    { id: crypto.randomUUID(), name: 'Query 1', content: '-- Write your SQL query here\nSELECT * FROM ' },
  ])
  const [activeTabId, setActiveTabId] = useState(() => queryTabs[0]?.id || '')
  const tabCounter = useRef(1)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)

  type SidebarCtx =
    | { x: number; y: number; kind: 'database'; dbName: string }
    | { x: number; y: number; kind: 'table'; dbName: string; tableName: string }
  const [sidebarCtx, setSidebarCtx] = useState<SidebarCtx | null>(null)

  type SchemaConfirmState =
    | { kind: 'truncate'; db: string; table: string }
    | { kind: 'dropTable'; db: string; table: string }
    | { kind: 'dropDatabase'; db: string }
  const [schemaConfirm, setSchemaConfirm] = useState<SchemaConfirmState | null>(null)

  const [createDbOpen, setCreateDbOpen] = useState(false)
  const [createDbName, setCreateDbName] = useState('')
  const [schemaBusy, setSchemaBusy] = useState(false)

  const [primaryKeys, setPrimaryKeys] = useState<string[]>([])
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState<number>(100)
  const [currentPage, setCurrentPage] = useState(0)

  // Table view mode
  const [tableView, setTableView] = useState<TableView>('data')
  const [tableStructure, setTableStructure] = useState<ColumnInfo[]>([])
  const [structureLoading, setStructureLoading] = useState(false)

  const [schemaData, setSchemaData] = useState<{
    tables: { name: string; columns: { name: string; type: string; key: string }[] }[]
    foreignKeys: {
      constraintName: string
      childTable: string
      childColumns: string[]
      parentTable: string
      parentColumns: string[]
    }[]
  } | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  // Query history
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(loadQueryHistory)
  const [showHistory, setShowHistory] = useState(false)

  // Insert row
  const [showInsertRow, setShowInsertRow] = useState(false)
  const [insertValues, setInsertValues] = useState<Record<string, string>>({})
  const [insertSaving, setInsertSaving] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ row: any; idx: number } | null>(null)

  // Export menu
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Refresh
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [autoRefreshSec, setAutoRefreshSec] = useState(5)
  const [showAutoRefreshMenu, setShowAutoRefreshMenu] = useState(false)

  // Read-only mode
  const [readOnly, setReadOnly] = useState(() => {
    try { return localStorage.getItem('db-read-only') !== 'false' } catch { return true }
  })

  // Multi-row selection
  const [selectedRowIdxs, setSelectedRowIdxs] = useState<Set<number>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const runQueryRef = useRef<(sqlOverride?: string) => void>(() => {})
  const selectedDbRef = useRef(selectedDb)
  selectedDbRef.current = selectedDb

  // Load saved credentials from safeStorage or localStorage fallback
  useEffect(() => {
    (async () => {
      try {
        if (window.electronAPI?.safeStoreGet) {
          const raw = await window.electronAPI.safeStoreGet(DB_CREDS_KEY)
          if (raw) {
            const parsed = JSON.parse(raw)
            setDbUser(parsed.user || '')
            setDbPass(parsed.pass || '')
            setRememberCreds(true)
            setCredsLoaded(true)
            return
          }
        }
      } catch { /* fall through */ }
      try {
        const raw = localStorage.getItem(DB_CREDS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          setDbUser(parsed.user || '')
          setDbPass(parsed.pass || '')
          setRememberCreds(true)
        }
      } catch { /* ignore */ }
      setCredsLoaded(true)
    })()
  }, [])

  const toggleReadOnly = useCallback(() => {
    setReadOnly((prev) => {
      const next = !prev
      localStorage.setItem('db-read-only', String(next))
      return next
    })
  }, [])

  const saveCurrentTabContent = useCallback(() => {
    if (!viewRef.current) return
    const content = viewRef.current.state.doc.toString()
    setQueryTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, content } : t)))
  }, [activeTabId])

  const persistCreds = useCallback(async () => {
    const payload = JSON.stringify({ user: dbUser, pass: dbPass })
    try {
      if (window.electronAPI?.safeStoreSet) {
        await window.electronAPI.safeStoreSet(DB_CREDS_KEY, payload)
        localStorage.removeItem(DB_CREDS_KEY)
        return
      }
    } catch { /* fall through */ }
    localStorage.setItem(DB_CREDS_KEY, payload)
  }, [dbUser, dbPass])

  const clearCreds = useCallback(async () => {
    try { if (window.electronAPI?.safeStoreDelete) await window.electronAPI.safeStoreDelete(DB_CREDS_KEY) } catch { /* ignore */ }
    localStorage.removeItem(DB_CREDS_KEY)
  }, [])

  const handleConnect = useCallback(async () => {
    if (!window.electronAPI || !dbUser.trim()) return
    setConnecting(true)
    setError('')
    const result = await window.electronAPI.dbConnect(host, dbUser, dbPass)
    if (result.ok) {
      setDbConnected(true)
      setDatabases(result.databases.map((d) => ({ name: d, tables: undefined, expanded: false, loading: false })))
      if (rememberCreds) persistCreds()
      else clearCreds()
    } else {
      setError(result.error)
    }
    setConnecting(false)
  }, [host, dbUser, dbPass, rememberCreds, persistCreds, clearCreds])

  const handleDisconnect = useCallback(async () => {
    if (!window.electronAPI) return
    await window.electronAPI.dbDisconnect()
    setDbConnected(false)
    setDatabases([])
    setSelectedDb('')
    setSelectedTable('')
    setTableColumns([])
    setTableRows([])
    setQueryColumns([])
    setQueryRows([])
    setQueryMessage('')
    setQueryError('')
    setShowQueryResults(false)
    setAutoRefresh(false)
    setSelectedRowIdxs(new Set())
    setSchemaData(null)
    setSchemaError('')
    setTableView('data')
  }, [])

  const toggleDatabase = useCallback(async (dbName: string) => {
    setDatabases((prev) =>
      prev.map((d) => {
        if (d.name !== dbName) return d
        if (d.expanded) return { ...d, expanded: false }
        return { ...d, expanded: true, loading: d.tables === undefined }
      })
    )

    const node = databases.find((d) => d.name === dbName)
    if (node && node.tables === undefined && window.electronAPI) {
      const result = await window.electronAPI.dbGetTables(dbName)
      setDatabases((prev) =>
        prev.map((d) => {
          if (d.name !== dbName) return d
          if (result.ok) return { ...d, tables: result.tables, loading: false }
          return { ...d, tables: [], loading: false }
        })
      )
    }
  }, [databases])

  const loadPage = useCallback(async (dbName: string, tableName: string, page: number, size: number) => {
    if (!window.electronAPI) return
    setTableLoading(true)
    setEditingCell(null)
    setSelectedRowIdxs(new Set())

    const [result, pks] = await Promise.all([
      window.electronAPI.dbGetTableData(dbName, tableName, size, page * size),
      window.electronAPI.dbGetPrimaryKeys(dbName, tableName),
    ])
    if (result.ok) {
      setTableColumns(result.columns)
      setTableRows(result.rows)
      setTableTotal(result.total)
      setColumnTypes(result.columnTypes || {})
    } else {
      setTableColumns([])
      setTableRows([])
      setTableTotal(0)
      setColumnTypes({})
    }
    setPrimaryKeys(pks)
    setTableLoading(false)
  }, [])

  const loadSchema = useCallback(async () => {
    if (!window.electronAPI || !selectedDb) return
    setSchemaLoading(true)
    setSchemaError('')
    const res = await window.electronAPI.dbGetDatabaseSchema(selectedDb)
    setSchemaLoading(false)
    if (res.ok) {
      setSchemaData({ tables: res.tables, foreignKeys: res.foreignKeys })
    } else {
      setSchemaError(res.error)
      setSchemaData(null)
    }
  }, [selectedDb])

  const refreshDatabases = useCallback(async () => {
    if (!window.electronAPI) return
    setRefreshing(true)
    const result = await window.electronAPI.dbConnect(host, dbUser, dbPass)
    if (result.ok) {
      setDbConnected(true)
      setError('')
      setDatabases((prev) => {
        const prevExpanded = new Set(prev.filter((d) => d.expanded).map((d) => d.name))
        return result.databases.map((d) => {
          const old = prev.find((p) => p.name === d)
          if (old && prevExpanded.has(d)) return { ...old, expanded: true }
          return { name: d, tables: undefined, expanded: false, loading: false }
        })
      })
      for (const db of databases.filter((d) => d.expanded)) {
        const tablesResult = await window.electronAPI.dbGetTables(db.name)
        if (tablesResult.ok) {
          setDatabases((prev) => prev.map((d) => d.name === db.name ? { ...d, tables: tablesResult.tables, loading: false } : d))
        }
      }
      if (selectedDb && selectedTable) {
        loadPage(selectedDb, selectedTable, currentPage, pageSize)
      }
      if (selectedDb && tableView === 'schema') {
        await loadSchema()
      }
    } else {
      setError(result.error)
    }
    setRefreshing(false)
  }, [host, dbUser, dbPass, databases, selectedDb, selectedTable, currentPage, pageSize, loadPage, tableView, loadSchema])

  /** Runs DDL/DML from the sidebar; bypasses read-only (user confirms in dialog). */
  const executeMutationSql = useCallback(async (sql: string, useDatabase?: string): Promise<boolean> => {
    if (!window.electronAPI || !sql.trim()) return false
    setSchemaBusy(true)
    try {
      const result = await window.electronAPI.dbExecuteQuery(sql.trim(), useDatabase)
      if (result.ok) {
        toast.success(result.message || 'Done')
        return true
      }
      toast.error(result.error)
      return false
    } finally {
      setSchemaBusy(false)
    }
  }, [])

  const openDatabaseSidebarMenu = useCallback((e: React.MouseEvent, dbName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dbConnected) return
    setSidebarCtx({ x: e.clientX, y: e.clientY, kind: 'database', dbName })
  }, [dbConnected])

  const openTableSidebarMenu = useCallback((e: React.MouseEvent, dbName: string, tableName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dbConnected) return
    setSidebarCtx({ x: e.clientX, y: e.clientY, kind: 'table', dbName, tableName })
  }, [dbConnected])

  const handleConfirmSchemaAction = useCallback(async () => {
    if (!schemaConfirm || !window.electronAPI) return
    const q = schemaConfirm
    let sql = ''
    let useDb: string | undefined

    if (q.kind === 'truncate') {
      sql = `TRUNCATE TABLE ${quoteIdent(q.table)}`
      useDb = q.db
    } else if (q.kind === 'dropTable') {
      sql = `DROP TABLE ${quoteIdent(q.table)}`
      useDb = q.db
    } else {
      sql = `DROP DATABASE ${quoteIdent(q.db)}`
      useDb = undefined
    }

    const ok = await executeMutationSql(sql, useDb)
    setSchemaConfirm(null)

    if (!ok) return

    if (q.kind === 'dropDatabase') {
      if (selectedDb === q.db) {
        setSelectedDb('')
        setSelectedTable('')
        setTableColumns([])
        setTableRows([])
        setTableTotal(0)
        setSchemaData(null)
        setTableView('data')
      }
    } else if (q.kind === 'dropTable') {
      if (selectedDb === q.db && selectedTable === q.table) {
        setSelectedTable('')
        setTableColumns([])
        setTableRows([])
        setTableTotal(0)
      }
    } else if (q.kind === 'truncate' && selectedDb === q.db && selectedTable === q.table) {
      await loadPage(q.db, q.table, currentPage, pageSize)
    }

    await refreshDatabases()
  }, [
    schemaConfirm,
    executeMutationSql,
    selectedDb,
    selectedTable,
    loadPage,
    currentPage,
    pageSize,
    refreshDatabases,
  ])

  const handleCreateDatabaseSubmit = useCallback(async () => {
    const name = createDbName.trim()
    if (!NEW_DB_NAME_RE.test(name)) {
      toast.error('Invalid name (letters, digits, _, $, - only; max 64).')
      return
    }
    const ok = await executeMutationSql(`CREATE DATABASE ${quoteIdent(name)}`, undefined)
    if (ok) {
      setCreateDbOpen(false)
      setCreateDbName('')
      await refreshDatabases()
    }
  }, [createDbName, executeMutationSql, refreshDatabases])

  const handleSelectTable = useCallback(async (dbName: string, tableName: string) => {
    setSelectedDb(dbName)
    setSelectedTable(tableName)
    setSortColumn(null)
    setSortDir(null)
    setTableSearch('')
    setCurrentPage(0)
    setTableView('data')
    setShowInsertRow(false)
    setSelectedRowIdxs(new Set())
    await loadPage(dbName, tableName, 0, pageSize)
  }, [loadPage, pageSize])

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
    setSelectedRowIdxs(new Set())
    loadPage(selectedDb, selectedTable, page, pageSize)
  }, [selectedDb, selectedTable, pageSize, loadPage])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(0)
    setSelectedRowIdxs(new Set())
    loadPage(selectedDb, selectedTable, 0, size)
  }, [selectedDb, selectedTable, loadPage])

  const totalPages = Math.max(1, Math.ceil(tableTotal / pageSize))
  const pageStart = currentPage * pageSize + 1
  const pageEnd = Math.min((currentPage + 1) * pageSize, tableTotal)

  const loadStructure = useCallback(async () => {
    if (!window.electronAPI || !selectedDb || !selectedTable) return
    setStructureLoading(true)
    const result = await window.electronAPI.dbGetTableStructure(selectedDb, selectedTable)
    if (result.ok) {
      setTableStructure(result.columns)
    }
    setStructureLoading(false)
  }, [selectedDb, selectedTable])

  const handleViewToggle = useCallback((view: TableView) => {
    setTableView(view)
    if (view === 'structure' && tableStructure.length === 0) {
      loadStructure()
    }
  }, [loadStructure, tableStructure.length])

  useEffect(() => {
    if (tableView !== 'schema' || !selectedDb) return
    loadSchema()
  }, [tableView, selectedDb, loadSchema])

  const executeQuery = useCallback(async (sqlText: string) => {
    if (!window.electronAPI || !sqlText.trim()) return

    if (readOnly && DANGEROUS_SQL.test(sqlText.trim())) {
      setQueryError('Blocked: Read-only mode is active. Disable it to run write queries.')
      setQueryMessage('')
      setShowQueryResults(true)
      tourIx?.markDbQueryRan()
      return
    }

    setQueryRunning(true)
    setQueryError('')
    setQueryMessage('')
    setShowQueryResults(true)

    const start = performance.now()
    const result = await window.electronAPI.dbExecuteQuery(sqlText.trim(), selectedDbRef.current || undefined)
    setQueryTime(Math.round(performance.now() - start))

    if (result.ok) {
      setQueryColumns(result.columns)
      setQueryRows(result.rows)
      setQueryMessage(result.message || `${result.rows.length} row(s) returned`)
      setQueryError('')
    } else {
      setQueryColumns([])
      setQueryRows([])
      setQueryMessage('')
      setQueryError(result.error)
    }
    setQueryRunning(false)
    tourIx?.markDbQueryRan()

    const entry: QueryHistoryEntry = { sql: sqlText.trim(), timestamp: Date.now(), database: selectedDbRef.current || undefined }
    setQueryHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.sql !== entry.sql)].slice(0, 100)
      saveQueryHistory(next)
      return next
    })
  }, [readOnly, tourIx])

  const handleRunQuery = useCallback((sqlOverride?: string) => {
    if (sqlOverride) {
      executeQuery(sqlOverride)
      return
    }
    if (!viewRef.current) return
    const view = viewRef.current
    const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    const query = selection.trim() || view.state.doc.toString().trim()
    if (query) executeQuery(query)
  }, [executeQuery])

  runQueryRef.current = handleRunQuery

  const clearQueryResults = useCallback(() => {
    setQueryColumns([])
    setQueryRows([])
    setQueryMessage('')
    setQueryError('')
    setQueryTime(0)
    setShowQueryResults(false)
  }, [])

  // -- Export --
  const handleExport = useCallback((format: 'csv' | 'json' | 'sql') => {
    setShowExportMenu(false)
    const cols = tableColumns
    const rows = tableRows
    const name = `${selectedDb}_${selectedTable}`
    if (format === 'csv') downloadFile(exportToCsv(cols, rows), `${name}_page.csv`, 'text/csv')
    else if (format === 'json') downloadFile(exportToJson(cols, rows), `${name}_page.json`, 'application/json')
    else if (format === 'sql') downloadFile(exportToSql(selectedTable, cols, rows), `${name}_page.sql`, 'text/sql')
  }, [tableColumns, tableRows, selectedDb, selectedTable])

  const handleExportSelected = useCallback((format: 'csv' | 'json' | 'sql') => {
    setShowExportMenu(false)
    const rows = sortedRowsRef.current.filter((_, i) => selectedRowIdxs.has(i))
    if (rows.length === 0) return
    const cols = tableColumns
    const name = `${selectedDb}_${selectedTable}_selected`
    if (format === 'csv') downloadFile(exportToCsv(cols, rows), `${name}.csv`, 'text/csv')
    else if (format === 'json') downloadFile(exportToJson(cols, rows), `${name}.json`, 'application/json')
    else if (format === 'sql') downloadFile(exportToSql(selectedTable, cols, rows), `${name}.sql`, 'text/sql')
  }, [tableColumns, selectedRowIdxs, selectedDb, selectedTable])

  const handleExportAll = useCallback(async (format: 'csv' | 'json') => {
    if (!window.electronAPI) return
    setShowExportMenu(false)
    setExporting(true)
    const result = await window.electronAPI.dbExportTable(selectedDb, selectedTable)
    setExporting(false)
    if (result.ok) {
      const name = `${selectedDb}_${selectedTable}_all`
      if (format === 'csv') downloadFile(exportToCsv(result.columns, result.rows), `${name}.csv`, 'text/csv')
      else downloadFile(exportToJson(result.columns, result.rows), `${name}.json`, 'application/json')
    } else {
      setError(result.error)
      setTimeout(() => setError(''), 3000)
    }
  }, [selectedDb, selectedTable])

  const handleExportQueryResults = useCallback((format: 'csv' | 'json') => {
    if (format === 'csv') downloadFile(exportToCsv(queryColumns, queryRows), 'query_results.csv', 'text/csv')
    else downloadFile(exportToJson(queryColumns, queryRows), 'query_results.json', 'application/json')
  }, [queryColumns, queryRows])

  // -- Insert Row --
  const handleInsertRow = useCallback(async () => {
    if (!window.electronAPI || !selectedDb || !selectedTable) return
    setInsertSaving(true)
    const values: Record<string, any> = {}
    for (const [k, v] of Object.entries(insertValues)) {
      if (v === '') continue
      values[k] = v === 'NULL' ? null : v
    }
    const result = await window.electronAPI.dbInsertRow(selectedDb, selectedTable, values)
    setInsertSaving(false)
    if (result.ok) {
      setShowInsertRow(false)
      setInsertValues({})
      loadPage(selectedDb, selectedTable, currentPage, pageSize)
    } else {
      setError(result.error)
      setTimeout(() => setError(''), 3000)
    }
  }, [selectedDb, selectedTable, insertValues, currentPage, pageSize, loadPage])

  // -- Delete Row --
  const handleDeleteRow = useCallback(async () => {
    if (!deleteConfirm || !window.electronAPI || primaryKeys.length === 0) return
    const row = deleteConfirm.row
    const pkValues: Record<string, any> = {}
    for (const pk of primaryKeys) pkValues[pk] = row[pk]

    const result = await window.electronAPI.dbDeleteRow(selectedDb, selectedTable, pkValues)
    if (result.ok) {
      setTableRows((prev) => prev.filter((r) => !primaryKeys.every((pk) => r[pk] === row[pk])))
      setTableTotal((t) => Math.max(0, t - 1))
    } else {
      setError(result.error)
      setTimeout(() => setError(''), 3000)
    }
    setDeleteConfirm(null)
  }, [deleteConfirm, primaryKeys, selectedDb, selectedTable])

  const sortedRowsRef = useRef<any[]>([])

  // -- Bulk Delete --
  const handleBulkDelete = useCallback(async () => {
    if (!window.electronAPI || primaryKeys.length === 0 || selectedRowIdxs.size === 0) return
    setBulkDeleting(true)
    const rowsToDelete = sortedRowsRef.current
      .filter((_, i) => selectedRowIdxs.has(i))
      .map((row) => {
        const pkValues: Record<string, any> = {}
        for (const pk of primaryKeys) pkValues[pk] = row[pk]
        return pkValues
      })
    const result = await window.electronAPI.dbDeleteRows(selectedDb, selectedTable, rowsToDelete)
    setBulkDeleting(false)
    setBulkDeleteConfirm(false)
    if (result.ok) {
      setSelectedRowIdxs(new Set())
      loadPage(selectedDb, selectedTable, currentPage, pageSize)
    } else {
      setError(result.error)
      setTimeout(() => setError(''), 3000)
    }
  }, [primaryKeys, selectedRowIdxs, selectedDb, selectedTable, currentPage, pageSize, loadPage])

  // -- Row Selection --
  const toggleRowSelect = useCallback((idx: number) => {
    setSelectedRowIdxs((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    const rows = sortedRowsRef.current
    if (selectedRowIdxs.size === rows.length) {
      setSelectedRowIdxs(new Set())
    } else {
      setSelectedRowIdxs(new Set(rows.map((_, i) => i)))
    }
  }, [selectedRowIdxs.size])

  // -- Query Tabs --
  const addQueryTab = useCallback(() => {
    saveCurrentTabContent()
    tabCounter.current += 1
    const newTab: QueryTab = {
      id: crypto.randomUUID(),
      name: `Query ${tabCounter.current}`,
      content: '',
    }
    setQueryTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }, [saveCurrentTabContent])

  const removeQueryTab = useCallback((id: string) => {
    setQueryTabs((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) {
        const newIdx = Math.min(idx, next.length - 1)
        setActiveTabId(next[newIdx].id)
      }
      return next
    })
  }, [activeTabId])

  const switchTab = useCallback((id: string) => {
    if (id === activeTabId) return
    saveCurrentTabContent()
    setActiveTabId(id)
  }, [activeTabId, saveCurrentTabContent])

  // -- Context Menu --
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault()
    if (!viewRef.current) return
    const view = viewRef.current
    const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    setCtxMenu({ x: e.clientX, y: e.clientY, hasSelection: sel.trim().length > 0 })
  }, [])

  const handleCtxRunAll = useCallback(() => {
    setCtxMenu(null)
    runQueryRef.current()
  }, [])

  const handleCtxRunSelected = useCallback(() => {
    setCtxMenu(null)
    if (!viewRef.current) return
    const view = viewRef.current
    const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).trim()
    if (sel) runQueryRef.current(sel)
  }, [])

  useEffect(() => {
    const close = () => {
      setCtxMenu(null)
      setSidebarCtx(null)
    }
    if (ctxMenu || sidebarCtx) {
      window.addEventListener('click', close)
      window.addEventListener('keydown', close)
      return () => {
        window.removeEventListener('click', close)
        window.removeEventListener('keydown', close)
      }
    }
  }, [ctxMenu, sidebarCtx])

  useEffect(() => {
    if (!showExportMenu && !showHistory && !showAutoRefreshMenu) return
    const close = () => { setShowExportMenu(false); setShowHistory(false); setShowAutoRefreshMenu(false) }
    const timer = setTimeout(() => window.addEventListener('click', close), 0)
    return () => { clearTimeout(timer); window.removeEventListener('click', close) }
  }, [showExportMenu, showHistory, showAutoRefreshMenu])

  useEffect(() => {
    if (!autoRefresh || !dbConnected) return
    const id = setInterval(() => { refreshDatabases() }, autoRefreshSec * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, autoRefreshSec, dbConnected, refreshDatabases])

  const schemaForAutocomplete = useMemo(() => {
    const schema: Record<string, string[]> = {}
    databases.forEach((db) => {
      if (db.tables) {
        db.tables.forEach((t) => {
          schema[t.name] = []
        })
      }
    })
    if (tableColumns.length > 0 && selectedTable) {
      schema[selectedTable] = tableColumns
    }
    return schema
  }, [databases, tableColumns, selectedTable])

  // -- Editor Lifecycle --
  const mountEditor = useCallback((content: string) => {
    if (!editorRef.current) return
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const isDark = document.documentElement.classList.contains('dark')

    const runKeymap = Prec.highest(keymap.of([
      { key: 'Ctrl-Enter', run: () => { runQueryRef.current(); return true } },
      { key: 'Mod-Enter', run: () => { runQueryRef.current(); return true } },
    ]))

    const lightTheme = EditorView.theme({
      '&': { backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' },
      '.cm-gutters': { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--accent))' },
      '.cm-activeLine': { backgroundColor: 'hsl(var(--accent) / 0.3)' },
      '.cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
      '.cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.2) !important' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: 'hsl(var(--primary) / 0.25) !important' },
      '.cm-tooltip': { backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))' },
    })

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        sql({ dialect: MySQL, schema: schemaForAutocomplete }),
        runKeymap,
        isDark ? oneDark : lightTheme,
        cmPlaceholder('SELECT * FROM table_name...'),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { fontSize: '13px', height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace' },
          '.cm-content': { padding: '8px 0' },
        }),
        EditorView.domEventHandlers({
          contextmenu: (e) => { handleContextMenu(e); return true },
        }),
      ],
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view
  }, [handleContextMenu, schemaForAutocomplete])

  useEffect(() => {
    if (!dbConnected) return
    const tab = queryTabs.find((t) => t.id === activeTabId)
    mountEditor(tab?.content ?? '')
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [dbConnected, activeTabId, mountEditor])

  // -- Drag Resize --
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startY = e.clientY
    const startHeight = editorHeight

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startY - ev.clientY
      const container = containerRef.current
      const maxH = container ? container.clientHeight - 80 : 600
      setEditorHeight(Math.max(120, Math.min(maxH, startHeight + delta)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [editorHeight])

  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isSidebarDragging.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!isSidebarDragging.current) return
      const delta = ev.clientX - startX
      setSidebarWidth(Math.max(180, Math.min(500, startWidth + delta)))
    }

    const onUp = () => {
      isSidebarDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      if (sortDir === 'desc') setSortColumn(null)
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
  }

  const copyCell = (value: any) => {
    navigator.clipboard.writeText(String(value ?? ''))
  }

  const startEditing = (row: any, rowIdx: number, col: string, currentValue: any) => {
    if (primaryKeys.length === 0 || readOnly) return
    editingRowRef.current = row
    setEditingCell({ rowIdx, col })
    setEditValue(currentValue === null ? '' : String(currentValue))
  }

  const cancelEditing = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const editingRowRef = useRef<any>(null)

  const saveEdit = useCallback(async () => {
    if (!editingCell || !window.electronAPI || primaryKeys.length === 0) return
    const row = editingRowRef.current
    if (!row) return

    const pkValues: Record<string, any> = {}
    for (const pk of primaryKeys) pkValues[pk] = row[pk]

    setEditSaving(true)
    const result = await window.electronAPI.dbUpdateCell(
      selectedDb, selectedTable, pkValues, editingCell.col, editValue || null
    )
    setEditSaving(false)

    if (result.ok) {
      setTableRows((prev) =>
        prev.map((r) => {
          const match = primaryKeys.every((pk) => r[pk] === row[pk])
          if (!match) return r
          return { ...r, [editingCell.col]: editValue || null }
        })
      )
      setEditingCell(null)
      setEditValue('')
    } else {
      setError(result.error)
      setTimeout(() => setError(''), 3000)
    }
  }, [editingCell, editValue, primaryKeys, selectedDb, selectedTable])

  const filteredRows = tableRows.filter((row) => {
    if (!tableSearch) return true
    const q = tableSearch.toLowerCase()
    return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q))
  })

  const sortedRows = sortColumn && sortDir
    ? [...filteredRows].sort((a, b) => {
        const va = a[sortColumn!]
        const vb = b[sortColumn!]
        if (va == null && vb == null) return 0
        if (va == null) return sortDir === 'asc' ? -1 : 1
        if (vb == null) return sortDir === 'asc' ? 1 : -1
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
      })
    : filteredRows

  sortedRowsRef.current = sortedRows

  const canEdit = !readOnly && primaryKeys.length > 0

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground" data-tour="tour-database">
        <Database className="w-16 h-16 opacity-30" />
        <p className="text-lg font-medium">Connect to an IP first</p>
        <p className="text-sm">Use the connection button above to connect to a reader, then access the database.</p>
      </div>
    )
  }

  if (!dbConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6" data-tour="tour-db-mysql-connect">
        <div className="flex flex-col items-center gap-3">
          <Database className="w-16 h-16 opacity-30" />
          <h2 className="text-xl font-semibold">Database Explorer</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Connect to the MySQL database on <span className="font-mono text-foreground">{host}</span>
          </p>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Username</label>
            <input
              type="text"
              value={dbUser}
              onChange={(e) => setDbUser(e.target.value)}
              placeholder="e.g. admin"
              className="w-full h-9 px-3 text-sm rounded-lg border border-border/50 bg-background/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              value={dbPass}
              onChange={(e) => setDbPass(e.target.value)}
              placeholder="••••••••"
              className="w-full h-9 px-3 text-sm rounded-lg border border-border/50 bg-background/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberCreds}
              onChange={(e) => { setRememberCreds(e.target.checked); if (!e.target.checked) clearCreds() }}
              className="rounded border-border/50 accent-blue-500 w-3.5 h-3.5"
            />
            <span className="text-xs text-muted-foreground">Remember credentials</span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm max-w-xs w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        <Button onClick={handleConnect} disabled={connecting || !dbUser.trim() || !credsLoaded} size="lg" className="gap-2 px-8">
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {connecting ? 'Connecting...' : 'Connect to Database'}
        </Button>
      </div>
    )
  }

  const showQueryResultGrid = showQueryResults && queryColumns.length > 0
  const showQueryResultBanner =
    showQueryResults && (queryError || (queryMessage && queryColumns.length === 0))

  return (
    <div className="flex h-full min-h-0" data-tour="tour-database">
      {/* Sidebar */}
      <div
        className="shrink-0 flex flex-col border border-border/50 rounded-xl bg-muted/30 overflow-hidden"
        style={{ width: sidebarWidth }}
        data-tour="tour-db-sidebar"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold">Databases</span>
          </div>
          <div className="flex items-center gap-0.5">
            {/* Read-only toggle */}
            <button
              onClick={toggleReadOnly}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                readOnly
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
              )}
              title={readOnly ? 'Read-only mode (click to unlock edits)' : 'Edits enabled (click to lock)'}
            >
              {readOnly ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
            {/* Refresh */}
            <button
              onClick={refreshDatabases}
              disabled={refreshing}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh databases"
            >
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
            </button>
            {/* Auto-refresh */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowAutoRefreshMenu(!showAutoRefreshMenu) }}
                className={cn(
                  'h-6 w-6 flex items-center justify-center rounded transition-colors',
                  autoRefresh ? 'text-blue-500 dark:text-blue-400 bg-blue-500/15' : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                )}
                title={autoRefresh ? `Auto-refresh every ${autoRefreshSec}s` : 'Auto-refresh'}
              >
                <Timer className="w-3 h-3" />
              </button>
              {showAutoRefreshMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-popover shadow-xl py-1" onClick={(e) => e.stopPropagation()}>
                  <div className="px-3 py-1.5 text-xs font-medium border-b border-border/50">Auto-refresh</div>
                  <button
                    onClick={() => { setAutoRefresh(!autoRefresh); setShowAutoRefreshMenu(false) }}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                  >
                    <span>{autoRefresh ? 'Disable' : 'Enable'}</span>
                    {autoRefresh && <span className="text-blue-500 text-[10px]">ON</span>}
                  </button>
                  <div className="border-t border-border/50 my-0.5" />
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground">Interval (seconds)</div>
                  <div className="flex gap-1 px-3 py-1">
                    {[3, 5, 10, 15, 30].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setAutoRefreshSec(s); if (!autoRefresh) setAutoRefresh(true); setShowAutoRefreshMenu(false) }}
                        className={cn(
                          'flex-1 py-1 text-[10px] rounded transition-colors',
                          autoRefreshSec === s && autoRefresh ? 'bg-blue-500/20 text-blue-500 dark:text-blue-400 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                        )}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                  <div className="px-3 py-1 flex items-center gap-1.5">
                    <input type="number" min={1} max={300} value={autoRefreshSec} onChange={(e) => { const v = parseInt(e.target.value); if (v >= 1 && v <= 300) setAutoRefreshSec(v) }}
                      className="flex-1 h-5 px-1.5 text-[10px] font-mono rounded border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-12" />
                    <button onClick={() => { if (!autoRefresh) setAutoRefresh(true); setShowAutoRefreshMenu(false) }}
                      className="h-5 px-2 text-[10px] rounded bg-blue-500/15 text-blue-500 dark:text-blue-400 hover:bg-blue-500/25 transition-colors">Apply</button>
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} title="Disconnect">
              <Unplug className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 w-full">
          <div className="p-1.5 space-y-0.5 overflow-hidden">
            {databases.map((db) => (
              <div key={db.name}>
                <button
                  type="button"
                  onClick={() => toggleDatabase(db.name)}
                  onContextMenu={(e) => openDatabaseSidebarMenu(e, db.name)}
                  className={cn('w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5 dark:hover:bg-white/10', db.expanded && 'bg-white/5 dark:bg-white/8')}
                >
                  {db.loading ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" /> : db.expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                  <Database className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span className="truncate font-medium text-left">{db.name}</span>
                </button>
                {db.expanded && db.tables && (
                  <div className="ml-3 pl-3 border-l border-border/40 space-y-0.5 my-0.5">
                    {db.tables.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-1 italic">No tables</p>
                    ) : db.tables.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => handleSelectTable(db.name, t.name)}
                        onContextMenu={(e) => openTableSidebarMenu(e, db.name, t.name)}
                        className={cn('w-full min-w-0 flex items-center gap-1 px-2 py-1 rounded-md text-sm transition-colors overflow-hidden', selectedDb === db.name && selectedTable === t.name ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 font-medium ring-1 ring-blue-500/30' : 'hover:bg-white/5 dark:hover:bg-white/10 text-foreground')}
                      >
                        <Table2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <span className="truncate text-left flex-1 min-w-0">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="px-3 py-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              <span className="truncate font-mono">{host}</span>
            </div>
            <div className="flex items-center gap-2">
              {readOnly && (
                <span className="text-[9px] text-amber-500 flex items-center gap-0.5 shrink-0">
                  <Lock className="w-2.5 h-2.5" />
                  R/O
                </span>
              )}
              {autoRefresh && (
                <span className="text-[9px] text-blue-500 dark:text-blue-400 flex items-center gap-1 shrink-0">
                  <Timer className="w-2.5 h-2.5" />
                  {autoRefreshSec}s
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Resize Handle */}
      <div onMouseDown={handleSidebarDragStart} className="shrink-0 w-2 cursor-col-resize flex items-center justify-center group">
        <div className="w-0.5 h-8 rounded-full bg-border/40 transition-colors group-hover:bg-blue-500/40 group-active:bg-blue-500/60" />
      </div>

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 min-h-0 flex flex-col border border-border/50 rounded-xl bg-muted/20 overflow-hidden relative">
            {selectedDb && (selectedTable || tableView === 'schema') ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 shrink-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tableView === 'schema' ? (
                      <>
                        <Network className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="font-semibold text-sm truncate">
                          <span className="text-muted-foreground">{selectedDb}</span>
                          <span className="text-muted-foreground/80"> · schema</span>
                        </span>
                        {schemaData && (
                          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full shrink-0">
                            {schemaData.tables.length} tables
                            {schemaData.foreignKeys.length > 0 && ` · ${schemaData.foreignKeys.length} FK`}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Table2 className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="font-semibold text-sm truncate">
                          <span className="text-muted-foreground">{selectedDb}.</span>{selectedTable}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <Hash className="w-3 h-3" />
                          {tableTotal.toLocaleString()} rows
                        </span>
                        {primaryKeys.length > 0 && (
                          <span className={cn('text-[10px] flex items-center gap-1 shrink-0', readOnly ? 'text-amber-500/70' : 'text-blue-500/70')} title={readOnly ? 'Read-only mode' : `Primary key: ${primaryKeys.join(', ')}`}>
                            {readOnly ? <Lock className="w-2.5 h-2.5" /> : <RotateCcw className="w-2.5 h-2.5" />}
                            {readOnly ? 'read-only' : 'editable'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className={cn(tableView !== 'data' && 'invisible')}>
                      {canEdit && (
                        <button onClick={() => { setShowInsertRow(!showInsertRow); setInsertValues({}) }} className="p-1 rounded text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors" title="Insert row">
                          <PlusCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className={cn('relative', tableView !== 'data' && 'invisible')}>
                      <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors" title="Export">
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-xl py-1">
                          {selectedRowIdxs.size > 0 && (
                            <>
                              <div className="px-3 py-1 text-[10px] text-muted-foreground">Selected ({selectedRowIdxs.size})</div>
                              <button onClick={() => handleExportSelected('csv')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">CSV</button>
                              <button onClick={() => handleExportSelected('json')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">JSON</button>
                              <button onClick={() => handleExportSelected('sql')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">SQL INSERT</button>
                              <div className="border-t border-border/50 my-1" />
                            </>
                          )}
                          <div className="px-3 py-1 text-[10px] text-muted-foreground">Current page</div>
                          <button onClick={() => handleExport('csv')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">CSV</button>
                          <button onClick={() => handleExport('json')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">JSON</button>
                          <button onClick={() => handleExport('sql')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">SQL INSERT</button>
                          <div className="border-t border-border/50 my-1" />
                          <div className="px-3 py-1 text-[10px] text-muted-foreground">All rows ({tableTotal.toLocaleString()})</div>
                          <button onClick={() => handleExportAll('csv')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">Export All CSV</button>
                          <button onClick={() => handleExportAll('json')} className="w-full px-3 py-1.5 text-xs text-left hover:bg-white/10 transition-colors">Export All JSON</button>
                        </div>
                      )}
                    </div>

                    <div className={cn('relative', tableView !== 'data' && 'invisible')}>
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input type="text" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Filter..."
                        className="h-6 pl-8 pr-6 text-[11px] rounded-md border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-36" />
                      {tableSearch && (
                        <button onClick={() => setTableSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex rounded-md border border-border/50 overflow-hidden shrink-0">
                      <button onClick={() => handleViewToggle('data')} className={cn('px-2 py-1 text-[10px] font-medium transition-colors', tableView === 'data' ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground')}>Data</button>
                      <button onClick={() => handleViewToggle('structure')} className={cn('px-2 py-1 text-[10px] font-medium transition-colors border-l border-border/50', tableView === 'structure' ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground')}>Structure</button>
                      <button onClick={() => handleViewToggle('schema')} className={cn('px-2 py-1 text-[10px] font-medium transition-colors border-l border-border/50', tableView === 'schema' ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground')} title="Tables and foreign keys">Schema</button>
                    </div>
                  </div>
                </div>

                {showInsertRow && tableView === 'data' && !readOnly && (
                  <div className="px-4 py-2 border-b border-border/50 bg-green-500/5 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <PlusCircle className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs font-medium">Insert New Row</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {tableColumns.map((col) => (
                        <div key={col} className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground flex items-center gap-1">{col}{columnTypes[col] && <span className="text-[9px] opacity-50">({columnTypes[col]})</span>}</label>
                          <input value={insertValues[col] || ''} onChange={(e) => setInsertValues((v) => ({ ...v, [col]: e.target.value }))} placeholder="NULL"
                            className="h-6 px-2 text-[11px] font-mono rounded border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-green-500/50" />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-3" onClick={() => setShowInsertRow(false)}>Cancel</Button>
                      <Button size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={handleInsertRow} disabled={insertSaving}>
                        {insertSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Insert
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="px-4 py-1.5 bg-destructive/10 text-destructive text-xs flex items-center gap-2 shrink-0">
                    <AlertCircle className="w-3 h-3" />{error}
                  </div>
                )}

                {tableView === 'schema' ? (
                  schemaLoading ? (
                    <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : schemaError ? (
                    <div className="flex-1 flex items-center justify-center px-4">
                      <div className="flex items-center gap-2 text-destructive text-sm text-center">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{schemaError}</span>
                      </div>
                    </div>
                  ) : schemaData ? (
                    <div className="flex-1 min-h-0 flex flex-col p-2 gap-1">
                      <p className="text-[10px] text-muted-foreground px-2 shrink-0">
                        Arrows run from child table → referenced table. Scroll wheel zooms; drag empty canvas to pan; drag table cards to rearrange.
                      </p>
                      <div className="relative flex-1 min-h-[420px] min-w-0">
                        <DatabaseSchemaGraph tables={schemaData.tables} foreignKeys={schemaData.foreignKeys} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No schema data</div>
                  )
                ) : tableView === 'structure' ? (
                  structureLoading ? (
                    <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/80 backdrop-blur-sm">
                            {['Column', 'Type', 'Null', 'Key', 'Default', 'Extra', 'Comment'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border/50">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableStructure.map((col) => (
                            <tr key={col.name} className="border-b border-border/30 hover:bg-white/3 dark:hover:bg-white/5 transition-colors">
                              <td className="px-3 py-1.5 text-xs font-mono font-medium">{col.name}</td>
                              <td className="px-3 py-1.5 text-xs font-mono text-blue-500">{col.type}</td>
                              <td className="px-3 py-1.5 text-xs">{col.nullable ? <span className="text-yellow-500">YES</span> : <span className="text-muted-foreground">NO</span>}</td>
                              <td className="px-3 py-1.5 text-xs">{col.key === 'PRI' ? <span className="text-amber-500 font-medium">PRI</span> : col.key === 'UNI' ? <span className="text-purple-500">UNI</span> : col.key === 'MUL' ? <span className="text-green-500">MUL</span> : <span className="text-muted-foreground/50">-</span>}</td>
                              <td className="px-3 py-1.5 text-xs font-mono">{col.defaultValue ?? <span className="text-muted-foreground/50 italic">NULL</span>}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{col.extra || '-'}</td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">{col.comment || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : tableLoading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted/80 backdrop-blur-sm">
                          {primaryKeys.length > 0 && (
                            <th className="px-2 py-2 border-b border-border/50 w-8">
                              <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                                {selectedRowIdxs.size === sortedRows.length && sortedRows.length > 0 ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                            </th>
                          )}
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border/50 w-12">#</th>
                          {tableColumns.map((col) => (
                            <th key={col} onClick={() => handleSort(col)} className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground border-b border-border/50 cursor-pointer hover:text-foreground hover:bg-white/5 transition-colors select-none">
                              <span className="flex items-center gap-1">
                                {col}
                                {sortColumn === col && sortDir && <ArrowUpDown className={cn('w-3 h-3 text-blue-500', sortDir === 'desc' && 'rotate-180')} />}
                              </span>
                              {columnTypes[col] && <span className="block text-[9px] font-normal text-muted-foreground/50 mt-0.5">{columnTypes[col]}</span>}
                            </th>
                          ))}
                          {canEdit && <th className="w-8 border-b border-border/50" />}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, i) => (
                          <tr key={i} className={cn('border-b border-border/30 hover:bg-white/3 dark:hover:bg-white/5 transition-colors group', selectedRowIdxs.has(i) && 'bg-blue-500/10')}>
                            {primaryKeys.length > 0 && (
                              <td className="px-2 py-1.5">
                                <button onClick={() => toggleRowSelect(i)} className="text-muted-foreground hover:text-foreground transition-colors">
                                  {selectedRowIdxs.has(i) ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                            )}
                            <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{pageStart + i}</td>
                            {tableColumns.map((col) => {
                              const isEditing = editingCell?.rowIdx === i && editingCell?.col === col
                              return (
                                <td key={col} className={cn('px-3 py-1.5 font-mono text-xs max-w-[300px] relative', isEditing ? 'p-0' : 'truncate', canEdit && !isEditing && 'cursor-pointer')}
                                  title={isEditing ? undefined : String(row[col] ?? 'NULL')}
                                  onDoubleClick={() => !isEditing && startEditing(row, i, col, row[col])}>
                                  {isEditing ? (
                                    <div className="flex items-center gap-0">
                                      <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); if (e.key === 'Tab') { e.preventDefault(); saveEdit() } }}
                                        disabled={editSaving} className="w-full px-2 py-1 text-xs font-mono bg-background border border-blue-500/50 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
                                      <button onClick={() => setEditValue('')} className="p-1 text-amber-500 hover:bg-amber-500/10 rounded-sm shrink-0" title="Set NULL"><span className="text-[9px] font-bold">∅</span></button>
                                      <button onClick={saveEdit} disabled={editSaving} className="p-1 text-green-500 hover:bg-green-500/10 rounded-sm shrink-0" title="Save (Enter)">
                                        {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                      </button>
                                      <button onClick={cancelEditing} className="p-1 text-muted-foreground hover:bg-white/10 rounded-sm shrink-0" title="Cancel (Esc)"><X className="w-3 h-3" /></button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className={cn(row[col] === null && 'text-muted-foreground/50 italic')}>{row[col] === null ? 'NULL' : String(row[col])}</span>
                                      <button onClick={() => copyCell(row[col])} className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity" title="Copy">
                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                      </button>
                                    </>
                                  )}
                                </td>
                              )
                            })}
                            {canEdit && (
                              <td className="px-1 py-1.5">
                                <button onClick={() => setDeleteConfirm({ row, idx: i })} className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all" title="Delete row">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {sortedRows.length === 0 && (
                          <tr>
                            <td colSpan={tableColumns.length + 1 + (primaryKeys.length > 0 ? 1 : 0) + (canEdit ? 1 : 0)} className="px-4 py-8 text-center text-sm text-muted-foreground">
                              {tableSearch ? 'No rows match your filter' : 'Table is empty'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Floating bulk action bar */}
                {selectedRowIdxs.size > 0 && tableView === 'data' && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl border border-border bg-popover shadow-2xl">
                    <span className="text-xs font-medium">{selectedRowIdxs.size} row{selectedRowIdxs.size > 1 ? 's' : ''} selected</span>
                    <Button variant="outline" size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={() => handleExportSelected('csv')}>
                      <Download className="w-3 h-3" /> Export
                    </Button>
                    {canEdit && (
                      <Button variant="destructive" size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={() => setBulkDeleteConfirm(true)}>
                        <Trash2 className="w-3 h-3" /> Delete
                      </Button>
                    )}
                    <button onClick={() => setSelectedRowIdxs(new Set())} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                  </div>
                )}

                {tableView === 'data' && (
                  <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/50 shrink-0 bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Showing {tableTotal > 0 ? `${pageStart}–${pageEnd}` : '0'} of {tableTotal.toLocaleString()}</span>
                      <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))} className="h-5 text-[10px] rounded border border-border/50 bg-background/50 px-1 focus:outline-none">
                        {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handlePageChange(0)} disabled={currentPage === 0} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="First page"><ChevronsLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 0} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Previous page"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <span className="text-[10px] text-muted-foreground px-2 tabular-nums">{currentPage + 1} / {totalPages}</span>
                      <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages - 1} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Next page"><ChevronRight className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handlePageChange(totalPages - 1)} disabled={currentPage >= totalPages - 1} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Last page"><ChevronsRight className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Table2 className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center max-w-xs">Select a table from the sidebar to view data, structure, or the full database schema.</p>
              </div>
            )}
          </div>

        <div onMouseDown={handleDragStart} className="shrink-0 flex h-3 select-none items-center justify-center cursor-row-resize group">
          <div className="h-0.5 w-8 rounded-full bg-border/40 transition-colors group-hover:bg-blue-500/40 group-active:bg-blue-500/60" />
        </div>

        {/* SQL Editor */}
        <div
          className="shrink-0 flex flex-col border border-border/50 rounded-xl bg-muted/20 overflow-hidden"
          style={{ height: editorHeight }}
          data-tour="tour-db-sql-panel"
        >
          <div className="flex items-center border-b border-border/50 shrink-0 bg-muted/30">
            <div className="flex-1 flex items-center overflow-x-auto min-w-0">
              {queryTabs.map((tab) => (
                <button key={tab.id} onClick={() => switchTab(tab.id)} className={cn('relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-border/30 shrink-0 transition-colors', activeTabId === tab.id ? 'bg-background/80 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5')}>
                  <span>{tab.name}</span>
                  {queryTabs.length > 1 && <span onClick={(e) => { e.stopPropagation(); removeQueryTab(tab.id) }} className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"><X className="w-3 h-3" /></span>}
                  {activeTabId === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                </button>
              ))}
              <button onClick={addQueryTab} className="flex items-center justify-center w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors" title="New query tab"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 px-3 shrink-0">
              {queryTime > 0 && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{queryTime}ms</span>}
              {selectedDb && <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{selectedDb}</span>}
              <div className="relative">
                <button onClick={() => setShowHistory(!showHistory)} className={cn('p-1 rounded transition-colors', showHistory ? 'text-blue-500 dark:text-blue-400 bg-blue-500/15' : 'text-muted-foreground hover:text-foreground hover:bg-white/10')} title="Query history">
                  <History className="w-3.5 h-3.5" />
                </button>
                {showHistory && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-64 overflow-auto rounded-lg border border-border bg-popover shadow-xl">
                    <div className="px-3 py-2 border-b border-border/50 text-xs font-medium flex items-center justify-between">
                      <span>Query History</span>
                      {queryHistory.length > 0 && <button onClick={() => { setQueryHistory([]); saveQueryHistory([]) }} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">Clear</button>}
                    </div>
                    {queryHistory.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">No queries yet</div>
                    ) : queryHistory.map((h, i) => (
                      <button key={i} onClick={() => { setShowHistory(false); if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: h.sql } }) }}
                        className="w-full px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-border/30 last:border-0">
                        <div className="text-[11px] font-mono truncate">{h.sql}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{new Date(h.timestamp).toLocaleString()}</span>
                          {h.database && <span className="bg-muted/60 px-1 rounded">{h.database}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {queryColumns.length > 0 && showQueryResults && (
                <button onClick={() => handleExportQueryResults('csv')} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors" title="Export query results as CSV">
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              {showQueryResults && (
                <button
                  onClick={clearQueryResults}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  title="Clear results"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <Button size="sm" className="h-5 gap-1 px-2 text-[10px]" onClick={() => handleRunQuery()} disabled={queryRunning}>
                {queryRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Run
                <kbd className="ml-0.5 text-[9px] opacity-60 hidden sm:inline">Ctrl+Enter</kbd>
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div
              ref={editorRef}
              className={cn(
                'overflow-hidden border-b border-border/30 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none',
                showQueryResultGrid ? 'shrink-0 h-28' : 'flex-1 min-h-0',
              )}
            />
            {showQueryResultBanner &&
              (queryError ? (
                <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-destructive text-sm bg-destructive/5 border-t border-destructive/10">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs">{queryError}</span>
                </div>
              ) : (
                <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-green-600 dark:text-green-400 text-sm bg-green-500/5 border-t border-green-500/10">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs">{queryMessage}</span>
                </div>
              ))}
            {showQueryResultGrid && (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-4 py-1.5 border-b border-border/30 bg-muted/40 text-xs text-muted-foreground shrink-0">
                  {queryMessage}
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/80 backdrop-blur-sm">
                        {queryColumns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground border-b border-border/50"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryRows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/30 hover:bg-white/3 dark:hover:bg-white/5 transition-colors"
                        >
                          {queryColumns.map((col) => (
                            <td key={col} className="px-3 py-1 font-mono text-xs max-w-[300px] truncate">
                              <span className={cn(row[col] === null && 'text-muted-foreground/50 italic')}>
                                {row[col] === null ? 'NULL' : String(row[col])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-border bg-popover shadow-2xl p-5 max-w-sm w-full mx-4">
            <div className="flex items-center gap-2 text-destructive mb-3"><Trash2 className="w-5 h-5" /><span className="font-semibold">Delete Row</span></div>
            <p className="text-sm text-muted-foreground mb-4">Are you sure you want to delete this row? This action cannot be undone.</p>
            <div className="text-xs font-mono bg-muted/30 rounded-lg px-3 py-2 mb-4 max-h-24 overflow-auto">
              {primaryKeys.map((pk) => <div key={pk}><span className="text-muted-foreground">{pk}:</span> {String(deleteConfirm.row[pk])}</div>)}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" className="gap-1" onClick={handleDeleteRow}><Trash2 className="w-3.5 h-3.5" />Delete</Button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {bulkDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-border bg-popover shadow-2xl p-5 max-w-sm w-full mx-4">
            <div className="flex items-center gap-2 text-destructive mb-3"><Trash2 className="w-5 h-5" /><span className="font-semibold">Delete {selectedRowIdxs.size} Row{selectedRowIdxs.size > 1 ? 's' : ''}</span></div>
            <p className="text-sm text-muted-foreground mb-4">Are you sure you want to delete {selectedRowIdxs.size} selected row{selectedRowIdxs.size > 1 ? 's' : ''}? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancel</Button>
              <Button variant="destructive" size="sm" className="gap-1" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete {selectedRowIdxs.size}
              </Button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Sidebar tree context menu */}
      {sidebarCtx && createPortal(
        <div
          className="fixed z-[9999] min-w-[200px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{ left: sidebarCtx.x, top: sidebarCtx.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {sidebarCtx.kind === 'database' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSidebarCtx(null)
                  setCreateDbName('')
                  setCreateDbOpen(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"
              >
                <PlusCircle className="w-3.5 h-3.5 text-green-500" />
                New database…
              </button>
              <div className="border-t border-border/50 my-1" />
              <button
                type="button"
                disabled={SYSTEM_DATABASES.has(sidebarCtx.dbName)}
                title={SYSTEM_DATABASES.has(sidebarCtx.dbName) ? 'System databases cannot be dropped from here' : undefined}
                onClick={() => {
                  setSidebarCtx(null)
                  setSchemaConfirm({ kind: 'dropDatabase', db: sidebarCtx.dbName })
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left text-destructive disabled:opacity-40 disabled:pointer-events-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete database…
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSidebarCtx(null)
                  setSchemaConfirm({
                    kind: 'truncate',
                    db: sidebarCtx.dbName,
                    table: sidebarCtx.tableName,
                  })
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                Empty table…
              </button>
              <button
                type="button"
                onClick={() => {
                  setSidebarCtx(null)
                  setSchemaConfirm({
                    kind: 'dropTable',
                    db: sidebarCtx.dbName,
                    table: sidebarCtx.tableName,
                  })
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Drop table…
              </button>
            </>
          )}
        </div>,
        document.body,
      )}

      {schemaConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-border bg-popover shadow-2xl p-5 max-w-md w-full mx-4">
            <div className="flex items-center gap-2 text-destructive mb-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold">
                {schemaConfirm.kind === 'truncate' && 'Empty table'}
                {schemaConfirm.kind === 'dropTable' && 'Drop table'}
                {schemaConfirm.kind === 'dropDatabase' && 'Delete database'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {schemaConfirm.kind === 'truncate' && (
                <>
                  Run <code className="text-xs font-mono bg-muted/50 px-1 rounded">TRUNCATE TABLE</code> on{' '}
                  <span className="font-mono text-foreground">{schemaConfirm.db}.{schemaConfirm.table}</span>? All rows are removed; structure stays. Fails if foreign keys reference this table.
                </>
              )}
              {schemaConfirm.kind === 'dropTable' && (
                <>
                  Permanently drop <span className="font-mono text-foreground">{schemaConfirm.db}.{schemaConfirm.table}</span>? This cannot be undone.
                </>
              )}
              {schemaConfirm.kind === 'dropDatabase' && (
                <>
                  Permanently drop database <span className="font-mono text-foreground">{schemaConfirm.db}</span> and all of its tables? This cannot be undone.
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Runs on the server even if query editor read-only mode is on.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSchemaConfirm(null)} disabled={schemaBusy}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" className="gap-1" onClick={() => void handleConfirmSchemaAction()} disabled={schemaBusy}>
                {schemaBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {createDbOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-border bg-popover shadow-2xl p-5 max-w-sm w-full mx-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-5 h-5 text-amber-500" />
              <span className="font-semibold">New database</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Name: letters, digits, _, $, - (max 64).</p>
            <Input
              value={createDbName}
              onChange={(e) => setCreateDbName(e.target.value)}
              placeholder="my_database"
              className="font-mono text-sm mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateDatabaseSubmit()
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreateDbOpen(false)
                  setCreateDbName('')
                }}
                disabled={schemaBusy}
              >
                Cancel
              </Button>
              <Button size="sm" className="gap-1" onClick={() => void handleCreateDatabaseSubmit()} disabled={schemaBusy}>
                {schemaBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Right-click Context Menu */}
      {ctxMenu && createPortal(
        <div className="fixed z-[9999] min-w-[180px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl py-1 animate-in fade-in-0 zoom-in-95" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button onClick={handleCtxRunAll} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left">
            <Play className="w-3.5 h-3.5 text-green-500" />Run All<kbd className="ml-auto text-[10px] text-muted-foreground">Ctrl+Enter</kbd>
          </button>
          {ctxMenu.hasSelection && <button onClick={handleCtxRunSelected} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"><Play className="w-3.5 h-3.5 text-blue-500" />Run Selected</button>}
          <div className="border-t border-border/50 my-1" />
          <button onClick={() => { setCtxMenu(null); if (viewRef.current) navigator.clipboard.writeText(viewRef.current.state.doc.toString()) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"><Copy className="w-3.5 h-3.5" />Copy All</button>
          {queryTabs.length > 1 && <button onClick={() => { setCtxMenu(null); removeQueryTab(activeTabId) }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 text-destructive transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />Close Tab</button>}
        </div>, document.body
      )}
    </div>
  )
}
