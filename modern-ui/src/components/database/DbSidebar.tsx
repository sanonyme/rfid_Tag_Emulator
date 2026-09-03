import { forwardRef, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  Database,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  SearchX,
  Table2,
  Timer,
  Unlock,
  Unplug,
  X,
} from 'lucide-react'
import { IconAction } from './DbSurfaces'
import { SYSTEM_DATABASES, type DbNode, type TableInfo } from './db-tab-shared'

interface VisibleDb {
  db: DbNode
  /** Tables to render (filtered subset while searching). */
  tables: TableInfo[] | undefined
  /** Search hit inside the table list — render expanded regardless of tree state. */
  forceExpand: boolean
}

export interface DbSidebarProps {
  width: number
  host: string
  databases: DbNode[]
  selectedDb: string
  selectedTable: string
  readOnly: boolean
  refreshing: boolean
  autoRefresh: boolean
  autoRefreshSec: number
  showAutoRefreshMenu: boolean
  onToggleReadOnly: () => void
  onRefresh: () => void
  onToggleAutoRefreshMenu: () => void
  onAutoRefreshChange: (enabled: boolean) => void
  onAutoRefreshSecChange: (sec: number) => void
  onDisconnect: () => void
  onToggleDatabase: (dbName: string) => void
  onSelectTable: (dbName: string, tableName: string) => void
  onPaneContextMenu: (e: ReactMouseEvent) => void
  onDatabaseContextMenu: (e: ReactMouseEvent, dbName: string) => void
  onTableContextMenu: (e: ReactMouseEvent, dbName: string, tableName: string) => void
}

export const DbSidebar = forwardRef<HTMLDivElement, DbSidebarProps>(function DbSidebar(
  {
    width,
    host,
    databases,
    selectedDb,
    selectedTable,
    readOnly,
    refreshing,
    autoRefresh,
    autoRefreshSec,
    showAutoRefreshMenu,
    onToggleReadOnly,
    onRefresh,
    onToggleAutoRefreshMenu,
    onAutoRefreshChange,
    onAutoRefreshSecChange,
    onDisconnect,
    onToggleDatabase,
    onSelectTable,
    onPaneContextMenu,
    onDatabaseContextMenu,
    onTableContextMenu,
  },
  ref,
) {
  const [filter, setFilter] = useState('')
  const [refreshSecDraft, setRefreshSecDraft] = useState(String(autoRefreshSec))

  useEffect(() => {
    if (!showAutoRefreshMenu) return
    setRefreshSecDraft(String(autoRefreshSec))
    // Snapshot only when the menu opens so typing (including clearing) is not overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAutoRefreshMenu])

  const { userDbs, systemDbs } = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const visible: VisibleDb[] = []
    for (const db of databases) {
      if (!q) {
        visible.push({ db, tables: db.tables, forceExpand: false })
        continue
      }
      if (db.name.toLowerCase().includes(q)) {
        visible.push({ db, tables: db.tables, forceExpand: false })
        continue
      }
      const matching = db.tables?.filter((t) => t.name.toLowerCase().includes(q))
      if (matching && matching.length > 0) {
        visible.push({ db, tables: matching, forceExpand: true })
      }
    }
    return {
      userDbs: visible.filter((v) => !SYSTEM_DATABASES.has(v.db.name)),
      systemDbs: visible.filter((v) => SYSTEM_DATABASES.has(v.db.name)),
    }
  }, [databases, filter])

  const renderDb = ({ db, tables, forceExpand }: VisibleDb, isSystem: boolean) => {
    const expanded = db.expanded || forceExpand
    return (
      <div key={db.name}>
        <button
          type="button"
          onClick={() => onToggleDatabase(db.name)}
          onContextMenu={(e) => onDatabaseContextMenu(e, db.name)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-accent/60',
            'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30',
            selectedDb === db.name
              ? 'bg-primary/10 ring-1 ring-inset ring-primary/25'
              : db.expanded && 'bg-accent/40',
          )}
        >
          {db.loading ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                expanded && 'rotate-90',
              )}
            />
          )}
          <Database className={cn('w-3.5 h-3.5 shrink-0', isSystem ? 'text-muted-foreground/60' : 'text-amber-500')} />
          <span className={cn('truncate font-medium text-left flex-1 min-w-0', isSystem && 'text-muted-foreground')}>
            {db.name}
          </span>
          {db.tables !== undefined && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70 bg-muted/50 rounded-full px-1.5 py-px ring-1 ring-border/30">
              {db.tables.length}
            </span>
          )}
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            expanded && tables ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className={cn('min-h-0 overflow-hidden', !(expanded && tables) && 'pointer-events-none')}>
            <div
              className={cn(
                'ml-3 pl-3 pr-0.5 border-l border-border/40 space-y-0.5 my-0.5 origin-top',
                'transition-opacity duration-200 ease-out motion-reduce:transition-none',
                expanded && tables ? 'opacity-100' : 'opacity-0',
              )}
              onContextMenu={(e) => onDatabaseContextMenu(e, db.name)}
            >
              {tables && tables.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1 italic">No tables</p>
              ) : (
                tables?.map((t) => {
                  const isSelected = selectedDb === db.name && selectedTable === t.name
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => onSelectTable(db.name, t.name)}
                      onContextMenu={(e) => onTableContextMenu(e, db.name, t.name)}
                      className={cn(
                        'w-full min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors',
                        'outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30',
                        isSelected
                          ? 'bg-primary/15 text-primary font-medium ring-1 ring-inset ring-primary/25'
                          : 'hover:bg-accent/60 text-foreground',
                      )}
                    >
                      <Table2 className={cn('w-3.5 h-3.5 shrink-0', isSelected ? 'text-primary' : 'text-sky-500')} />
                      <span className="truncate text-left flex-1 min-w-0">{t.name}</span>
                      <span
                        className={cn(
                          'ml-auto shrink-0 pl-1 text-[10px] tabular-nums',
                          isSelected ? 'text-primary/70' : 'text-muted-foreground/50',
                        )}
                      >
                        {t.rows.toLocaleString()}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const noResults = filter.trim() && userDbs.length === 0 && systemDbs.length === 0

  return (
    <div
      ref={ref}
      className="shrink-0 flex flex-col min-w-0 border border-border/40 rounded-xl bg-card/60 ring-1 ring-border/20 overflow-hidden"
      style={{ width, minWidth: width, maxWidth: width }}
      data-tour="tour-db-sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between pl-3 pr-2 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">Databases</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconAction
            icon={readOnly ? Lock : Unlock}
            label={readOnly ? 'Read-only mode — click to allow edits' : 'Edits enabled — click to lock'}
            active={readOnly}
            activeClassName="text-amber-500 bg-amber-500/10"
            onClick={onToggleReadOnly}
          />
          <IconAction icon={RefreshCw} label="Refresh databases" onClick={onRefresh} disabled={refreshing} spinning={refreshing} />
          <div className="relative">
            <IconAction
              icon={Timer}
              label={autoRefresh ? `Auto-refresh every ${autoRefreshSec}s` : 'Auto-refresh'}
              active={autoRefresh}
              onClick={(e) => {
                e.stopPropagation()
                onToggleAutoRefreshMenu()
              }}
            />
            {showAutoRefreshMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm shadow-2xl p-1 animate-in fade-in-0 zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Auto-refresh
                </div>
                <button
                  onClick={() => {
                    onAutoRefreshChange(!autoRefresh)
                    onToggleAutoRefreshMenu()
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors"
                >
                  <span>{autoRefresh ? 'Disable' : 'Enable'}</span>
                  {autoRefresh && <span className="text-primary text-[10px] font-semibold">ON</span>}
                </button>
                <div className="border-t border-border/50 my-1 -mx-1" />
                <div className="px-2.5 py-1 text-[10px] text-muted-foreground">Interval (seconds)</div>
                <div className="flex gap-1 px-2 py-1">
                  {[3, 5, 10, 15, 30].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onAutoRefreshSecChange(s)
                        if (!autoRefresh) onAutoRefreshChange(true)
                        onToggleAutoRefreshMenu()
                      }}
                      className={cn(
                        'flex-1 py-1 text-[10px] rounded-md transition-colors',
                        autoRefreshSec === s && autoRefresh
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                      )}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
                <div className="px-2 py-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={refreshSecDraft}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '')
                      setRefreshSecDraft(raw)
                      if (raw === '') return
                      const v = parseInt(raw, 10)
                      if (v >= 1 && v <= 300) onAutoRefreshSecChange(v)
                    }}
                    onBlur={() => {
                      if (refreshSecDraft.trim() === '') {
                        setRefreshSecDraft('3')
                        onAutoRefreshSecChange(3)
                      }
                    }}
                    className="flex-1 h-6 px-1.5 text-[10px] font-mono rounded-md border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary/50 w-12"
                  />
                  <button
                    onClick={() => {
                      const parsed = parseInt(refreshSecDraft, 10)
                      const v = refreshSecDraft.trim() === '' || !Number.isFinite(parsed) ? 3 : Math.min(300, Math.max(1, parsed))
                      setRefreshSecDraft(String(v))
                      onAutoRefreshSecChange(v)
                      if (!autoRefresh) onAutoRefreshChange(true)
                      onToggleAutoRefreshMenu()
                    }}
                    className="h-6 px-2 text-[10px] rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <IconAction icon={Unplug} label="Disconnect from MySQL" destructive onClick={onDisconnect} />
        </div>
      </div>

      {/* Filter */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter databases & tables…"
            className="w-full h-7 pl-8 pr-7 text-xs rounded-lg border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Clear filter"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree — plain overflow so row counts reflow when the sidebar is resized */}
      <div
        className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        onContextMenu={onPaneContextMenu}
      >
        <div className="p-1.5 space-y-0.5 w-full min-w-0" onContextMenu={onPaneContextMenu}>
          {noResults ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <SearchX className="w-6 h-6 opacity-40" />
              <p className="text-xs">No databases or loaded tables match</p>
            </div>
          ) : (
            <>
              {userDbs.map((v) => renderDb(v, false))}
              {systemDbs.length > 0 && (
                <>
                  {userDbs.length > 0 && (
                    <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">System</span>
                      <div className="flex-1 border-t border-border/40" />
                    </div>
                  )}
                  {systemDbs.map((v) => renderDb(v, true))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/50 shrink-0 bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="truncate font-mono">{host}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {readOnly && (
              <span className="text-[9px] text-amber-500 flex items-center gap-0.5" title="Read-only mode">
                <Lock className="w-2.5 h-2.5" />
                R/O
              </span>
            )}
            {autoRefresh && (
              <span className="text-[9px] text-primary flex items-center gap-1" title="Auto-refresh interval">
                <Timer className="w-2.5 h-2.5" />
                {autoRefreshSec}s
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
