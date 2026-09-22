import { useState, useMemo, useRef, useEffect, memo, createContext, useContext, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronUp, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { flattenVisibleSftpRows } from '@/lib/sftp-tree-flatten'
import {
  formatSftpSize,
  formatSftpMtime,
  formatUnixMode,
  formatSftpOwner,
} from './sftp-column-format'
import {
  sftpColumnGridStyle,
  sftpVisibleColOrder,
  useSftpColumnWidths,
  type SftpColumnWidths,
  type SftpColKey,
} from './sftp-column-widths'

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

type ColWidthApi = {
  widths: SftpColumnWidths
  beginResize: (key: SftpColKey, e: ReactPointerEvent | ReactMouseEvent, neighborKey?: SftpColKey) => void
  resetColWidth: (key: SftpColKey, neighborKey?: SftpColKey) => void
  showUnixMeta: boolean
}

const ColWidthContext = createContext<ColWidthApi | null>(null)

function useColWidths(): ColWidthApi {
  const ctx = useContext(ColWidthContext)
  if (!ctx) throw new Error('Sftp column width context missing')
  return ctx
}

function ColResizeHandle({
  colKey,
  neighborKey,
}: {
  colKey: SftpColKey
  neighborKey?: SftpColKey
}) {
  const { beginResize, resetColWidth } = useColWidths()
  return (
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
  )
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
  onTogglePath: (path: string) => void | Promise<void>
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
  onCollapseAll?: () => void
  hideUnixMeta?: boolean
}

interface FileItemProps {
  node: SftpFileNode
  depth: number
  isLast: boolean
  selectedPath: string | null
  selectMode: boolean
  selectedPaths: ReadonlySet<string>
  onTogglePath: (path: string) => void | Promise<void>
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
  flatMode?: boolean
}

const SFTP_ROW_HEIGHT = 36
const SFTP_VIRTUAL_OVERSCAN = 10

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
  const { showUnixMeta } = useColWidths()
  const isFolder = node.type === 'folder'
  return (
    <>
      <div
        className="min-w-0 truncate px-1 text-right tabular-nums text-muted-foreground"
        title={String(node.sizeBytes ?? '')}
      >
        {formatSftpSize(node.sizeBytes, isFolder)}
      </div>
      <div
        className="min-w-0 truncate px-1 text-muted-foreground"
        title={formatSftpMtime(node.mtimeSec)}
      >
        {formatSftpMtime(node.mtimeSec)}
      </div>
      {showUnixMeta && (
        <>
          <div
            className="min-w-0 truncate px-1 font-mono text-muted-foreground"
            title={formatUnixMode(node.mode)}
          >
            {formatUnixMode(node.mode)}
          </div>
          <div
            className="min-w-0 truncate px-1 text-muted-foreground"
            title={formatSftpOwner(node.uid, node.gid)}
          >
            {formatSftpOwner(node.uid, node.gid)}
          </div>
        </>
      )}
    </>
  )
}

function EmptyMetaCells() {
  const { showUnixMeta } = useColWidths()
  return (
    <>
      <div className="min-w-0" />
      <div className="min-w-0" />
      {showUnixMeta && (
        <>
          <div className="min-w-0" />
          <div className="min-w-0" />
        </>
      )}
    </>
  )
}

function HeaderCell({
  label,
  colKey,
  neighborKey,
  active,
  sortDir,
  align,
  onClick,
}: {
  label: string
  colKey: SftpColKey
  neighborKey?: SftpColKey
  active: boolean
  sortDir: 'asc' | 'desc'
  align?: 'right'
  onClick: () => void
}) {
  return (
    <div className="group/col relative min-w-0 h-full overflow-visible">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full truncate rounded px-1 pr-2.5 transition-colors hover:bg-accent/40 hover:text-foreground',
          align === 'right' && 'text-right tabular-nums',
          align !== 'right' && 'text-left',
          colKey === 'rights' && 'font-mono',
          active && 'text-primary',
        )}
      >
        {label}
        {active && <span className="ml-0.5 tabular-nums">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
      <ColResizeHandle colKey={colKey} neighborKey={neighborKey} />
    </div>
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
  const { widths, showUnixMeta } = useColWidths()
  const order = sftpVisibleColOrder({ showUnixMeta })
  const neighborOf = (key: SftpColKey) => {
    const i = order.indexOf(key)
    return i >= 0 && i < order.length - 1 ? order[i + 1] : undefined
  }

  return (
    <div
      className="shrink-0 border-b border-border/40 pb-1.5 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
      style={sftpColumnGridStyle(widths, { selectMode, showUnixMeta })}
    >
      {selectMode && <div aria-hidden />}
      <HeaderCell
        label="Name"
        colKey="name"
        neighborKey={neighborOf('name')}
        active={sortKey === 'name'}
        sortDir={sortDir}
        onClick={() => onSortChange('name')}
      />
      <HeaderCell
        label="Size"
        colKey="size"
        neighborKey={neighborOf('size')}
        active={sortKey === 'size'}
        sortDir={sortDir}
        align="right"
        onClick={() => onSortChange('size')}
      />
      <HeaderCell
        label="Changed"
        colKey="changed"
        neighborKey={neighborOf('changed')}
        active={sortKey === 'mtime'}
        sortDir={sortDir}
        onClick={() => onSortChange('mtime')}
      />
      {showUnixMeta && (
        <>
          <HeaderCell
            label="Rights"
            colKey="rights"
            neighborKey={neighborOf('rights')}
            active={sortKey === 'mode'}
            sortDir={sortDir}
            onClick={() => onSortChange('mode')}
          />
          <HeaderCell
            label="Owner"
            colKey="owner"
            neighborKey={neighborOf('owner')}
            active={sortKey === 'owner'}
            sortDir={sortDir}
            onClick={() => onSortChange('owner')}
          />
        </>
      )}
    </div>
  )
}

const FileItem = memo(function FileItem({
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
  flatMode = false,
}: FileItemProps) {
  const isFolder = node.type === 'folder'
  const isMarkedExpanded = expandedPaths.has(node.path)
  const isOpen =
    isMarkedExpanded && (!isFolder || node.loaded === true || node.loading === true)
  const childList = useMemo(
    () => sortChildren(node.children ?? [], sortKey, sortDir, foldersFirst),
    [node.children, sortKey, sortDir, foldersFirst],
  )
  const hasChildrenBlock = isFolder && (node.loading || childList.length > 0)
  const fileIcon = getFileIcon(node.extension)
  const isSelected = !selectMode && selectedPath === node.path
  const isInMultiSelect = selectMode && selectedPaths.has(node.path)
  const isDropTarget = isFolder && dropHighlightPath === node.path
  const { widths, showUnixMeta } = useColWidths()
  const folderPartialSelected =
    selectMode &&
    isFolder &&
    !selectedPaths.has(node.path) &&
    Array.from(selectedPaths).some((p) =>
      node.path === '/' ? p !== '/' : p.startsWith(`${node.path}/`),
    )

  const namePaddingLeft = depth * 16 + 8
  const rowGridStyle = sftpColumnGridStyle(widths, { selectMode, showUnixMeta })

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
    <div className="select-none h-full w-full">
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
        onDragEnter={(e) => {
          if (selectMode) return
          e.preventDefault()
          e.stopPropagation()
          const targetDir = isFolder
            ? node.path
            : node.path.slice(0, node.path.lastIndexOf('/')) || '/'
          if (dropHighlightPath !== targetDir) {
            onFolderDragOver(targetDir)
          }
        }}
        onDragOver={(e) => {
          if (selectMode) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          const targetDir = isFolder
            ? node.path
            : node.path.slice(0, node.path.lastIndexOf('/')) || '/'
          if (dropHighlightPath !== targetDir) {
            onFolderDragOver(targetDir)
          }
        }}
        onDrop={(e) => {
          if (selectMode) return
          e.preventDefault()
          // Stop propagation so container doesn't also handle as root drop
          e.stopPropagation()
          const targetDir = isFolder
            ? node.path
            : node.path.slice(0, node.path.lastIndexOf('/')) || '/'
          onFolderDrop(targetDir, e)
        }}
        className={cn(
          'group h-full cursor-pointer rounded-md px-2 outline-none overflow-hidden',
          'transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
          'hover:bg-fileTree-hover',
          isSelected && 'ring-1 ring-inset ring-primary/40 bg-primary/5',
          isInMultiSelect && 'ring-1 ring-inset ring-primary/50 bg-primary/10',
          isDropTarget &&
            'border-l-4 border-l-primary bg-primary/20 shadow-[inset_0_0_12px_hsl(var(--primary)/0.25)] z-10 font-semibold',
        )}
        style={rowGridStyle}
        onClick={handleRowClick}
        onContextMenu={(e) => {
          if (onNodeContextMenu) onNodeContextMenu(node, e)
        }}
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={selectedPaths.has(node.path)}
            ref={(el) => {
              if (el) el.indeterminate = folderPartialSelected
            }}
            onChange={(e) => {
              e.stopPropagation()
              void onTogglePath(node.path)
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-border/50 accent-primary w-3.5 h-3.5 justify-self-center cursor-pointer"
            aria-label={`Select ${node.name}`}
          />
        )}

        <div
          className="flex min-w-0 items-center gap-1.5 overflow-hidden"
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
                className="transition-colors duration-200 text-muted-foreground group-hover:text-primary"
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
            <div className="flex items-center justify-center w-4 h-4 shrink-0 pointer-events-none">
              <span className={cn('text-xs transition-opacity duration-200', fileIcon.color)}>
                {fileIcon.icon}
              </span>
            </div>
          )}

          <div
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded transition-all duration-200 shrink-0 text-folderIcon pointer-events-none',
              isFolder
                ? isDropTarget
                  ? 'text-primary scale-110 drop-shadow-sm'
                  : 'opacity-90 group-hover:opacity-100'
                : cn(fileIcon.color, 'opacity-70 group-hover:opacity-100'),
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
              'font-mono text-sm transition-colors duration-200 min-w-0 flex-1 truncate pointer-events-none',
              isFolder
                ? isDropTarget
                  ? 'text-primary font-bold'
                  : 'text-foreground/90 group-hover:text-foreground'
                : 'text-muted-foreground group-hover:text-foreground',
            )}
          >
            {node.name}
            {isFolder && node.loading && (
              <span className="ml-2 text-xs text-muted-foreground">…</span>
            )}
          </span>

          {isDropTarget && (
            <span className="ml-auto mr-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-primary text-primary-foreground shadow-md shrink-0 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
              <UploadCloud className="w-3 h-3 shrink-0 animate-pulse" />
              Upload here
            </span>
          )}
        </div>

        <MetaCells node={node} />
      </div>

      {hasChildrenBlock && !flatMode && (
        <div
          className={cn(
            'transition-[opacity] duration-200 ease-out',
            isOpen ? 'opacity-100 overflow-hidden' : 'max-h-0 overflow-hidden opacity-0 pointer-events-none',
          )}
        >
          {node.loading && childList.length === 0 && (
            <div
              className="px-2 py-1 text-xs text-muted-foreground font-mono"
              style={rowGridStyle}
            >
              {selectMode && <div />}
              <div
                className="flex min-w-0 items-center overflow-hidden"
                style={{ paddingLeft: (depth + 1) * 16 + 8 }}
              >
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
})

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
  onCollapseAll,
  hideUnixMeta = false,
}: SftpFileTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)
  const colWidths = useSftpColumnWidths()
  const showUnixMeta = !hideUnixMeta

  const flatRows = useMemo(
    () => flattenVisibleSftpRows(data ?? [], expandedPaths, sortKey, sortDir, foldersFirst),
    [data, expandedPaths, sortKey, sortDir, foldersFirst],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight || 480))
    ro.observe(el)
    setViewportHeight(el.clientHeight || 480)
    return () => ro.disconnect()
  }, [])

  const virtual = useMemo(() => {
    const totalHeight = flatRows.length * SFTP_ROW_HEIGHT
    const start = Math.max(0, Math.floor(scrollTop / SFTP_ROW_HEIGHT) - SFTP_VIRTUAL_OVERSCAN)
    const visibleCount = Math.ceil(viewportHeight / SFTP_ROW_HEIGHT) + SFTP_VIRTUAL_OVERSCAN * 2
    const end = Math.min(flatRows.length, start + visibleCount)
    return { totalHeight, start, end, slice: flatRows.slice(start, end) }
  }, [flatRows, scrollTop, viewportHeight])

  const sharedItemProps = {
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
    flatMode: true as const,
  }

  return (
    <ColWidthContext.Provider value={{ ...colWidths, showUnixMeta }}>
    <div
      className={cn(
        'bg-fileTree-bg rounded-lg border border-border/50 p-3 font-mono min-w-0 flex flex-col min-h-0 h-full overflow-hidden relative transition-all duration-150',
        dropHighlightPath === '/' && 'border-primary/70 shadow-[inset_0_0_24px_rgba(59,130,246,0.1)]',
        className,
      )}
    >
      {dropHighlightPath && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-1 rounded-full bg-card/95 backdrop-blur-md text-foreground shadow-2xl border border-primary/40 text-xs font-medium animate-in fade-in zoom-in-95 duration-150">
          <UploadCloud className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
          <span className="truncate max-w-[280px]">
            Upload target: <strong className="font-semibold text-primary">{dropHighlightPath === '/' ? '/ (Root Directory)' : dropHighlightPath}</strong>
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 pb-2 mb-1 border-b border-border/30">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">{title}</span>
        <div className="flex-1 min-w-0" />
        {onCollapseAll && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0 disabled:pointer-events-none disabled:opacity-40"
            onClick={onCollapseAll}
            disabled={expandedPaths.size === 0}
            title="Collapse all folders"
          >
            <ChevronUp className="w-3 h-3 shrink-0" />
            Collapse all
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onDragOver={(e) => {
          if (selectMode) return
          e.preventDefault()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          if (dropHighlightPath !== '/') {
            onFolderDragOver('/')
          }
        }}
      >
        <div className="sticky top-0 z-10 bg-fileTree-bg">
          <ColumnHeaderRow
            selectMode={selectMode}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </div>

        <div style={{ height: virtual.totalHeight, position: 'relative' }}>
          {virtual.slice.map(({ node, depth }, i) => {
            const index = virtual.start + i
            return (
              <div
                key={node.path}
                style={{
                  position: 'absolute',
                  top: index * SFTP_ROW_HEIGHT,
                  left: 0,
                  width: '100%',
                  height: SFTP_ROW_HEIGHT,
                  overflow: 'hidden',
                }}
              >
                <FileItem
                  node={node}
                  depth={depth}
                  isLast={index === flatRows.length - 1}
                  {...sharedItemProps}
                />
              </div>
            )
          })}
        </div>

        {dropHighlightPath === '/' && (
          <div className="mx-2 my-2 py-2.5 px-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 flex items-center justify-center gap-2 text-xs text-primary/90 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <UploadCloud className="w-3.5 h-3.5 text-primary shrink-0 animate-bounce" />
            <span>Drop anywhere here to upload to <strong>/ (Root Directory)</strong></span>
          </div>
        )}
      </div>
    </div>
    </ColWidthContext.Provider>
  )
}
