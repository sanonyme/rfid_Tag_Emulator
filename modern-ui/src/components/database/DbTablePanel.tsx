import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns,
  Download,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { IconAction, MenuItem, MenuLabel, MenuSeparator, ToolbarSep } from './DbSurfaces'
import { PAGE_SIZES, type ExportFormat, type SchemaData, type TableView } from './db-tab-shared'

/* ------------------------------------------------------------------ */
/* View switcher                                                       */
/* ------------------------------------------------------------------ */

const VIEWS: { value: TableView; label: string; icon: typeof Table2; hint: string }[] = [
  { value: 'data', label: 'Data', icon: Table2, hint: 'Browse and edit rows' },
  { value: 'structure', label: 'Structure', icon: Columns, hint: 'Columns, types and keys' },
  { value: 'schema', label: 'Schema', icon: Network, hint: 'Tables and foreign keys graph' },
]

function ViewSwitcher({ view, onChange }: { view: TableView; onChange: (v: TableView) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5 ring-1 ring-border/40 shrink-0">
      {VIEWS.map(({ value, label, icon: Icon, hint }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          title={hint}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
            view === value
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="w-3 h-3" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

function ExportMenuItems({
  selectedCount,
  tableTotal,
  onExportPage,
  onExportSelected,
  onExportAll,
}: {
  selectedCount: number
  tableTotal: number
  onExportPage: (f: ExportFormat) => void
  onExportSelected: (f: ExportFormat) => void
  onExportAll: (f: ExportFormat) => void
}) {
  return (
    <>
      {selectedCount > 0 && (
        <>
          <MenuLabel>Selected ({selectedCount})</MenuLabel>
          <MenuItem onClick={() => onExportSelected('csv')}>CSV</MenuItem>
          <MenuItem onClick={() => onExportSelected('json')}>JSON</MenuItem>
          <MenuItem onClick={() => onExportSelected('sql')}>SQL INSERT</MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuLabel>Current page</MenuLabel>
      <MenuItem onClick={() => onExportPage('csv')}>CSV</MenuItem>
      <MenuItem onClick={() => onExportPage('json')}>JSON</MenuItem>
      <MenuItem onClick={() => onExportPage('sql')}>SQL INSERT</MenuItem>
      <MenuSeparator />
      <MenuLabel>All rows ({tableTotal.toLocaleString()})</MenuLabel>
      <MenuItem onClick={() => onExportAll('csv')}>Export all as CSV…</MenuItem>
      <MenuItem onClick={() => onExportAll('json')}>Export all as JSON</MenuItem>
      <MenuItem onClick={() => onExportAll('sql')}>Export all as SQL…</MenuItem>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Header toolbar                                                      */
/* ------------------------------------------------------------------ */

export interface DbTableToolbarProps {
  selectedDb: string
  selectedTable: string
  tableView: TableView
  onViewChange: (v: TableView) => void
  tableTotal: number
  hasPrimaryKey: boolean
  readOnly: boolean
  canEdit: boolean
  schemaData: SchemaData | null
  showInsertRow: boolean
  onToggleInsertRow: () => void
  onImportPick: () => void
  exporting: boolean
  showExportMenu: boolean
  onToggleExportMenu: () => void
  selectedCount: number
  onExportPage: (f: ExportFormat) => void
  onExportSelected: (f: ExportFormat) => void
  onExportAll: (f: ExportFormat) => void
  tableSearch: string
  onTableSearchChange: (v: string) => void
}

export function DbTableToolbar({
  selectedDb,
  selectedTable,
  tableView,
  onViewChange,
  tableTotal,
  hasPrimaryKey,
  readOnly,
  canEdit,
  schemaData,
  showInsertRow,
  onToggleInsertRow,
  onImportPick,
  exporting,
  showExportMenu,
  onToggleExportMenu,
  selectedCount,
  onExportPage,
  onExportSelected,
  onExportAll,
  tableSearch,
  onTableSearchChange,
}: DbTableToolbarProps) {
  const [showActionsMenu, setShowActionsMenu] = useState(false)

  useEffect(() => {
    if (!showActionsMenu) return
    const close = () => setShowActionsMenu(false)
    const timer = setTimeout(() => window.addEventListener('click', close), 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', close)
    }
  }, [showActionsMenu])

  const exportMenuProps = {
    selectedCount,
    tableTotal,
    onExportPage,
    onExportSelected,
    onExportAll,
  }

  return (
    <div className="flex items-center justify-between pl-4 pr-2.5 py-2 border-b border-border/50 shrink-0 gap-2 bg-muted/20">
      {/* Title / breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        {tableView === 'schema' ? (
          <>
            <Network className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">
              <span className="text-muted-foreground">{selectedDb}</span>
              <span className="text-muted-foreground/70"> · schema</span>
            </span>
            {schemaData && (
              <span className="text-[11px] text-muted-foreground bg-muted/60 ring-1 ring-border/30 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-flex">
                {schemaData.tables.length} tables
                {schemaData.foreignKeys.length > 0 && ` · ${schemaData.foreignKeys.length} FK`}
              </span>
            )}
          </>
        ) : (
          <>
            <Table2 className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">
              <span className="text-muted-foreground font-normal">{selectedDb}</span>
              <span className="text-muted-foreground/60 mx-0.5">/</span>
              {selectedTable}
            </span>
            <span className="text-[11px] text-muted-foreground bg-muted/60 ring-1 ring-border/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <Hash className="w-2.5 h-2.5" />
              {tableTotal.toLocaleString()}
            </span>
            {hasPrimaryKey && (
              <span
                className={cn(
                  'text-[10px] flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 ring-1 hidden md:inline-flex',
                  readOnly
                    ? 'text-amber-500 bg-amber-500/10 ring-amber-500/20'
                    : 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/20',
                )}
                title={readOnly ? 'Read-only mode is on' : 'Double-click a cell to edit'}
              >
                {readOnly ? <Lock className="w-2.5 h-2.5" /> : <Pencil className="w-2.5 h-2.5" />}
                {readOnly ? 'read-only' : 'editable'}
              </span>
            )}
            {!hasPrimaryKey && (
              <span
                className="text-[10px] flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-muted-foreground bg-muted/40 ring-1 ring-border/30 hidden md:inline-flex"
                title="No primary key — rows cannot be edited or deleted from the grid"
              >
                <KeyRound className="w-2.5 h-2.5" />
                no PK
              </span>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {tableView === 'data' && (
          <>
            {/* Wide: individual import / export buttons */}
            <div className="hidden lg:flex items-center gap-1">
              {canEdit && (
                <IconAction
                  icon={PlusCircle}
                  label="Insert row"
                  active={showInsertRow}
                  activeClassName="text-emerald-500 bg-emerald-500/10"
                  onClick={onToggleInsertRow}
                />
              )}
              <IconAction
                icon={Upload}
                label={readOnly ? 'Import (disabled in read-only mode)' : 'Import rows from CSV or JSON'}
                disabled={readOnly}
                onClick={onImportPick}
              />
              <div className="relative">
                <IconAction
                  icon={Download}
                  label="Export…"
                  spinning={exporting}
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowActionsMenu(false)
                    onToggleExportMenu()
                  }}
                />
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[190px] rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm shadow-2xl p-1 animate-in fade-in-0 zoom-in-95 duration-100">
                    <ExportMenuItems {...exportMenuProps} />
                  </div>
                )}
              </div>
            </div>

            {/* Narrow: collapse import/export into Actions */}
            <div className="relative lg:hidden">
              <IconAction
                icon={MoreHorizontal}
                label="Actions"
                spinning={exporting}
                active={showActionsMenu || showExportMenu}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowActionsMenu((v) => !v)
                }}
              />
              {showActionsMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-border/70 bg-popover/95 backdrop-blur-sm shadow-2xl p-1 animate-in fade-in-0 zoom-in-95 duration-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEdit && (
                    <MenuItem
                      icon={PlusCircle}
                      iconClassName="text-emerald-500"
                      onClick={() => {
                        setShowActionsMenu(false)
                        onToggleInsertRow()
                      }}
                    >
                      {showInsertRow ? 'Hide insert form' : 'Insert row'}
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={Upload}
                    disabled={readOnly}
                    onClick={() => {
                      setShowActionsMenu(false)
                      onImportPick()
                    }}
                  >
                    Import CSV / JSON…
                  </MenuItem>
                  <MenuSeparator />
                  <MenuLabel>Export</MenuLabel>
                  <ExportMenuItems {...exportMenuProps} />
                </div>
              )}
            </div>

            <div className="relative ml-0.5">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => onTableSearchChange(e.target.value)}
                placeholder="Search table…"
                className="h-7 pl-8 pr-6 text-[11px] rounded-lg border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary/40 w-28 sm:w-36 transition-shadow"
              />
              {tableSearch && (
                <button
                  onClick={() => onTableSearchChange('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <ToolbarSep />
          </>
        )}
        <ViewSwitcher view={tableView} onChange={onViewChange} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Insert-row form                                                     */
/* ------------------------------------------------------------------ */

export function DbInsertRowForm({
  columns,
  columnTypes,
  values,
  saving,
  onValueChange,
  onSubmit,
  onCancel,
}: {
  columns: string[]
  columnTypes: Record<string, string>
  values: Record<string, string>
  saving: boolean
  onValueChange: (col: string, v: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="px-4 py-2.5 border-b border-border/50 bg-emerald-500/5 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-medium">Insert new row</span>
        <span className="text-[10px] text-muted-foreground">— empty fields use column defaults, “NULL” inserts SQL NULL</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {columns.map((col) => (
          <div key={col} className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
              {col}
              {columnTypes[col] && <span className="text-[9px] opacity-50 truncate">({columnTypes[col]})</span>}
            </label>
            <input
              value={values[col] || ''}
              onChange={(e) => onValueChange(col, e.target.value)}
              placeholder="NULL"
              className="h-7 px-2 py-1 text-[11px] font-mono rounded-md border border-border/50 bg-background/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-2.5">
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-3" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Insert
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pagination footer                                                   */
/* ------------------------------------------------------------------ */

export function DbPaginationBar({
  tableTotal,
  pageStart,
  pageEnd,
  pageSize,
  currentPage,
  totalPages,
  onPageSizeChange,
  onPageChange,
}: {
  tableTotal: number
  pageStart: number
  pageEnd: number
  pageSize: number
  currentPage: number
  totalPages: number
  onPageSizeChange: (size: number) => void
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/50 shrink-0 bg-muted/25">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {tableTotal > 0 ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()}` : '0'} of {tableTotal.toLocaleString()}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-6 py-0.5 text-[10px] rounded-md border border-border/50 bg-background/60 px-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <IconAction icon={ChevronsLeft} label="First page" side="top" disabled={currentPage === 0} onClick={() => onPageChange(0)} />
        <IconAction icon={ChevronLeft} label="Previous page" side="top" disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)} />
        <span className="text-[11px] text-muted-foreground px-2 tabular-nums">
          {currentPage + 1} / {totalPages}
        </span>
        <IconAction icon={ChevronRight} label="Next page" side="top" disabled={currentPage >= totalPages - 1} onClick={() => onPageChange(currentPage + 1)} />
        <IconAction icon={ChevronsRight} label="Last page" side="top" disabled={currentPage >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Floating bulk-selection bar                                         */
/* ------------------------------------------------------------------ */

export function DbBulkActionBar({
  count,
  canEdit,
  onExportCsv,
  onDelete,
  onClear,
}: {
  count: number
  canEdit: boolean
  onExportCsv: () => void
  onDelete: () => void
  onClear: () => void
}) {
  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl border border-border bg-popover/95 backdrop-blur-sm shadow-2xl animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
      <span className="text-xs font-medium tabular-nums">
        {count} row{count > 1 ? 's' : ''} selected
      </span>
      <Button variant="outline" size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={onExportCsv}>
        <Download className="w-3 h-3" /> Export
      </Button>
      {canEdit && (
        <Button variant="destructive" size="sm" className="h-6 text-[11px] px-3 gap-1" onClick={onDelete}>
          <Trash2 className="w-3 h-3" /> Delete
        </Button>
      )}
      <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Clear
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty placeholder (no table picked)                                 */
/* ------------------------------------------------------------------ */

export function DbNoTablePlaceholder({ children }: { children?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="w-14 h-14 rounded-2xl bg-muted/40 ring-1 ring-border/40 flex items-center justify-center">
        <Table2 className="w-6 h-6 opacity-40" />
      </div>
      <p className="text-sm text-center max-w-xs">
        Select a table in the sidebar to browse data, inspect its structure, or map the whole schema.
      </p>
      {children}
    </div>
  )
}
