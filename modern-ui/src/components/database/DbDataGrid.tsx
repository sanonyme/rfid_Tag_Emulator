import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  CheckSquare,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Square,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { Skeleton } from '../ui/skeleton'
import { FlippedContextMenu, MenuItem, MenuSeparator } from './DbSurfaces'
import type { SortDir } from './db-tab-shared'

interface CellCtx {
  x: number
  y: number
  row: any
  rowIdx: number
  col: string
}

export interface DbDataGridProps {
  columns: string[]
  rows: any[]
  columnTypes: Record<string, string>
  primaryKeys: string[]
  pageStart: number
  loading: boolean
  canEdit: boolean
  tableSearch: string
  sortColumn: string | null
  sortDir: SortDir
  onSort: (col: string) => void
  selectedRowIdxs: Set<number>
  onToggleRowSelect: (idx: number) => void
  onToggleSelectAll: () => void
  editingCell: { rowIdx: number; col: string } | null
  editValue: string
  editSaving: boolean
  onStartEdit: (row: any, rowIdx: number, col: string, currentValue: any) => void
  onEditValueChange: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDeleteRow: (row: any, idx: number) => void
}

function GridSkeleton({ columns }: { columns: string[] }) {
  const colCount = Math.max(4, Math.min(columns.length || 5, 8))
  return (
    <div className="flex-1 overflow-hidden px-3 py-2 space-y-1.5" aria-busy>
      <div className="flex gap-2 pb-1.5">
        {Array.from({ length: colCount }).map((_, i) => (
          <Skeleton key={i} className="h-5 flex-1 rounded-md opacity-80" />
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, r) => (
        <div key={r} className="flex gap-2" style={{ opacity: Math.max(0.25, 1 - r * 0.08) }}>
          {Array.from({ length: colCount }).map((_, c) => (
            <Skeleton key={c} className="h-6 flex-1 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function DbDataGrid({
  columns,
  rows,
  columnTypes,
  primaryKeys,
  pageStart,
  loading,
  canEdit,
  tableSearch,
  sortColumn,
  sortDir,
  onSort,
  selectedRowIdxs,
  onToggleRowSelect,
  onToggleSelectAll,
  editingCell,
  editValue,
  editSaving,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
  onDeleteRow,
}: DbDataGridProps) {
  const [cellCtx, setCellCtx] = useState<CellCtx | null>(null)

  useEffect(() => {
    if (!cellCtx) return
    const close = () => setCellCtx(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [cellCtx])

  if (loading) return <GridSkeleton columns={columns} />

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const hasSelectCol = primaryKeys.length > 0
  const pkSet = new Set(primaryKeys)

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted/90 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border))]">
            {hasSelectCol && (
              <th className="px-2 py-2 w-8">
                <button
                  onClick={onToggleSelectAll}
                  className="text-muted-foreground hover:text-foreground transition-colors align-middle"
                  title={selectedRowIdxs.size === rows.length && rows.length > 0 ? 'Deselect all' : 'Select all rows on page'}
                >
                  {selectedRowIdxs.size === rows.length && rows.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                </button>
              </th>
            )}
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-12">#</th>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => onSort(col)}
                className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground hover:bg-accent/40 transition-colors select-none"
                title="Click to sort"
              >
                <span className="flex items-center gap-1">
                  {pkSet.has(col) && <KeyRound className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                  {col}
                  {sortColumn === col && sortDir === 'asc' && <ArrowUp className="w-3 h-3 text-primary" />}
                  {sortColumn === col && sortDir === 'desc' && <ArrowDown className="w-3 h-3 text-primary" />}
                </span>
                {columnTypes[col] && (
                  <span className="block text-[9px] font-normal text-muted-foreground/50 mt-0.5">{columnTypes[col]}</span>
                )}
              </th>
            ))}
            {canEdit && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'db-data-row border-b border-border/30 hover:bg-accent/30 group transition-colors',
                selectedRowIdxs.has(i) && 'bg-primary/10 hover:bg-primary/15',
              )}
            >
              {hasSelectCol && (
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => onToggleRowSelect(i)}
                    className="text-muted-foreground hover:text-foreground transition-colors align-middle"
                  >
                    {selectedRowIdxs.has(i) ? (
                      <CheckSquare className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </td>
              )}
              <td className="px-3 py-1.5 text-xs text-muted-foreground/70 tabular-nums">{pageStart + i}</td>
              {columns.map((col) => {
                const isEditing = editingCell?.rowIdx === i && editingCell?.col === col
                return (
                  <td
                    key={col}
                    className={cn(
                      'px-3 py-1.5 font-mono text-xs max-w-[300px] relative',
                      isEditing ? 'p-0' : 'truncate',
                      canEdit && !isEditing && 'cursor-pointer',
                    )}
                    title={isEditing ? undefined : String(row[col] ?? 'NULL')}
                    onDoubleClick={() => !isEditing && onStartEdit(row, i, col, row[col])}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setCellCtx({ x: e.clientX, y: e.clientY, row, rowIdx: i, col })
                    }}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-0">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => onEditValueChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveEdit()
                            if (e.key === 'Escape') onCancelEdit()
                            if (e.key === 'Tab') {
                              e.preventDefault()
                              onSaveEdit()
                            }
                          }}
                          disabled={editSaving}
                          className="w-full px-2 py-1 text-xs font-mono bg-background border border-primary/50 rounded-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button
                          onClick={() => onEditValueChange('')}
                          className="p-1 text-amber-500 hover:bg-amber-500/10 rounded-sm shrink-0"
                          title="Set NULL"
                        >
                          <span className="text-[9px] font-bold">∅</span>
                        </button>
                        <button
                          onClick={onSaveEdit}
                          disabled={editSaving}
                          className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-sm shrink-0"
                          title="Save (Enter)"
                        >
                          {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={onCancelEdit}
                          className="p-1 text-muted-foreground hover:bg-accent rounded-sm shrink-0"
                          title="Cancel (Esc)"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className={cn(row[col] === null && 'text-muted-foreground/50 italic')}>
                        {row[col] === null ? 'NULL' : String(row[col])}
                      </span>
                    )}
                  </td>
                )
              })}
              {canEdit && (
                <td className="px-1 py-1.5">
                  <button
                    onClick={() => onDeleteRow(row, i)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Delete row"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1 + (hasSelectCol ? 1 : 0) + (canEdit ? 1 : 0)}
                className="px-4 py-12"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Table2 className="w-8 h-8 opacity-20" />
                  <span className="text-sm">{tableSearch ? 'No rows match your filter' : 'Table is empty'}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {cellCtx && createPortal(
        <FlippedContextMenu x={cellCtx.x} y={cellCtx.y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={Copy}
            onClick={() => {
              setCellCtx(null)
              void copyText(cellCtx.row[cellCtx.col] === null ? 'NULL' : String(cellCtx.row[cellCtx.col]), 'Value')
            }}
          >
            Copy value
          </MenuItem>
          <MenuItem
            icon={Braces}
            onClick={() => {
              setCellCtx(null)
              const obj: Record<string, any> = {}
              columns.forEach((c) => { obj[c] = cellCtx.row[c] })
              void copyText(JSON.stringify(obj, null, 2), 'Row JSON')
            }}
          >
            Copy row as JSON
          </MenuItem>
          {canEdit && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={Pencil}
                onClick={() => {
                  setCellCtx(null)
                  onStartEdit(cellCtx.row, cellCtx.rowIdx, cellCtx.col, cellCtx.row[cellCtx.col])
                }}
              >
                Edit cell
              </MenuItem>
              <MenuItem
                icon={Trash2}
                destructive
                onClick={() => {
                  setCellCtx(null)
                  onDeleteRow(cellCtx.row, cellCtx.rowIdx)
                }}
              >
                Delete row…
              </MenuItem>
            </>
          )}
        </FlippedContextMenu>,
        document.body,
      )}
    </div>
  )
}
