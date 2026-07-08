import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTourInteractionOptional } from '@/contexts/TourInteractionContext'
import { publishStatus, clearStatus } from '@/lib/workspace-status'
import { prettifySql } from '@/lib/sql-format'
import { buildExplainSql } from '@/lib/sql-explain'
import { coerceImportValue, parseImportFile, type ParsedImport } from '@/lib/db-import-parse'
import { formatDbExportProgressMessage } from '@/lib/db-export-progress'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { sql, MySQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'

import { DatabaseSchemaGraph } from './DatabaseSchemaGraph'
import { DbNoHostScreen, DbLoginScreen } from './DbConnectScreens'
import { DbSidebar } from './DbSidebar'
import { DbDataGrid } from './DbDataGrid'
import { DbStructureTable } from './DbStructureTable'
import {
  DbBulkActionBar,
  DbInsertRowForm,
  DbNoTablePlaceholder,
  DbPaginationBar,
  DbTableToolbar,
} from './DbTablePanel'
import { DbSqlPanel } from './DbSqlPanel'
import { DbSidebarContextMenu, DbEditorContextMenu } from './DbMenus'
import {
  DbBulkDeleteDialog,
  DbCreateDatabaseDialog,
  DbCreateTableDialog,
  DbDeleteRowDialog,
  DbImportPreviewDialog,
  DbSchemaConfirmDialog,
} from './DbDialogs'
import {
  DANGEROUS_SQL,
  DB_CREDS_KEY,
  DEFAULT_CREATE_TABLE_COLUMNS,
  NEW_DB_NAME_RE,
  NEW_TABLE_NAME_RE,
  downloadFile,
  exportToCsv,
  exportToJson,
  exportToSql,
  loadQueryHistory,
  quoteIdent,
  saveQueryHistory,
  type ColumnInfo,
  type DbNode,
  type ExportFormat,
  type QueryHistoryEntry,
  type QueryTab,
  type SchemaConfirmState,
  type SchemaData,
  type SidebarCtx,
  type SortDir,
  type TableView,
} from './db-tab-shared'

interface DatabaseTabProps {
  host: string
  connected: boolean
  /** When false, background auto-refresh is paused. */
  active?: boolean
}

export function DatabaseTab({ host, connected, active = true }: DatabaseTabProps) {
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
  const [sidebarCtx, setSidebarCtx] = useState<SidebarCtx | null>(null)
  const [schemaConfirm, setSchemaConfirm] = useState<SchemaConfirmState | null>(null)

  const [createDbOpen, setCreateDbOpen] = useState(false)
  const [createDbName, setCreateDbName] = useState('')
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [createTableDb, setCreateTableDb] = useState('')
  const [createTableName, setCreateTableName] = useState('')
  const [createTableColumnSql, setCreateTableColumnSql] = useState(DEFAULT_CREATE_TABLE_COLUMNS)
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

  const [schemaData, setSchemaData] = useState<SchemaData | null>(null)
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

  // Import
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] = useState<ParsedImport | null>(null)
  const [importFilename, setImportFilename] = useState('')
  const [importBusy, setImportBusy] = useState(false)

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
  const historyBtnRef = useRef<HTMLButtonElement>(null)
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
    if (!window.electronAPI?.safeStoreSet) return
    try {
      await window.electronAPI.safeStoreSet(DB_CREDS_KEY, payload)
      localStorage.removeItem(DB_CREDS_KEY)
    } catch {
      toast.error('Could not save credentials securely')
    }
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

    const result = await window.electronAPI.dbGetTableData(dbName, tableName, size, page * size)
    if (result.ok) {
      setTableColumns(result.columns)
      setTableRows(result.rows)
      setTableTotal(result.total)
      setColumnTypes(result.columnTypes || {})
      setPrimaryKeys(result.primaryKeys ?? [])
    } else {
      setTableColumns([])
      setTableRows([])
      setTableTotal(0)
      setColumnTypes({})
      setPrimaryKeys([])
    }
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
    const expandedDbNames = databases.filter((d) => d.expanded).map((d) => d.name)
    let result = await window.electronAPI.dbListDatabases?.()
    if (!result?.ok) {
      result = await window.electronAPI.dbConnect(host, dbUser, dbPass)
    }
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
      const namesToRefresh = expandedDbNames.filter((name) => result.databases.includes(name))
      if (namesToRefresh.length > 0) {
        const tableResults = await Promise.all(
          namesToRefresh.map((name) => window.electronAPI!.dbGetTables(name)),
        )
        setDatabases((prev) =>
          prev.map((d) => {
            const idx = namesToRefresh.indexOf(d.name)
            if (idx < 0) return d
            const tablesResult = tableResults[idx]
            return tablesResult.ok
              ? { ...d, tables: tablesResult.tables, loading: false }
              : d
          }),
        )
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
  const executeMutationSql = useCallback(async (sqlText: string, useDatabase?: string): Promise<boolean> => {
    if (!window.electronAPI || !sqlText.trim()) return false
    setSchemaBusy(true)
    try {
      const result = await window.electronAPI.dbExecuteQuery(sqlText.trim(), useDatabase)
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

  const openDatabaseSidebarMenu = useCallback((e: ReactMouseEvent, dbName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dbConnected) return
    setSidebarCtx({ x: e.clientX, y: e.clientY, kind: 'database', dbName })
  }, [dbConnected])

  const openPaneSidebarMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dbConnected) return
    setSidebarCtx({ x: e.clientX, y: e.clientY, kind: 'pane' })
  }, [dbConnected])

  const openTableSidebarMenu = useCallback((e: ReactMouseEvent, dbName: string, tableName: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dbConnected) return
    setSidebarCtx({ x: e.clientX, y: e.clientY, kind: 'table', dbName, tableName })
  }, [dbConnected])

  const openCreateDatabaseDialog = useCallback(() => {
    setSidebarCtx(null)
    setCreateDbName('')
    setCreateDbOpen(true)
  }, [])

  const openCreateTableDialog = useCallback((dbName: string) => {
    setSidebarCtx(null)
    setCreateTableDb(dbName)
    setCreateTableName('')
    setCreateTableColumnSql(DEFAULT_CREATE_TABLE_COLUMNS)
    setCreateTableOpen(true)
  }, [])

  const handleConfirmSchemaAction = useCallback(async () => {
    if (!schemaConfirm || !window.electronAPI) return
    const q = schemaConfirm
    let sqlText = ''
    let useDb: string | undefined

    if (q.kind === 'truncate') {
      sqlText = `TRUNCATE TABLE ${quoteIdent(q.table)}`
      useDb = q.db
    } else if (q.kind === 'dropTable') {
      sqlText = `DROP TABLE ${quoteIdent(q.table)}`
      useDb = q.db
    } else {
      sqlText = `DROP DATABASE ${quoteIdent(q.db)}`
      useDb = undefined
    }

    const ok = await executeMutationSql(sqlText, useDb)
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

  const handleCreateTableSubmit = useCallback(async () => {
    const name = createTableName.trim()
    const dbName = createTableDb.trim()
    const columns = createTableColumnSql.trim()
    if (!dbName) return
    if (!NEW_TABLE_NAME_RE.test(name)) {
      toast.error('Invalid table name (letters, digits, _, $, - only; max 64).')
      return
    }
    if (!columns) {
      toast.error('Add at least one column definition.')
      return
    }
    const sqlText = `CREATE TABLE ${quoteIdent(name)} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    const ok = await executeMutationSql(sqlText, dbName)
    if (!ok) return

    setCreateTableOpen(false)
    setCreateTableName('')
    setCreateTableColumnSql(DEFAULT_CREATE_TABLE_COLUMNS)

    if (window.electronAPI) {
      setDatabases((prev) =>
        prev.map((d) => (d.name === dbName ? { ...d, expanded: true, loading: true } : d)),
      )
      const result = await window.electronAPI.dbGetTables(dbName)
      setDatabases((prev) =>
        prev.map((d) => {
          if (d.name !== dbName) return d
          if (result.ok) return { ...d, tables: result.tables, loading: false }
          return { ...d, loading: false }
        }),
      )
    }
  }, [createTableName, createTableDb, createTableColumnSql, executeMutationSql])

  const handleSelectTable = useCallback(async (dbName: string, tableName: string) => {
    setTableLoading(true)
    setTableRows([])
    setSelectedDb(dbName)
    setSelectedTable(tableName)
    setSortColumn(null)
    setSortDir(null)
    setTableSearch('')
    setCurrentPage(0)
    setTableView('data')
    setShowInsertRow(false)
    setSelectedRowIdxs(new Set())
    setTableStructure([])
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

  const getEditorQuery = useCallback((): string => {
    if (!viewRef.current) return ''
    const view = viewRef.current
    const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
    return (selection.trim() || view.state.doc.toString().trim())
  }, [])

  const handlePrettifySql = useCallback(() => {
    if (!viewRef.current) return
    const query = viewRef.current.state.doc.toString()
    if (!query.trim()) return
    const formatted = prettifySql(query)
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted },
    })
    saveCurrentTabContent()
    toast.success('SQL formatted')
  }, [saveCurrentTabContent])

  const handleExplainQuery = useCallback(() => {
    const query = getEditorQuery()
    if (!query) return
    const built = buildExplainSql(query)
    if (!built.ok) {
      toast.error(built.error)
      return
    }
    if (built.note) toast.info(built.note)
    executeQuery(built.sql)
  }, [getEditorQuery, executeQuery])

  const handleImportFilePick = useCallback(() => {
    if (readOnly) {
      toast.error('Disable read-only mode to import rows')
      return
    }
    if (!selectedDb || !selectedTable) {
      toast.error('Select a table first')
      return
    }
    importInputRef.current?.click()
  }, [readOnly, selectedDb, selectedTable])

  const handleImportFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseImportFile(text, file.name)
      if (parsed.rows.length === 0) {
        toast.error('File contains no data rows')
        return
      }
      setImportFilename(file.name)
      setImportPreview(parsed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse import file')
    }
  }, [])

  const handleConfirmImport = useCallback(async () => {
    if (!importPreview || !window.electronAPI || !selectedDb || !selectedTable) return
    setImportBusy(true)
    try {
      const tableColSet = new Set(tableColumns)
      const rows = importPreview.rows.map((row) => {
        const out: Record<string, string | number | null> = {}
        for (const col of importPreview.columns) {
          if (!tableColSet.has(col)) continue
          out[col] = coerceImportValue(row[col] ?? '')
        }
        return out
      }).filter((row) => Object.keys(row).length > 0)

      if (rows.length === 0) {
        toast.error('No import columns match this table')
        return
      }

      const result = await window.electronAPI.dbImportRows(selectedDb, selectedTable, rows)
      if (result.ok) {
        toast.success(`Imported ${result.inserted} row(s)${result.skipped ? ` (${result.skipped} skipped)` : ''}`)
        setImportPreview(null)
        setImportFilename('')
        await loadPage(selectedDb, selectedTable, currentPage, pageSize)
        await refreshDatabases()
      } else {
        toast.error(result.error)
      }
    } finally {
      setImportBusy(false)
    }
  }, [importPreview, selectedDb, selectedTable, tableColumns, loadPage, currentPage, pageSize, refreshDatabases])

  const clearQueryResults = useCallback(() => {
    setQueryColumns([])
    setQueryRows([])
    setQueryMessage('')
    setQueryError('')
    setQueryTime(0)
    setShowQueryResults(false)
  }, [])

  // -- Export --
  const handleExport = useCallback((format: ExportFormat) => {
    setShowExportMenu(false)
    const cols = tableColumns
    const rows = tableRows
    const name = `${selectedDb}_${selectedTable}`
    if (format === 'csv') downloadFile(exportToCsv(cols, rows), `${name}_page.csv`, 'text/csv')
    else if (format === 'json') downloadFile(exportToJson(cols, rows), `${name}_page.json`, 'application/json')
    else if (format === 'sql') downloadFile(exportToSql(selectedTable, cols, rows), `${name}_page.sql`, 'text/sql')
  }, [tableColumns, tableRows, selectedDb, selectedTable])

  const handleExportSelected = useCallback((format: ExportFormat) => {
    setShowExportMenu(false)
    const rows = sortedRowsRef.current.filter((_, i) => selectedRowIdxs.has(i))
    if (rows.length === 0) return
    const cols = tableColumns
    const name = `${selectedDb}_${selectedTable}_selected`
    if (format === 'csv') downloadFile(exportToCsv(cols, rows), `${name}.csv`, 'text/csv')
    else if (format === 'json') downloadFile(exportToJson(cols, rows), `${name}.json`, 'application/json')
    else if (format === 'sql') downloadFile(exportToSql(selectedTable, cols, rows), `${name}.sql`, 'text/sql')
  }, [tableColumns, selectedRowIdxs, selectedDb, selectedTable])

  const handleExportAll = useCallback(async (format: ExportFormat) => {
    if (!window.electronAPI) return
    setShowExportMenu(false)
    if (format === 'json') {
      setExporting(true)
      try {
        const result = await window.electronAPI.dbExportTable(selectedDb, selectedTable)
        if (result.ok) {
          const name = `${selectedDb}_${selectedTable}_all`
          downloadFile(exportToJson(result.columns, result.rows), `${name}.json`, 'application/json')
        } else {
          setError(result.error)
          setTimeout(() => setError(''), 3000)
        }
      } finally {
        setExporting(false)
      }
      return
    }

    const toastId = toast.loading(`Choose where to save ${selectedTable}…`)
    setExporting(true)
    const stopProgress = window.electronAPI.onDbExportProgress((p) => {
      toast.loading(formatDbExportProgressMessage(p), { id: toastId })
    })
    try {
      const result = await window.electronAPI.dbSaveExportTable(
        selectedDb,
        selectedTable,
        format === 'csv' ? 'csv' : 'sql',
      )
      if ('cancelled' in result && result.cancelled) {
        toast.dismiss(toastId)
        return
      }
      if (result.ok) {
        toast.success(`Exported ${result.total.toLocaleString()} row(s) to file`, { id: toastId })
      } else if ('error' in result) {
        toast.error(result.error, { id: toastId })
      }
    } finally {
      stopProgress()
      setExporting(false)
    }
  }, [selectedDb, selectedTable])

  const exportTableFromSidebar = useCallback(async (dbName: string, tableName: string, format: 'csv' | 'sql') => {
    if (!window.electronAPI?.dbSaveExportTable) return
    setSidebarCtx(null)
    const toastId = toast.loading(`Choose where to save ${tableName}…`)
    setExporting(true)
    const stopProgress = window.electronAPI.onDbExportProgress((p) => {
      toast.loading(formatDbExportProgressMessage(p), { id: toastId })
    })
    try {
      const result = await window.electronAPI.dbSaveExportTable(dbName, tableName, format)
      if ('cancelled' in result && result.cancelled) {
        toast.dismiss(toastId)
        return
      }
      if (result.ok) {
        toast.success(`Exported ${result.total.toLocaleString()} row(s) from ${tableName}`, { id: toastId })
      } else if ('error' in result) {
        toast.error(result.error, { id: toastId })
      }
    } finally {
      stopProgress()
      setExporting(false)
    }
  }, [])

  const exportDatabaseFromSidebar = useCallback(async (dbName: string, format: 'sql' | 'csv') => {
    if (!window.electronAPI) return
    setSidebarCtx(null)
    const toastId = toast.loading(
      format === 'sql' ? `Choose where to save ${dbName} SQL dump…` : `Choose folder for ${dbName} CSV files…`,
    )
    setExporting(true)
    const stopProgress = window.electronAPI.onDbExportProgress((p) => {
      toast.loading(formatDbExportProgressMessage(p), { id: toastId })
    })
    try {
      if (format === 'sql') {
        const result = await window.electronAPI.dbSaveExportDatabaseSql(dbName)
        if ('cancelled' in result && result.cancelled) {
          toast.dismiss(toastId)
          return
        }
        if (result.ok) {
          toast.success(
            `Exported ${dbName} (${result.tableCount} tables, ${result.totalRows.toLocaleString()} rows)`,
            { id: toastId },
          )
        } else if ('error' in result) {
          toast.error(result.error, { id: toastId })
        }
        return
      }

      const result = await window.electronAPI.dbSaveExportDatabaseCsv(dbName)
      if ('cancelled' in result && result.cancelled) {
        toast.dismiss(toastId)
        return
      }
      if (result.ok) {
        toast.success(
          `Exported ${result.tableCount} table(s), ${result.totalRows.toLocaleString()} rows to folder`,
          { id: toastId },
        )
      } else if ('error' in result) {
        toast.error(result.error, { id: toastId })
      }
    } finally {
      stopProgress()
      setExporting(false)
    }
  }, [])

  const handleExportQueryResultsCsv = useCallback(() => {
    downloadFile(exportToCsv(queryColumns, queryRows), 'query_results.csv', 'text/csv')
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

  // -- Editor Context Menu --
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
    if (!active || !autoRefresh || !dbConnected) return
    const id = setInterval(() => { refreshDatabases() }, autoRefreshSec * 1000)
    return () => clearInterval(id)
  }, [active, autoRefresh, autoRefreshSec, dbConnected, refreshDatabases])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbConnected, activeTabId, mountEditor])

  // -- Drag Resize --
  const handleDragStart = useCallback((e: ReactMouseEvent) => {
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

  const handleSidebarDragStart = useCallback((e: ReactMouseEvent) => {
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

  const handleSort = useCallback((col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      if (sortDir === 'desc') setSortColumn(null)
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
  }, [sortColumn, sortDir])

  const editingRowRef = useRef<any>(null)

  const startEditing = useCallback((row: any, rowIdx: number, col: string, currentValue: any) => {
    if (primaryKeys.length === 0 || readOnly) return
    editingRowRef.current = row
    setEditingCell({ rowIdx, col })
    setEditValue(currentValue === null ? '' : String(currentValue))
  }, [primaryKeys.length, readOnly])

  const cancelEditing = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

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

  const filteredRows = useMemo(() => {
    if (!tableSearch) return tableRows
    const q = tableSearch.toLowerCase()
    return tableRows.filter((row) =>
      Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)),
    )
  }, [tableRows, tableSearch])

  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDir) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const va = a[sortColumn!]
      const vb = b[sortColumn!]
      if (va == null && vb == null) return 0
      if (va == null) return sortDir === 'asc' ? -1 : 1
      if (vb == null) return sortDir === 'asc' ? 1 : -1
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [filteredRows, sortColumn, sortDir])

  sortedRowsRef.current = sortedRows

  const canEdit = !readOnly && primaryKeys.length > 0

  if (!connected) {
    return <DbNoHostScreen />
  }

  if (!dbConnected) {
    return (
      <DbLoginScreen
        host={host}
        dbUser={dbUser}
        dbPass={dbPass}
        rememberCreds={rememberCreds}
        connecting={connecting}
        credsLoaded={credsLoaded}
        error={error}
        onUserChange={setDbUser}
        onPassChange={setDbPass}
        onRememberChange={(v) => {
          setRememberCreds(v)
          if (!v) clearCreds()
        }}
        onConnect={handleConnect}
      />
    )
  }

  const hasTableContext = Boolean(selectedDb && (selectedTable || tableView === 'schema'))

  return (
    <div className="stagger-children flex h-full min-h-0" data-tour="tour-database">
      <DbSidebar
        width={sidebarWidth}
        host={host}
        databases={databases}
        selectedDb={selectedDb}
        selectedTable={selectedTable}
        readOnly={readOnly}
        refreshing={refreshing}
        autoRefresh={autoRefresh}
        autoRefreshSec={autoRefreshSec}
        showAutoRefreshMenu={showAutoRefreshMenu}
        onToggleReadOnly={toggleReadOnly}
        onRefresh={refreshDatabases}
        onToggleAutoRefreshMenu={() => setShowAutoRefreshMenu((v) => !v)}
        onAutoRefreshChange={setAutoRefresh}
        onAutoRefreshSecChange={setAutoRefreshSec}
        onDisconnect={handleDisconnect}
        onToggleDatabase={toggleDatabase}
        onSelectTable={handleSelectTable}
        onPaneContextMenu={openPaneSidebarMenu}
        onDatabaseContextMenu={openDatabaseSidebarMenu}
        onTableContextMenu={openTableSidebarMenu}
      />

      {/* Sidebar resize handle */}
      <div onMouseDown={handleSidebarDragStart} className="shrink-0 w-2 cursor-col-resize flex items-center justify-center group">
        <div className="w-0.5 h-8 rounded-full bg-border/40 transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
      </div>

      {/* Main column */}
      <div ref={containerRef} className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 min-h-0 flex flex-col border border-border/40 rounded-xl bg-card/60 ring-1 ring-border/20 overflow-hidden relative">
          {hasTableContext ? (
            <>
              <DbTableToolbar
                selectedDb={selectedDb}
                selectedTable={selectedTable}
                tableView={tableView}
                onViewChange={handleViewToggle}
                tableTotal={tableTotal}
                hasPrimaryKey={primaryKeys.length > 0}
                readOnly={readOnly}
                canEdit={canEdit}
                schemaData={schemaData}
                showInsertRow={showInsertRow}
                onToggleInsertRow={() => {
                  setShowInsertRow((v) => !v)
                  setInsertValues({})
                }}
                onImportPick={handleImportFilePick}
                exporting={exporting}
                showExportMenu={showExportMenu}
                onToggleExportMenu={() => setShowExportMenu((v) => !v)}
                selectedCount={selectedRowIdxs.size}
                onExportPage={handleExport}
                onExportSelected={handleExportSelected}
                onExportAll={handleExportAll}
                tableSearch={tableSearch}
                onTableSearchChange={setTableSearch}
              />

              {showInsertRow && tableView === 'data' && !readOnly && (
                <DbInsertRowForm
                  columns={tableColumns}
                  columnTypes={columnTypes}
                  values={insertValues}
                  saving={insertSaving}
                  onValueChange={(col, v) => setInsertValues((prev) => ({ ...prev, [col]: v }))}
                  onSubmit={handleInsertRow}
                  onCancel={() => setShowInsertRow(false)}
                />
              )}

              {error && (
                <div className="px-4 py-1.5 bg-destructive/10 text-destructive text-xs flex items-center gap-2 shrink-0">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </div>
              )}

              {tableView === 'schema' ? (
                schemaLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
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
                <DbStructureTable structure={tableStructure} loading={structureLoading} />
              ) : (
                <DbDataGrid
                  columns={tableColumns}
                  rows={sortedRows}
                  columnTypes={columnTypes}
                  primaryKeys={primaryKeys}
                  pageStart={pageStart}
                  loading={tableLoading}
                  canEdit={canEdit}
                  tableSearch={tableSearch}
                  sortColumn={sortColumn}
                  sortDir={sortDir}
                  onSort={handleSort}
                  selectedRowIdxs={selectedRowIdxs}
                  onToggleRowSelect={toggleRowSelect}
                  onToggleSelectAll={toggleSelectAll}
                  editingCell={editingCell}
                  editValue={editValue}
                  editSaving={editSaving}
                  onStartEdit={startEditing}
                  onEditValueChange={setEditValue}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEditing}
                  onDeleteRow={(row, idx) => setDeleteConfirm({ row, idx })}
                />
              )}

              {selectedRowIdxs.size > 0 && tableView === 'data' && (
                <DbBulkActionBar
                  count={selectedRowIdxs.size}
                  canEdit={canEdit}
                  onExportCsv={() => handleExportSelected('csv')}
                  onDelete={() => setBulkDeleteConfirm(true)}
                  onClear={() => setSelectedRowIdxs(new Set())}
                />
              )}

              {tableView === 'data' && (
                <DbPaginationBar
                  tableTotal={tableTotal}
                  pageStart={pageStart}
                  pageEnd={pageEnd}
                  pageSize={pageSize}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageSizeChange={handlePageSizeChange}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          ) : (
            <DbNoTablePlaceholder />
          )}
        </div>

        {/* Editor resize handle */}
        <div onMouseDown={handleDragStart} className="shrink-0 flex h-3 select-none items-center justify-center cursor-row-resize group">
          <div className="h-0.5 w-8 rounded-full bg-border/40 transition-colors group-hover:bg-primary/40 group-active:bg-primary/60" />
        </div>

        <DbSqlPanel
          height={editorHeight}
          editorRef={editorRef}
          queryTabs={queryTabs}
          activeTabId={activeTabId}
          onSwitchTab={switchTab}
          onAddTab={addQueryTab}
          onRemoveTab={removeQueryTab}
          selectedDb={selectedDb}
          queryTime={queryTime}
          queryRunning={queryRunning}
          showQueryResults={showQueryResults}
          queryColumns={queryColumns}
          queryRows={queryRows}
          queryMessage={queryMessage}
          queryError={queryError}
          queryHistory={queryHistory}
          showHistory={showHistory}
          historyBtnRef={historyBtnRef}
          onToggleHistory={(e) => {
            e.stopPropagation()
            setShowHistory((v) => !v)
          }}
          onClearHistory={() => {
            setQueryHistory([])
            saveQueryHistory([])
          }}
          onPickHistory={(sqlText) => {
            setShowHistory(false)
            if (viewRef.current) {
              viewRef.current.dispatch({
                changes: { from: 0, to: viewRef.current.state.doc.length, insert: sqlText },
              })
            }
          }}
          onExportResultsCsv={handleExportQueryResultsCsv}
          onClearResults={clearQueryResults}
          onPrettify={handlePrettifySql}
          onExplain={handleExplainQuery}
          onRun={() => handleRunQuery()}
        />
      </div>

      {/* Dialogs */}
      {deleteConfirm && (
        <DbDeleteRowDialog
          row={deleteConfirm.row}
          primaryKeys={primaryKeys}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteRow}
        />
      )}

      {bulkDeleteConfirm && (
        <DbBulkDeleteDialog
          count={selectedRowIdxs.size}
          deleting={bulkDeleting}
          onCancel={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
        />
      )}

      {schemaConfirm && (
        <DbSchemaConfirmDialog
          confirm={schemaConfirm}
          busy={schemaBusy}
          onCancel={() => setSchemaConfirm(null)}
          onConfirm={() => void handleConfirmSchemaAction()}
        />
      )}

      {importPreview && (
        <DbImportPreviewDialog
          preview={importPreview}
          filename={importFilename}
          selectedDb={selectedDb}
          selectedTable={selectedTable}
          tableColumns={tableColumns}
          busy={importBusy}
          onCancel={() => {
            setImportPreview(null)
            setImportFilename('')
          }}
          onConfirm={() => void handleConfirmImport()}
        />
      )}

      {createTableOpen && (
        <DbCreateTableDialog
          db={createTableDb}
          name={createTableName}
          columnsSql={createTableColumnSql}
          busy={schemaBusy}
          onNameChange={setCreateTableName}
          onColumnsChange={setCreateTableColumnSql}
          onCancel={() => {
            setCreateTableOpen(false)
            setCreateTableName('')
            setCreateTableColumnSql(DEFAULT_CREATE_TABLE_COLUMNS)
          }}
          onSubmit={() => void handleCreateTableSubmit()}
        />
      )}

      {createDbOpen && (
        <DbCreateDatabaseDialog
          name={createDbName}
          busy={schemaBusy}
          onNameChange={setCreateDbName}
          onCancel={() => {
            setCreateDbOpen(false)
            setCreateDbName('')
          }}
          onSubmit={() => void handleCreateDatabaseSubmit()}
        />
      )}

      {/* Context menus */}
      {sidebarCtx && (
        <DbSidebarContextMenu
          ctx={sidebarCtx}
          exporting={exporting}
          onExportDatabase={(db, fmt) => void exportDatabaseFromSidebar(db, fmt)}
          onExportTable={(db, table, fmt) => void exportTableFromSidebar(db, table, fmt)}
          onCreateTable={openCreateTableDialog}
          onCreateDatabase={openCreateDatabaseDialog}
          onDropDatabase={(db) => {
            setSidebarCtx(null)
            setSchemaConfirm({ kind: 'dropDatabase', db })
          }}
          onTruncateTable={(db, table) => {
            setSidebarCtx(null)
            setSchemaConfirm({ kind: 'truncate', db, table })
          }}
          onDropTable={(db, table) => {
            setSidebarCtx(null)
            setSchemaConfirm({ kind: 'dropTable', db, table })
          }}
        />
      )}

      {ctxMenu && (
        <DbEditorContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          hasSelection={ctxMenu.hasSelection}
          canCloseTab={queryTabs.length > 1}
          onRunAll={handleCtxRunAll}
          onRunSelected={handleCtxRunSelected}
          onPrettify={() => {
            setCtxMenu(null)
            handlePrettifySql()
          }}
          onExplain={() => {
            setCtxMenu(null)
            handleExplainQuery()
          }}
          onCopyAll={() => {
            setCtxMenu(null)
            if (viewRef.current) navigator.clipboard.writeText(viewRef.current.state.doc.toString())
          }}
          onCloseTab={() => {
            setCtxMenu(null)
            removeQueryTab(activeTabId)
          }}
        />
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={(e) => void handleImportFileChange(e)}
      />
    </div>
  )
}
