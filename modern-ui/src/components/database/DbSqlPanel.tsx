import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Download,
  FileSearch,
  History,
  Loader2,
  Package,
  Play,
  Plus,
  Search,
  Wand2,
  X,
} from 'lucide-react'
import { PortaledAnchoredMenu } from '../ui/portaled-anchored-menu'
import { IconAction, ToolbarSep } from './DbSurfaces'
import type { QueryHistoryEntry, QueryTab } from './db-tab-shared'
import { BUILTIN_QUERIES, type BuiltinQueryId } from './db-builtin-queries'

export interface DbSqlPanelProps {
  height: number
  collapsed: boolean
  onToggleCollapsed: () => void
  editorRef: RefObject<HTMLDivElement>
  queryTabs: QueryTab[]
  activeTabId: string
  onSwitchTab: (id: string) => void
  onAddTab: () => void
  onRemoveTab: (id: string) => void
  selectedDb: string
  queryTime: number
  queryRunning: boolean
  showQueryResults: boolean
  queryColumns: string[]
  queryRows: any[]
  queryMessage: string
  queryError: string
  queryHistory: QueryHistoryEntry[]
  showHistory: boolean
  historyBtnRef: RefObject<HTMLButtonElement>
  onToggleHistory: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onClearHistory: () => void
  onPickHistory: (sql: string) => void
  showBuiltinQueries: boolean
  builtinBtnRef: RefObject<HTMLButtonElement>
  onToggleBuiltinQueries: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onPickBuiltinQuery: (id: BuiltinQueryId) => void
  packingOpen: boolean
  onOpenPackingLookup: () => void
  onExportResultsCsv: () => void
  onClearResults: () => void
  onPrettify: () => void
  onExplain: () => void
  onRun: () => void
}

export function DbSqlPanel({
  height,
  collapsed,
  onToggleCollapsed,
  editorRef,
  queryTabs,
  activeTabId,
  onSwitchTab,
  onAddTab,
  onRemoveTab,
  selectedDb,
  queryTime,
  queryRunning,
  showQueryResults,
  queryColumns,
  queryRows,
  queryMessage,
  queryError,
  queryHistory,
  showHistory,
  historyBtnRef,
  onToggleHistory,
  onClearHistory,
  onPickHistory,
  showBuiltinQueries,
  builtinBtnRef,
  onToggleBuiltinQueries,
  onPickBuiltinQuery,
  packingOpen,
  onOpenPackingLookup,
  onExportResultsCsv,
  onClearResults,
  onPrettify,
  onExplain,
  onRun,
}: DbSqlPanelProps) {
  const showResultGrid = showQueryResults && queryColumns.length > 0
  const showResultBanner = showQueryResults && (queryError || (queryMessage && queryColumns.length === 0))
  const activeTab = queryTabs.find((t) => t.id === activeTabId)

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col border border-border/40 rounded-xl bg-card/60 ring-1 ring-border/20 overflow-hidden',
        collapsed && 'h-auto',
      )}
      style={collapsed ? undefined : { height }}
      data-tour="tour-db-sql-panel"
    >
      {/* Tab strip + toolbar */}
      <div className="flex items-center border-b border-border/50 shrink-0 bg-muted/25">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent/40 transition-colors min-w-0"
            title="Expand SQL panel"
          >
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground shrink-0">SQL</span>
            {activeTab && (
              <span className="text-muted-foreground truncate font-mono">{activeTab.name}</span>
            )}
            {selectedDb && (
              <span className="text-[11px] text-muted-foreground bg-muted/60 ring-1 ring-border/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ml-auto">
                <Database className="w-2.5 h-2.5 text-amber-500" />
                {selectedDb}
              </span>
            )}
          </button>
        ) : (
          <div className="flex-1 flex items-center overflow-x-auto min-w-0">
            {queryTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSwitchTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-border/30 shrink-0 transition-colors',
                  activeTabId === tab.id
                    ? 'bg-background/90 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                )}
              >
                <span>{tab.name}</span>
                {queryTabs.length > 1 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveTab(tab.id)
                    }}
                    className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
                {activeTabId === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
            ))}
            <button
              onClick={onAddTab}
              className="flex items-center justify-center w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              title="New query tab"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 px-2 shrink-0">
          {!collapsed && (
            <>
              {queryTime > 0 && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 tabular-nums mr-1">
                  <Clock className="w-3 h-3" />
                  {queryTime}ms
                </span>
              )}
              {selectedDb && (
                <span className="text-[11px] text-muted-foreground bg-muted/60 ring-1 ring-border/30 px-2 py-0.5 rounded-full flex items-center gap-1 mr-1">
                  <Database className="w-2.5 h-2.5 text-amber-500" />
                  {selectedDb}
                </span>
              )}

              <IconAction
                icon={Search}
                label="Built-in lookups"
                active={showBuiltinQueries}
                buttonRef={builtinBtnRef}
                onClick={onToggleBuiltinQueries}
              />
              <IconAction
                icon={Package}
                label="Order / carton packing list"
                active={packingOpen}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenPackingLookup()
                }}
              />
              <PortaledAnchoredMenu
                anchorRef={builtinBtnRef}
                open={showBuiltinQueries}
                className="w-80 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 border-b border-border/50 bg-popover/95 px-3 py-2 text-xs font-medium backdrop-blur-sm">
                  Built-in lookups
                </div>
                {BUILTIN_QUERIES.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onPickBuiltinQuery(q.id)}
                    className="w-full border-b border-border/30 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/50"
                  >
                    <div className="text-xs font-medium">{q.label}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{q.description}</div>
                  </button>
                ))}
              </PortaledAnchoredMenu>

              <IconAction
                icon={History}
                label="Query history"
                active={showHistory}
                buttonRef={historyBtnRef}
                onClick={onToggleHistory}
              />
              <PortaledAnchoredMenu
                anchorRef={historyBtnRef}
                open={showHistory}
                className="w-80 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-border/50 text-xs font-medium flex items-center justify-between sticky top-0 bg-popover/95 backdrop-blur-sm">
                  <span>Query History</span>
                  {queryHistory.length > 0 && (
                    <button
                      onClick={onClearHistory}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {queryHistory.length === 0 ? (
                  <div className="px-3 py-5 text-xs text-muted-foreground text-center">No queries yet</div>
                ) : (
                  queryHistory.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => onPickHistory(h.sql)}
                      className="w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                    >
                      <div className="text-[11px] font-mono truncate">{h.sql}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>{new Date(h.timestamp).toLocaleString()}</span>
                        {h.database && <span className="bg-muted/60 px-1 rounded">{h.database}</span>}
                      </div>
                    </button>
                  ))
                )}
              </PortaledAnchoredMenu>

              {showResultGrid && (
                <IconAction icon={Download} label="Export results as CSV" onClick={onExportResultsCsv} />
              )}
              {showQueryResults && <IconAction icon={X} label="Clear results" onClick={onClearResults} />}
              <IconAction icon={Wand2} label="Prettify SQL" onClick={onPrettify} />
              <IconAction icon={FileSearch} label="Explain query (EXPLAIN …)" disabled={queryRunning} onClick={onExplain} />
              <ToolbarSep />
              <Button size="sm" className="h-6 gap-1.5 px-2.5 text-[11px]" onClick={onRun} disabled={queryRunning}>
                {queryRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Run
                <kbd className="text-[9px] opacity-60 hidden sm:inline">Ctrl+↵</kbd>
              </Button>
              <ToolbarSep />
            </>
          )}
          <IconAction
            icon={collapsed ? ChevronUp : ChevronDown}
            label={collapsed ? 'Expand SQL panel' : 'Collapse SQL panel'}
            onClick={onToggleCollapsed}
          />
        </div>
      </div>

      {/* Editor + results — keep mounted when collapsed so CodeMirror survives */}
      <div className={cn('flex-1 min-h-0 flex flex-col', collapsed && 'hidden')}>
        <div
          ref={editorRef}
          className={cn(
            'overflow-hidden border-b border-border/30 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none min-h-[5rem]',
            showResultGrid ? 'flex-[2] min-h-0 shrink' : 'flex-1 min-h-0',
          )}
        />
        {showResultBanner &&
          (queryError ? (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-destructive text-sm bg-destructive/5 border-t border-destructive/10">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-mono text-xs break-all">{queryError}</span>
            </div>
          ) : (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-500/5 border-t border-emerald-500/10">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-mono text-xs">{queryMessage}</span>
            </div>
          ))}
        {showResultGrid && (
          <div className="flex-[3] min-h-0 flex flex-col">
            <div className="px-4 py-1.5 border-b border-border/30 bg-muted/40 text-xs text-muted-foreground shrink-0 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              {queryMessage}
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/90 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border))]">
                    {queryColumns.map((col) => (
                      <th key={col} className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
                      {queryColumns.map((col) => (
                        <td key={col} className="px-3 py-1 font-mono text-xs max-w-[300px] truncate">
                          {row[col] === null || row[col] === undefined ? (
                            <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium italic tracking-wide text-muted-foreground/70 bg-muted/50 ring-1 ring-border/40">
                              NULL
                            </span>
                          ) : (
                            String(row[col])
                          )}
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
  )
}
