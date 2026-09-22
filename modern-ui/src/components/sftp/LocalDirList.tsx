import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { GitCompare, UploadCloud } from 'lucide-react'
import {
  formatSftpSize,
  formatSftpMtime,
  formatUnixMode,
} from './sftp-column-format'
import type { SftpSortKey } from './SftpFileTree'
import { SFTP_DND_MIME } from './SftpFileTree'
import {
  sftpColumnGridStyle,
  sftpVisibleColOrder,
  useSftpColumnWidths,
  type SftpColKey,
} from './sftp-column-widths'

export const LOCAL_DND_MIME = 'application/x-rfid-local-node'

export interface LocalEntryRow {
  name: string
  path: string
  type: 'file' | 'folder'
  sizeBytes?: number
  mtimeSec?: number
  mode?: number
}

function sortRows(
  rows: LocalEntryRow[],
  sortKey: SftpSortKey,
  sortDir: 'asc' | 'desc',
  foldersFirst: boolean,
): LocalEntryRow[] {
  const mul = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (foldersFirst && a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1
    }
    let c = 0
    switch (sortKey) {
      case 'name':
        c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        break
      case 'size':
        c = (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)
        break
      case 'mtime':
        c = (a.mtimeSec ?? 0) - (b.mtimeSec ?? 0)
        break
      case 'mode':
        c = (a.mode ?? 0) - (b.mode ?? 0)
        break
      default:
        c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    return c * mul
  })
}

interface LocalDirListProps {
  rows: LocalEntryRow[]
  cwd: string
  canGoUp: boolean
  selectedPath: string | null
  onSelect: (row: LocalEntryRow) => void
  onOpenFolder: (row: LocalEntryRow) => void
  onGoUp: () => void
  sortKey: SftpSortKey
  sortDir: 'asc' | 'desc'
  foldersFirst: boolean
  onSortChange: (key: SftpSortKey) => void
  dropHighlight: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  /** Drop remote (or OS) files into this local directory. */
  onDropToPath: (localDirPath: string, e: React.DragEvent) => void
  onLocalDragStart: (row: LocalEntryRow, e: React.DragEvent) => void
  onDiffWithRemote?: (row: LocalEntryRow) => void
  className?: string
}

export function LocalDirList({
  rows,
  cwd,
  canGoUp,
  selectedPath,
  onSelect,
  onOpenFolder,
  onGoUp,
  sortKey,
  sortDir,
  foldersFirst,
  onSortChange,
  dropHighlight,
  onDragOver,
  onDragLeave,
  onDropToPath,
  onLocalDragStart,
  onDiffWithRemote,
  className,
}: LocalDirListProps) {
  const [hoverPath, setHoverPath] = useState<string | null>(null)
  const { widths, beginResize, resetColWidth } = useSftpColumnWidths()
  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir, foldersFirst),
    [rows, sortKey, sortDir, foldersFirst],
  )
  const gridStyle = sftpColumnGridStyle(widths, { local: true })
  const order = sftpVisibleColOrder({ local: true })
  const neighborOf = (key: SftpColKey) => {
    const i = order.indexOf(key)
    return i >= 0 && i < order.length - 1 ? order[i + 1] : undefined
  }

  const headerBtn = (label: string, key: SftpSortKey, colKey: SftpColKey, alignRight?: boolean) => {
    const neighborKey = neighborOf(colKey)
    return (
    <div className="group/col relative min-w-0 h-full overflow-visible">
      <button
        type="button"
        onClick={() => onSortChange(key)}
        className={cn(
          'w-full truncate rounded px-1 pr-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors hover:bg-accent/40 hover:text-foreground sm:text-xs',
          alignRight ? 'text-right tabular-nums' : 'text-left',
          colKey === 'rights' && 'font-mono',
          sortKey === key && 'text-primary',
        )}
      >
        {label}
        {sortKey === key && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${colKey} column`}
        title="Drag to resize · double-click to reset"
        onPointerDown={(e) => beginResize(colKey, e, neighborKey)}
        onDoubleClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          resetColWidth(colKey, neighborKey)
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 z-20 flex w-2.5 translate-x-1/2 cursor-col-resize touch-none items-stretch justify-center"
      >
        <span
          aria-hidden
          className="pointer-events-none w-px bg-border group-hover/col:bg-primary/70"
        />
      </span>
    </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-fileTree-bg rounded-lg border border-border/50 p-3 font-mono min-h-[200px] min-w-0 flex flex-col overflow-hidden relative transition-all duration-150',
        dropHighlight && 'border-primary/70 shadow-[inset_0_0_24px_rgba(59,130,246,0.1)]',
        className,
      )}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null
        if (next && e.currentTarget.contains(next)) return
        const rect = e.currentTarget.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          return
        }
        setHoverPath(null)
        onDragLeave()
      }}
      onDrop={(e) => {
        e.preventDefault()
        setHoverPath(null)
        onDropToPath(cwd, e)
      }}
    >
      {(hoverPath || dropHighlight) && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-1 rounded-full bg-card/95 backdrop-blur-md text-foreground shadow-2xl border border-primary/40 text-xs font-medium animate-in fade-in zoom-in-95 duration-150">
          <UploadCloud className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
          <span className="truncate max-w-[280px]">
            Save target: <strong className="font-semibold text-primary">{hoverPath ? `/${rows.find((r) => r.path === hoverPath)?.name || hoverPath}` : cwd}</strong>
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-violet-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-fuchsia-500/80" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">Local</span>
      </div>
      <p className="text-[10px] text-muted-foreground truncate mb-2 shrink-0" title={cwd}>
        {cwd}
      </p>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (hoverPath) {
            setHoverPath(null)
          }
        }}
      >
      <div
        className="sticky top-0 z-10 bg-fileTree-bg border-b border-border/40 pb-1.5 mb-1 px-2 text-muted-foreground"
        style={gridStyle}
      >
        {headerBtn('Name', 'name', 'name')}
        {headerBtn('Size', 'size', 'size', true)}
        {headerBtn('Changed', 'mtime', 'changed')}
        {headerBtn('Rights', 'mode', 'rights')}
      </div>
        {canGoUp && (
          <button
            type="button"
            onClick={onGoUp}
            className="rounded-md py-1 px-2 text-left text-sm font-mono text-muted-foreground hover:bg-fileTree-hover hover:text-foreground"
            style={gridStyle}
          >
            <span className="min-w-0 truncate pl-2">..</span>
            <div className="min-w-0" />
            <div className="min-w-0" />
            <div className="min-w-0" />
          </button>
        )}
        {sorted.map((row) => {
          const isFolder = row.type === 'folder'
          const sel = selectedPath === row.path
          const isDropTarget = hoverPath === row.path && isFolder
          return (
            <div
              key={row.path}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => onLocalDragStart(row, e)}
              onDragEnter={(e) => {
                if (!isFolder) return
                e.preventDefault()
                e.stopPropagation()
                if (hoverPath !== row.path) setHoverPath(row.path)
              }}
              onDragOver={(e) => {
                if (!isFolder) return
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = e.dataTransfer.types.includes(SFTP_DND_MIME)
                  ? 'copy'
                  : 'copy'
                if (hoverPath !== row.path) {
                  setHoverPath(row.path)
                }
              }}
              onDrop={(e) => {
                if (!isFolder) return
                e.preventDefault()
                e.stopPropagation()
                setHoverPath(null)
                onDropToPath(row.path, e)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isFolder) onOpenFolder(row)
                  else onSelect(row)
                }
              }}
              onClick={() => {
                if (isFolder) onOpenFolder(row)
                else onSelect(row)
              }}
              className={cn(
                'group cursor-pointer rounded-md py-1 px-2 outline-none hover:bg-fileTree-hover transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
                sel && 'ring-1 ring-inset ring-primary/40 bg-primary/5',
                isDropTarget &&
                  'border-l-4 border-l-primary bg-primary/20 shadow-[inset_0_0_12px_hsl(var(--primary)/0.25)] z-10 font-semibold',
              )}
              style={gridStyle}
            >
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-sm text-left pointer-events-none">
                <span className={cn('shrink-0', isDropTarget && 'scale-110 text-base')}>
                  {isFolder ? '📁 ' : ''}
                </span>
                <span className={cn('min-w-0 truncate', isDropTarget && 'text-primary font-bold')}>
                  {row.name}
                </span>
                {isDropTarget && (
                  <span className="ml-auto mr-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-primary text-primary-foreground shadow-md shrink-0 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                    <UploadCloud className="w-3 h-3 shrink-0 animate-pulse" />
                    Save here
                  </span>
                )}
                {!isFolder && onDiffWithRemote && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDiffWithRemote(row)
                    }}
                    title="Compare this local file with remote"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary/20 text-primary shrink-0 pointer-events-auto"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
              <div className="min-w-0 truncate px-1 text-right tabular-nums text-muted-foreground">
                {formatSftpSize(row.sizeBytes, isFolder)}
              </div>
              <div className="min-w-0 truncate px-1 text-muted-foreground">
                {formatSftpMtime(row.mtimeSec)}
              </div>
              <div className="min-w-0 truncate px-1 font-mono text-muted-foreground">
                {formatUnixMode(row.mode)}
              </div>
            </div>
          )
        })}
        {dropHighlight && !hoverPath && (
          <div className="mx-2 my-2 py-2.5 px-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 flex items-center justify-center gap-2 text-xs text-primary/90 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <UploadCloud className="w-3.5 h-3.5 text-primary shrink-0 animate-bounce" />
            <span>Drop files here to save to <strong>{cwd}</strong></span>
          </div>
        )}
      </div>
    </div>
  )
}
