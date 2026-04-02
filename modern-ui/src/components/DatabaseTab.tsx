import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Database,
  ChevronRight,
  ChevronDown,
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
} from 'lucide-react'
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

type SortDir = 'asc' | 'desc' | null

export function DatabaseTab({ host, connected }: DatabaseTabProps) {
  const [dbConnected, setDbConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [databases, setDatabases] = useState<DbNode[]>([])

  const [selectedDb, setSelectedDb] = useState('')
  const [selectedTable, setSelectedTable] = useState('')
  const [tableColumns, setTableColumns] = useState<string[]>([])
  const [tableRows, setTableRows] = useState<any[]>([])
  const [tableTotal, setTableTotal] = useState(0)
  const [tableLoading, setTableLoading] = useState(false)

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

  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const runQueryRef = useRef<(sqlOverride?: string) => void>(() => {})
  const selectedDbRef = useRef(selectedDb)
  selectedDbRef.current = selectedDb

  const saveCurrentTabContent = useCallback(() => {
    if (!viewRef.current) return
    const content = viewRef.current.state.doc.toString()
    setQueryTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, content } : t)))
  }, [activeTabId])

  const handleConnect = useCallback(async () => {
    if (!window.electronAPI) return
    setConnecting(true)
    setError('')
    const result = await window.electronAPI.dbConnect(host, 'admin', 'admin@rfid.edge')
    if (result.ok) {
      setDbConnected(true)
      setDatabases(result.databases.map((d) => ({ name: d, tables: undefined, expanded: false, loading: false })))
    } else {
      setError(result.error)
    }
    setConnecting(false)
  }, [host])

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

  const handleSelectTable = useCallback(async (dbName: string, tableName: string) => {
    if (!window.electronAPI) return
    setSelectedDb(dbName)
    setSelectedTable(tableName)
    setTableLoading(true)
    setSortColumn(null)
    setSortDir(null)
    setTableSearch('')

    const result = await window.electronAPI.dbGetTableData(dbName, tableName, 1000, 0)
    if (result.ok) {
      setTableColumns(result.columns)
      setTableRows(result.rows)
      setTableTotal(result.total)
    } else {
      setTableColumns([])
      setTableRows([])
      setTableTotal(0)
    }
    setTableLoading(false)
  }, [])

  const executeQuery = useCallback(async (sqlText: string) => {
    if (!window.electronAPI || !sqlText.trim()) return

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
  }, [])

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
    const close = () => setCtxMenu(null)
    if (ctxMenu) {
      window.addEventListener('click', close)
      window.addEventListener('keydown', close)
      return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', close) }
    }
  }, [ctxMenu])

  // -- Editor Lifecycle --
  const mountEditor = useCallback((content: string) => {
    if (!editorRef.current) return
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const isDark = document.documentElement.classList.contains('dark')

    const runKeymap = Prec.highest(keymap.of([
      {
        key: 'Ctrl-Enter',
        run: () => { runQueryRef.current(); return true },
      },
      {
        key: 'Mod-Enter',
        run: () => { runQueryRef.current(); return true },
      },
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
        sql({ dialect: MySQL }),
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
          contextmenu: (e) => {
            handleContextMenu(e)
            return true
          },
        }),
      ],
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view
  }, [handleContextMenu])

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

  const handleCornerDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = sidebarWidth
    const startHeight = editorHeight
    let active = true

    const onMove = (ev: MouseEvent) => {
      if (!active) return
      setSidebarWidth(Math.max(180, Math.min(500, startWidth + (ev.clientX - startX))))
      const container = containerRef.current
      const maxH = container ? container.clientHeight - 80 : 600
      setEditorHeight(Math.max(120, Math.min(maxH, startHeight + (startY - ev.clientY))))
    }

    const onUp = () => {
      active = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth, editorHeight])

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

  // -- Render: Not connected to IP --
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Database className="w-16 h-16 opacity-30" />
        <p className="text-lg font-medium">Connect to an IP first</p>
        <p className="text-sm">Use the connection button above to connect to a reader, then access the database.</p>
      </div>
    )
  }

  // -- Render: Not connected to DB --
  if (!dbConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Database className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Database Explorer</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Connect to the MySQL database on <span className="font-mono text-foreground">{host}</span> to browse tables and run queries.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm max-w-md">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button onClick={handleConnect} disabled={connecting} size="lg" className="gap-2 px-8">
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {connecting ? 'Connecting...' : 'Connect to Database'}
        </Button>
      </div>
    )
  }

  // -- Render: Connected --
  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="shrink-0 flex flex-col border border-border/50 rounded-xl bg-muted/30 overflow-hidden" style={{ width: sidebarWidth }}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Databases</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={handleDisconnect} title="Disconnect">
            <Unplug className="w-3.5 h-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 w-full">
          <div className="p-1.5 space-y-0.5 overflow-hidden">
            {databases.map((db) => (
              <div key={db.name}>
                <button
                  onClick={() => toggleDatabase(db.name)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5 dark:hover:bg-white/10',
                    db.expanded && 'bg-white/5 dark:bg-white/8'
                  )}
                >
                  {db.loading ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : db.expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Database className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span className="truncate font-medium text-left">{db.name}</span>
                </button>

                {db.expanded && db.tables && (
                  <div className="ml-3 pl-3 border-l border-border/40 space-y-0.5 my-0.5">
                    {db.tables.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-1 italic">No tables</p>
                    ) : (
                      db.tables.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => handleSelectTable(db.name, t.name)}
                          className={cn(
                            'w-full min-w-0 flex items-center gap-1 px-2 py-1 rounded-md text-sm transition-colors overflow-hidden',
                            selectedDb === db.name && selectedTable === t.name
                              ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 font-medium ring-1 ring-blue-500/30'
                              : 'hover:bg-white/5 dark:hover:bg-white/10 text-foreground'
                          )}
                        >
                          <Table2 className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                          <span className="truncate text-left flex-1 min-w-0">{t.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="px-3 py-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className="truncate font-mono">{host}</span>
          </div>
        </div>
      </div>

      {/* Sidebar Resize Handle */}
      <div
        onMouseDown={handleSidebarDragStart}
        className="shrink-0 w-2 cursor-col-resize flex items-center justify-center group"
      >
        <div className="w-0.5 h-8 rounded-full bg-border/40 transition-colors group-hover:bg-primary/40 group-active:bg-blue-500/60" />
      </div>

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Table Data Viewer */}
        <div className="flex-1 min-h-0 flex flex-col border border-border/50 rounded-xl bg-muted/20 overflow-hidden">
            {selectedTable ? (
              <>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <Table2 className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-sm">
                      <span className="text-muted-foreground">{selectedDb}.</span>{selectedTable}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {tableTotal.toLocaleString()} rows
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        placeholder="Filter rows..."
                        className="h-7 pl-8 pr-7 text-xs rounded-md border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary/50 w-48"
                      />
                      {tableSearch && (
                        <button onClick={() => setTableSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {tableLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted/80 backdrop-blur-sm">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border/50 w-12">#</th>
                          {tableColumns.map((col) => (
                            <th
                              key={col}
                              onClick={() => handleSort(col)}
                              className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b border-border/50 cursor-pointer hover:text-foreground hover:bg-white/5 transition-colors select-none"
                            >
                              <span className="flex items-center gap-1">
                                {col}
                                {sortColumn === col && sortDir && (
                                  <ArrowUpDown className={cn('w-3 h-3 text-primary', sortDir === 'desc' && 'rotate-180')} />
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-white/3 dark:hover:bg-white/5 transition-colors group">
                            <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                            {tableColumns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-1.5 font-mono text-xs max-w-[300px] truncate relative"
                                title={String(row[col] ?? 'NULL')}
                              >
                                <span className={cn(row[col] === null && 'text-muted-foreground/50 italic')}>
                                  {row[col] === null ? 'NULL' : String(row[col])}
                                </span>
                                <button
                                  onClick={() => copyCell(row[col])}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
                                  title="Copy"
                                >
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {sortedRows.length === 0 && (
                          <tr>
                            <td colSpan={tableColumns.length + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                              {tableSearch ? 'No rows match your filter' : 'Table is empty'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Table2 className="w-10 h-10 opacity-20" />
                <p className="text-sm">Select a table from the sidebar to view its data</p>
              </div>
            )}
          </div>

        {/* Horizontal Drag Handle with corner zone */}
        <div className="shrink-0 flex h-2 select-none">
          <div
            onMouseDown={handleCornerDragStart}
            className="shrink-0 w-3 cursor-nwse-resize"
          />
          <div
            onMouseDown={handleDragStart}
            className="flex-1 flex items-center justify-center cursor-row-resize group"
          >
            <div className="h-0.5 w-8 rounded-full bg-border/40 transition-colors group-hover:bg-primary/40 group-active:bg-blue-500/60" />
          </div>
        </div>

        {/* SQL Editor */}
        <div
          className="shrink-0 flex flex-col border border-border/50 rounded-xl bg-muted/20 overflow-hidden"
          style={{ height: editorHeight }}
        >
          {/* Tab Bar */}
          <div className="flex items-center border-b border-border/50 shrink-0 bg-muted/30">
            <div className="flex-1 flex items-center overflow-x-auto min-w-0">
              {queryTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-border/30 shrink-0 transition-colors',
                    activeTabId === tab.id
                      ? 'bg-background/80 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <span>{tab.name}</span>
                  {queryTabs.length > 1 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeQueryTab(tab.id) }}
                      className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                  {activeTabId === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                  )}
                </button>
              ))}
              <button
                onClick={addQueryTab}
                className="flex items-center justify-center w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                title="New query tab"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 shrink-0">
              {queryTime > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {queryTime}ms
                </span>
              )}
              {selectedDb && (
                <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                  {selectedDb}
                </span>
              )}
              <Button
                size="sm"
                className="h-5 gap-1 px-2 text-[10px]"
                onClick={() => handleRunQuery()}
                disabled={queryRunning}
              >
                {queryRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Run
                <kbd className="ml-0.5 text-[9px] opacity-60 hidden sm:inline">Ctrl+Enter</kbd>
              </Button>
            </div>
          </div>

          {/* Editor + Results */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div
              ref={editorRef}
              className={cn(
                'shrink-0 border-b border-border/30 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none',
                showQueryResults ? 'h-28' : 'flex-1'
              )}
            />

            {showQueryResults && (
              <div className="flex-1 min-h-0 flex flex-col">
                {queryError ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 text-destructive text-sm bg-destructive/5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-mono text-xs">{queryError}</span>
                  </div>
                ) : queryMessage && queryColumns.length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 text-green-600 dark:text-green-400 text-sm bg-green-500/5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="font-mono text-xs">{queryMessage}</span>
                  </div>
                ) : queryColumns.length > 0 ? (
                  <>
                    <div className="px-4 py-1.5 border-b border-border/30 bg-muted/40 text-xs text-muted-foreground shrink-0">
                      {queryMessage}
                    </div>
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/80 backdrop-blur-sm">
                            {queryColumns.map((col) => (
                              <th key={col} className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground border-b border-border/50">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryRows.map((row, i) => (
                            <tr key={i} className="border-b border-border/30 hover:bg-white/3 dark:hover:bg-white/5 transition-colors">
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
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right-click Context Menu (portaled to body to escape backdrop-blur containment) */}
      {ctxMenu && createPortal(
        <div
          className="fixed z-[9999] min-w-[180px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={handleCtxRunAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"
          >
            <Play className="w-3.5 h-3.5 text-green-500" />
            Run All
            <kbd className="ml-auto text-[10px] text-muted-foreground">Ctrl+Enter</kbd>
          </button>
          {ctxMenu.hasSelection && (
            <button
              onClick={handleCtxRunSelected}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"
            >
              <Play className="w-3.5 h-3.5 text-blue-500" />
              Run Selected
            </button>
          )}
          <div className="border-t border-border/50 my-1" />
          <button
            onClick={() => { setCtxMenu(null); if (viewRef.current) { navigator.clipboard.writeText(viewRef.current.state.doc.toString()) } }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 transition-colors text-left"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy All
          </button>
          {queryTabs.length > 1 && (
            <button
              onClick={() => { setCtxMenu(null); removeQueryTab(activeTabId) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/10 text-destructive transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Close Tab
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
