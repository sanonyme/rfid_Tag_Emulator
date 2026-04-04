import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  formatSftpSize,
  formatSftpMtime,
  formatUnixMode,
} from './sftp-column-format'
import type { SftpSortKey } from './SftpFileTree'
import { SFTP_DND_MIME } from './SftpFileTree'

export const LOCAL_DND_MIME = 'application/x-rfid-local-node'

const col = {
  size: 'w-[4.75rem] min-w-[4.75rem] shrink-0 text-right tabular-nums',
  changed: 'w-[10.5rem] min-w-[10.5rem] shrink-0 truncate',
  rights: 'w-[6.75rem] min-w-[6.75rem] shrink-0 truncate font-mono',
}

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
  className,
}: LocalDirListProps) {
  const [hoverPath, setHoverPath] = useState<string | null>(null)
  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir, foldersFirst),
    [rows, sortKey, sortDir, foldersFirst],
  )

  const headerBtn = (label: string, key: SftpSortKey, extraClass?: string) => (
    <button
      type="button"
      onClick={() => onSortChange(key)}
      className={cn(
        extraClass,
        'text-left rounded px-0.5 hover:text-foreground hover:bg-accent/40 transition-colors text-[10px] sm:text-xs font-semibold uppercase tracking-wide',
        sortKey === key && 'text-primary',
      )}
    >
      {label}
      {sortKey === key && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )

  return (
    <div
      className={cn(
        'bg-fileTree-bg rounded-lg border border-border/50 p-3 font-mono min-h-[200px] min-w-0 flex flex-col',
        dropHighlight && 'ring-2 ring-primary/50',
        className,
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDropToPath(cwd, e)
      }}
    >
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
      <div className="flex w-full min-w-0 items-center gap-1.5 border-b border-border/40 pb-1.5 mb-1 text-muted-foreground shrink-0">
        {headerBtn('Name', 'name', 'min-w-0 flex-1 pl-2')}
        {headerBtn('Size', 'size', col.size)}
        {headerBtn('Changed', 'mtime', col.changed)}
        {headerBtn('Rights', 'mode', col.rights)}
      </div>
      <div className="space-y-0.5 min-w-0 overflow-y-auto flex-1 min-h-0">
        {canGoUp && (
          <button
            type="button"
            onClick={onGoUp}
            className="flex w-full min-w-0 items-center gap-1.5 py-1 px-2 rounded-md text-left text-sm font-mono text-muted-foreground hover:bg-fileTree-hover hover:text-foreground"
          >
            <span className="pl-2">..</span>
            <span className="flex-1" />
            <div className={col.size} />
            <div className={col.changed} />
            <div className={col.rights} />
          </button>
        )}
        {sorted.map((row) => {
          const isFolder = row.type === 'folder'
          const sel = selectedPath === row.path
          return (
            <div
              key={row.path}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => onLocalDragStart(row, e)}
              onDragOver={(e) => {
                if (isFolder) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = e.dataTransfer.types.includes(SFTP_DND_MIME)
                    ? 'copy'
                    : 'copy'
                  setHoverPath(row.path)
                }
              }}
              onDragLeave={() => setHoverPath(null)}
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
                'flex w-full min-w-0 items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer outline-none',
                'focus-visible:ring-2 focus-visible:ring-primary/30',
                sel && 'ring-1 ring-primary/40 bg-primary/5',
                hoverPath === row.path && isFolder && 'ring-2 ring-primary/40 bg-primary/10',
              )}
            >
              <span className="pl-2 font-mono text-sm min-w-0 flex-1 truncate text-left">
                {isFolder ? '📁 ' : ''}
                {row.name}
              </span>
              <div className={cn(col.size, 'text-muted-foreground text-right')}>
                {formatSftpSize(row.sizeBytes, isFolder)}
              </div>
              <div className={cn(col.changed, 'text-muted-foreground')}>
                {formatSftpMtime(row.mtimeSec)}
              </div>
              <div className={cn(col.rights, 'text-muted-foreground font-mono')}>
                {formatUnixMode(row.mode)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
