import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  formatSftpSize,
  formatSftpMtime,
  formatUnixMode,
  formatSftpOwner,
} from './sftp-column-format'

export const SFTP_DND_MIME = 'application/x-rfid-sftp-node'

export type SftpSortKey = 'name' | 'size' | 'mtime' | 'mode' | 'owner'

export interface SftpFileNode {
  path: string
  name: string
  type: 'file' | 'folder'
  children?: SftpFileNode[]
  loaded?: boolean
  loading?: boolean
  extension?: string
  sizeBytes?: number
  mtimeSec?: number
  mode?: number
  uid?: number
  gid?: number
}

/** Fixed meta column widths so Name flexes and values align (WinSCP-style). */
const col = {
  size: 'w-[4.75rem] min-w-[4.75rem] shrink-0 text-right tabular-nums',
  changed: 'w-[10.5rem] min-w-[10.5rem] shrink-0 truncate',
  rights: 'w-[6.75rem] min-w-[6.75rem] shrink-0 truncate font-mono',
  owner: 'w-[4.75rem] min-w-[4.75rem] shrink-0 truncate',
}

function sortChildren(
  nodes: SftpFileNode[],
  sortKey: SftpSortKey,
  sortDir: 'asc' | 'desc',
  foldersFirst: boolean,
): SftpFileNode[] {
  const mul = sortDir === 'asc' ? 1 : -1
  return [...nodes].sort((a, b) => {
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
      case 'owner':
        c = String(a.uid ?? '').localeCompare(String(b.uid ?? ''))
        if (c === 0) c = String(a.gid ?? '').localeCompare(String(b.gid ?? ''))
        break
    }
    return c * mul
  })
}

interface SftpFileTreeProps {
  data: SftpFileNode[]
  className?: string
  title?: string
  selectedPath: string | null
  selectMode: boolean
  selectedPaths: ReadonlySet<string>
  onTogglePath: (path: string) => void
  onSelect: (node: SftpFileNode) => void
  onToggleFolder: (node: SftpFileNode) => void
  dropHighlightPath: string | null
  onFolderDragOver: (path: string | null) => void
  onFolderDrop: (targetDir: string, e: React.DragEvent) => void
  onNodeDragStart: (node: SftpFileNode, e: React.DragEvent) => void
  onNodeContextMenu?: (node: SftpFileNode, e: React.MouseEvent) => void
  sortKey: SftpSortKey
  sortDir: 'asc' | 'desc'
  foldersFirst: boolean
  onSortChange: (key: SftpSortKey) => void
  expandedPaths: ReadonlySet<string>
  onRequestCollapse: (path: string) => void
}

interface FileItemProps {
  node: SftpFileNode
  depth: number
  isLast: boolean
  selectedPath: string | null
  selectMode: boolean
  selectedPaths: ReadonlySet<string>
  onTogglePath: (path: string) => void
  onSelect: (node: SftpFileNode) => void
  onToggleFolder: (node: SftpFileNode) => void
  dropHighlightPath: string | null
  onFolderDragOver: (path: string | null) => void
  onFolderDrop: (targetDir: string, e: React.DragEvent) => void
  onNodeDragStart: (node: SftpFileNode, e: React.DragEvent) => void
  onNodeContextMenu?: (node: SftpFileNode, e: React.MouseEvent) => void
  sortKey: SftpSortKey
  sortDir: 'asc' | 'desc'
  foldersFirst: boolean
  expandedPaths: ReadonlySet<string>
  onRequestCollapse: (path: string) => void
}

const getFileIcon = (extension?: string) => {
  const iconMap: Record<string, { color: string; icon: string }> = {
    tsx: { color: 'text-sky-600 dark:text-sky-400', icon: '⚛' },
    ts: { color: 'text-blue-600 dark:text-blue-400', icon: '◆' },
    jsx: { color: 'text-cyan-600 dark:text-cyan-400', icon: '⚛' },
    js: { color: 'text-amber-600 dark:text-amber-400', icon: '◆' },
    css: { color: 'text-violet-600 dark:text-violet-400', icon: '◈' },
    json: { color: 'text-amber-700 dark:text-amber-300', icon: '{}' },
    md: { color: 'text-muted-foreground', icon: '◊' },
    svg: { color: 'text-emerald-600 dark:text-emerald-400', icon: '◐' },
    png: { color: 'text-teal-600 dark:text-teal-400', icon: '◑' },
    default: { color: 'text-muted-foreground', icon: '◇' },
  }
  return iconMap[extension || 'default'] || iconMap.default
}

function MetaCells({ node }: { node: SftpFileNode }) {
  const isFolder = node.type === 'folder'
  return (
    <>
      <div className={cn(col.size, 'text-muted-foreground')} title={String(node.sizeBytes ?? '')}>
        {formatSftpSize(node.sizeBytes, isFolder)}
      </div>
      <div className={cn(col.changed, 'text-muted-foreground')} title={formatSftpMtime(node.mtimeSec)}>
        {formatSftpMtime(node.mtimeSec)}
      </div>
      <div className={cn(col.rights, 'text-muted-foreground')} title={formatUnixMode(node.mode)}>
        {formatUnixMode(node.mode)}
      </div>
      <div
        className={cn(col.owner, 'text-muted-foreground')}
        title={formatSftpOwner(node.uid, node.gid)}
      >
        {formatSftpOwner(node.uid, node.gid)}
      </div>
    </>
  )
}

function EmptyMetaCells() {
  return (
    <>
      <div className={col.size} />
      <div className={col.changed} />
      <div className={col.rights} />
      <div className={col.owner} />
    </>
  )
}

function HeaderCell({
  label,
  active,
  sortDir,
  align,
  onClick,
}: {
  label: string
  active: boolean
  sortDir: 'asc' | 'desc'
  align?: 'right'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        align === 'right' ? col.size : '',
        align !== 'right' && label === 'Name' && 'min-w-0 flex-1 pl-2 text-left',
        align !== 'right' && label !== 'Name' && col[label === 'Changed' ? 'changed' : label === 'Rights' ? 'rights' : 'owner'],
        'rounded px-0.5 hover:text-foreground hover:bg-accent/40 transition-colors',
        align === 'right' && 'text-right',
        active && 'text-primary',
      )}
    >
      {label}
      {active && <span className="ml-0.5 tabular-nums">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )
}

function ColumnHeaderRow({
  selectMode,
  sortKey,
  sortDir,
  onSortChange,
}: {
  selectMode: boolean
  sortKey: SftpSortKey
  sortDir: 'asc' | 'desc'
  onSortChange: (key: SftpSortKey) => void
}) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 border-b border-border/40 pb-1.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
        'sm:text-xs',
      )}
    >
      {selectMode && <div className="w-3.5 shrink-0" aria-hidden />}
      <HeaderCell
        label="Name"
        active={sortKey === 'name'}
        sortDir={sortDir}
        onClick={() => onSortChange('name')}
      />
      <HeaderCell
        label="Size"
        active={sortKey === 'size'}
        sortDir={sortDir}
        align="right"
        onClick={() => onSortChange('size')}
      />
      <button
        type="button"
        onClick={() => onSortChange('mtime')}
        className={cn(
          col.changed,
          'text-left rounded px-0.5 hover:text-foreground hover:bg-accent/40 transition-colors',
          sortKey === 'mtime' && 'text-primary',
        )}
      >
        Changed
        {sortKey === 'mtime' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
      <button
        type="button"
        onClick={() => onSortChange('mode')}
        className={cn(
          col.rights,
          'text-left rounded px-0.5 hover:text-foreground hover:bg-accent/40 transition-colors font-mono',
          sortKey === 'mode' && 'text-primary',
        )}
      >
        Rights
        {sortKey === 'mode' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
      <button
        type="button"
        onClick={() => onSortChange('owner')}
        className={cn(
          col.owner,
          'text-left rounded px-0.5 hover:text-foreground hover:bg-accent/40 transition-colors',
          sortKey === 'owner' && 'text-primary',
        )}
      >
        Owner
        {sortKey === 'owner' && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </div>
  )
}

function FileItem({
  node,
  depth,
  isLast: _isLast,
  selectedPath,
  selectMode,
  selectedPaths,
  onTogglePath,
  onSelect,
  onToggleFolder,
  dropHighlightPath,
  onFolderDragOver,
  onFolderDrop,
  onNodeDragStart,
  onNodeContextMenu,
  sortKey,
  sortDir,
  foldersFirst,
  expandedPaths,
  onRequestCollapse,
}: FileItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  const isFolder = node.type === 'folder'
  const isOpen = expandedPaths.has(node.path)
  const childList = useMemo(
    () => sortChildren(node.children ?? [], sortKey, sortDir, foldersFirst),
    [node.children, sortKey, sortDir, foldersFirst],
  )
  const hasChildrenBlock = isFolder && (node.loading || childList.length > 0)
  const fileIcon = getFileIcon(node.extension)
  const isSelected = !selectMode && selectedPath === node.path
  const isInMultiSelect = selectMode && selectedPaths.has(node.path)
  const isDropTarget = isFolder && dropHighlightPath === node.path

  const namePaddingLeft = depth * 16 + 8

  const toggleFolderOpen = (e?: React.SyntheticEvent) => {
    e?.stopPropagation()
    if (!isFolder) return
    if (isOpen) {
      onRequestCollapse(node.path)
    } else {
      void onToggleFolder(node)
    }
  }

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectMode) {
      onTogglePath(node.path)
      return
    }
    if (isFolder) {
      toggleFolderOpen()
      onSelect(node)
    } else {
      onSelect(node)
    }
  }

  return (
    <div className="select-none">
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (selectMode) onTogglePath(node.path)
            else if (isFolder) {
              toggleFolderOpen()
              onSelect(node)
            } else onSelect(node)
          }
        }}
        tabIndex={0}
        draggable={!selectMode}
        onDragStart={(e) => {
          if (selectMode) {
            e.preventDefault()
            return
          }
          onNodeDragStart(node, e)
        }}
        onDragOver={(e) => {
          if (selectMode || !isFolder) return
          e.preventDefault()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          onFolderDragOver(node.path)
        }}
        onDragLeave={() => {
          if (isFolder) onFolderDragOver(null)
        }}
        onDrop={(e) => {
          if (selectMode || !isFolder) return
          e.preventDefault()
          onFolderDragOver(null)
          onFolderDrop(node.path, e)
        }}
        className={cn(
          'group flex w-full min-w-0 items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer outline-none',
          'transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary/30',
          isHovered && 'bg-fileTree-hover',
          isSelected && 'ring-1 ring-primary/40 bg-primary/5',
          isInMultiSelect && 'ring-1 ring-primary/50 bg-primary/10',
          isDropTarget && 'ring-2 ring-primary/60 bg-primary/10',
        )}
        onClick={handleRowClick}
        onContextMenu={(e) => {
          if (onNodeContextMenu) onNodeContextMenu(node, e)
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={selectedPaths.has(node.path)}
            onChange={(e) => {
              e.stopPropagation()
              onTogglePath(node.path)
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-border/50 accent-primary w-3.5 h-3.5 shrink-0 cursor-pointer"
            aria-label={`Select ${node.name}`}
          />
        )}

        <div
          className="flex min-w-0 flex-1 items-center gap-1.5"
          style={{ paddingLeft: namePaddingLeft }}
        >
          {isFolder ? (
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                'flex items-center justify-center w-4 h-4 transition-transform duration-200 ease-out shrink-0 cursor-pointer',
                isOpen ? 'rotate-90' : 'rotate-0',
              )}
              onClick={(e) => toggleFolderOpen(e)}
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
            >
              <svg
                width="6"
                height="8"
                viewBox="0 0 6 8"
                fill="none"
                className={cn(
                  'transition-colors duration-200',
                  isHovered ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <path
                  d="M1 1L5 4L1 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <div className="flex items-center justify-center w-4 h-4 shrink-0">
              <span className={cn('text-xs transition-opacity duration-200', fileIcon.color)}>
                {fileIcon.icon}
              </span>
            </div>
          )}

          <div
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded transition-all duration-200 shrink-0 text-folderIcon',
              isFolder
                ? isHovered
                  ? 'scale-110'
                  : 'opacity-90'
                : isHovered
                  ? cn(fileIcon.color, 'scale-110')
                  : cn(fileIcon.color, 'opacity-70'),
            )}
          >
            {isFolder ? (
              <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
                <path d="M1.5 1C0.671573 1 0 1.67157 0 2.5V11.5C0 12.3284 0.671573 13 1.5 13H14.5C15.3284 13 16 12.3284 16 11.5V4.5C16 3.67157 15.3284 3 14.5 3H8L6.5 1H1.5Z" />
              </svg>
            ) : (
              <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" opacity="0.8">
                <path d="M1.5 0C0.671573 0 0 0.671573 0 1.5V14.5C0 15.3284 0.671573 16 1.5 16H12.5C13.3284 16 14 15.3284 14 14.5V4.5L9.5 0H1.5Z" />
                <path d="M9 0V4.5H14" fill="currentColor" fillOpacity="0.5" />
              </svg>
            )}
          </div>

          <span
            className={cn(
              'font-mono text-sm transition-colors duration-200 min-w-0 flex-1 break-all',
              isFolder
                ? isHovered
                  ? 'text-foreground'
                  : 'text-foreground/90'
                : isHovered
                  ? 'text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {node.name}
            {isFolder && node.loading && (
              <span className="ml-2 text-xs text-muted-foreground">…</span>
            )}
          </span>
        </div>

        <MetaCells node={node} />
      </div>

      {hasChildrenBlock && (
        <div
          className={cn(
            'transition-[opacity] duration-200 ease-out',
            isOpen ? 'opacity-100 overflow-visible' : 'max-h-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          {node.loading && childList.length === 0 && (
            <div className="flex w-full items-center gap-1.5 py-1 px-2 text-xs text-muted-foreground font-mono">
              {selectMode && <div className="w-3.5 shrink-0" />}
              <div className="flex flex-1 items-center" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
                Loading…
              </div>
              <EmptyMetaCells />
            </div>
          )}
          {childList.map((child, index) => (
            <FileItem
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={index === childList.length - 1}
              selectedPath={selectedPath}
              selectMode={selectMode}
              selectedPaths={selectedPaths}
              onTogglePath={onTogglePath}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              dropHighlightPath={dropHighlightPath}
              onFolderDragOver={onFolderDragOver}
              onFolderDrop={onFolderDrop}
              onNodeDragStart={onNodeDragStart}
              onNodeContextMenu={onNodeContextMenu}
              sortKey={sortKey}
              sortDir={sortDir}
              foldersFirst={foldersFirst}
              expandedPaths={expandedPaths}
              onRequestCollapse={onRequestCollapse}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function SftpFileTree({
  data,
  className,
  title = 'Remote',
  selectedPath,
  selectMode,
  selectedPaths,
  onTogglePath,
  onSelect,
  onToggleFolder,
  dropHighlightPath,
  onFolderDragOver,
  onFolderDrop,
  onNodeDragStart,
  onNodeContextMenu,
  sortKey,
  sortDir,
  foldersFirst,
  onSortChange,
  expandedPaths,
  onRequestCollapse,
}: SftpFileTreeProps) {
  const list = useMemo(
    () => sortChildren(data ?? [], sortKey, sortDir, foldersFirst),
    [data, sortKey, sortDir, foldersFirst],
  )
  return (
    <div
      className={cn(
        'bg-fileTree-bg rounded-lg border border-border/50 p-3 font-mono min-h-[200px] min-w-0',
        className,
      )}
    >
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border/30">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">{title}</span>
      </div>

      <ColumnHeaderRow
        selectMode={selectMode}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />

      <div className="space-y-0.5 min-w-0">
        {list.map((node, index) => (
          <FileItem
            key={node.path}
            node={node}
            depth={0}
            isLast={index === list.length - 1}
            selectedPath={selectedPath}
            selectMode={selectMode}
            selectedPaths={selectedPaths}
            onTogglePath={onTogglePath}
            onSelect={onSelect}
            onToggleFolder={onToggleFolder}
            dropHighlightPath={dropHighlightPath}
            onFolderDragOver={onFolderDragOver}
            onFolderDrop={onFolderDrop}
            onNodeDragStart={onNodeDragStart}
            onNodeContextMenu={onNodeContextMenu}
            sortKey={sortKey}
            sortDir={sortDir}
            foldersFirst={foldersFirst}
            expandedPaths={expandedPaths}
            onRequestCollapse={onRequestCollapse}
          />
        ))}
      </div>
    </div>
  )
}
