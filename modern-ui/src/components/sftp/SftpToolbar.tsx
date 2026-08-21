import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Button } from '../ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import { cn } from '@/lib/utils'
import type { SftpFileNode } from './SftpFileTree'
import {
  Unplug,
  RefreshCw,
  Search,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Upload,
  Download,
  Pencil,
  Copy,
  FolderInput,
  Info,
  Trash2,
  CheckSquare,
  ListChecks,
  Database,
  ChevronDown,
  MoreHorizontal,
  FileText,
  ChevronUp,
} from 'lucide-react'

function ToolbarSep() {
  return <div className="h-5 w-px shrink-0 bg-border/50" aria-hidden />
}

function IconAction({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  destructive,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 shrink-0',
            destructive && 'text-destructive hover:text-destructive hover:bg-destructive/10',
          )}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="w-4 h-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && (
          <span className="text-[10px] text-muted-foreground font-mono">{shortcut}</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export interface SftpToolbarProps {
  host: string
  sftpPort: string
  foldersFirst: boolean
  onFoldersFirstChange: (v: boolean) => void
  selectMode: boolean
  onSelectModeToggle: () => void
  selectedPathsCount: number
  selectedPath: string | null
  selectedNode: SftpFileNode | null
  onDisconnect: () => void
  onRefresh: () => void
  onCollapseAll: () => void
  collapseAllDisabled?: boolean
  onFind: () => void
  onPickLocal: () => void
  onMigrateOpen: () => void
  onSelectAllInTarget: () => void
  onBatchDownload: () => void
  onNewFolder: () => void
  onNewFile: () => void
  onUpload: () => void
  onDownload: () => void
  onRename: () => void
  onEdit: () => void
  onDuplicate: () => void
  onMove: () => void
  onProperties: () => void
  onDelete: () => void
}

export function SftpToolbar({
  host,
  sftpPort,
  foldersFirst,
  onFoldersFirstChange,
  selectMode,
  onSelectModeToggle,
  selectedPathsCount,
  selectedPath,
  selectedNode,
  onDisconnect,
  onRefresh,
  onCollapseAll,
  collapseAllDisabled,
  onFind,
  onPickLocal,
  onMigrateOpen,
  onSelectAllInTarget,
  onBatchDownload,
  onNewFolder,
  onNewFile,
  onUpload,
  onDownload,
  onRename,
  onEdit,
  onDuplicate,
  onMove,
  onProperties,
  onDelete,
}: SftpToolbarProps) {
  const [newOpen, setNewOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const newRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!newOpen && !moreOpen && !actionsOpen) return
    const close = (e: MouseEvent) => {
      if (newOpen && newRef.current && !newRef.current.contains(e.target as Node)) {
        setNewOpen(false)
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
      if (actionsOpen && actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [newOpen, moreOpen, actionsOpen])

  const hasSelection = Boolean(selectedNode)
  const canDelete = selectMode ? selectedPathsCount > 0 : Boolean(selectedPath)
  const showActionsRow = hasSelection || selectMode

  return (
    <TooltipProvider delayDuration={300}>
      <div className="shrink-0 rounded-lg border border-border/40 bg-muted/15 px-2 py-1.5 space-y-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Connection */}
          <div
            className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 pl-2.5 pr-1 py-0.5 shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
            <span className="font-mono [font-family:var(--font-mono)] text-[11px] text-muted-foreground truncate max-w-[160px]">
              {host}:{sftpPort}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={onDisconnect}
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span className="sr-only">Disconnect</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Disconnect</TooltipContent>
            </Tooltip>
          </div>

          <ToolbarSep />

          <IconAction icon={RefreshCw} label="Refresh" onClick={onRefresh} />
          <IconAction
            icon={ChevronUp}
            label="Collapse all folders"
            onClick={onCollapseAll}
            disabled={collapseAllDisabled}
          />
          <IconAction icon={Search} label="Find files" shortcut="Ctrl+F" onClick={onFind} />
          <IconAction icon={FolderOpen} label="Local folder" onClick={onPickLocal} />

          <ToolbarSep />

          <div className="relative shrink-0" ref={newRef}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              onClick={() => setNewOpen((v) => !v)}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
            {newOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 min-w-[148px] rounded-md border border-border/60 bg-popover py-1 shadow-lg animate-in fade-in-0 zoom-in-95"
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
                  onClick={() => {
                    setNewOpen(false)
                    onNewFolder()
                  }}
                >
                  <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                  New folder
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
                  onClick={() => {
                    setNewOpen(false)
                    onNewFile()
                  }}
                >
                  <FilePlus className="w-3.5 h-3.5 shrink-0" />
                  New file
                </button>
              </div>
            )}
          </div>

          <IconAction icon={Upload} label="Upload" onClick={onUpload} />

          <ToolbarSep />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={selectMode ? 'default' : 'ghost'}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={onSelectModeToggle}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {selectMode ? 'Selecting' : 'Select'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Multi-select mode</TooltipContent>
          </Tooltip>

          {selectMode && (
            <>
              <IconAction icon={ListChecks} label="Select all in folder" onClick={onSelectAllInTarget} />
              <IconAction icon={Download} label="Download selected" onClick={onBatchDownload} />
            </>
          )}

          <div className="flex-1 min-w-[4px]" />

          <label
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none shrink-0 px-1"
          >
            <input
              type="checkbox"
              checked={foldersFirst}
              onChange={(e) => onFoldersFirstChange(e.target.checked)}
              className="rounded border-border/50 accent-primary w-3.5 h-3.5"
            />
            Folders first
          </label>

          <div className="relative shrink-0" ref={moreRef}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <MoreHorizontal className="w-4 h-4" />
                  <span className="sr-only">More</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">More tools</TooltipContent>
            </Tooltip>
            {moreOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border/60 bg-popover py-1 shadow-lg animate-in fade-in-0 zoom-in-95"
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left text-amber-600 dark:text-amber-400"
                  onClick={() => {
                    setMoreOpen(false)
                    onMigrateOpen()
                  }}
                >
                  <Database className="w-3.5 h-3.5 shrink-0" />
                  Migrate cleanup
                </button>
              </div>
            )}
          </div>
        </div>

        {showActionsRow && (
          <div className="flex items-center gap-0.5 pt-1 border-t border-border/30">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 shrink-0">
              {selectMode ? `Selected (${selectedPathsCount})` : 'Selected item'}
            </span>
            <ToolbarSep />
          {/* Wide: individual action icons */}
          <div className="hidden lg:contents">
            <IconAction
              icon={Download}
              label="Download"
              shortcut="F5"
              onClick={onDownload}
              disabled={!hasSelection}
            />
            <IconAction
              icon={Pencil}
              label="Rename"
              shortcut="F2"
              onClick={onRename}
              disabled={!hasSelection}
            />
            <IconAction
              icon={FileText}
              label="Edit"
              onClick={onEdit}
              disabled={!hasSelection || selectedNode?.type !== 'file'}
            />
            <IconAction
              icon={Copy}
              label="Duplicate"
              shortcut="Shift+F5"
              onClick={onDuplicate}
              disabled={!hasSelection || selectedNode?.type !== 'file'}
            />
            <IconAction
              icon={FolderInput}
              label="Move to…"
              shortcut="Shift+F6"
              onClick={onMove}
              disabled={!hasSelection}
            />
            <IconAction
              icon={Info}
              label="Properties"
              shortcut="F9"
              onClick={onProperties}
              disabled={!hasSelection}
            />
            <ToolbarSep />
            <IconAction
              icon={Trash2}
              label="Delete"
              shortcut="F8"
              onClick={onDelete}
              disabled={!canDelete}
              destructive
            />
          </div>

          {/* Narrow: collapse file actions into Actions menu */}
          <div className="relative lg:hidden" ref={actionsRef}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              onClick={() => setActionsOpen((v) => !v)}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              Actions
            </Button>
            {actionsOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border/60 bg-popover py-1 shadow-lg animate-in fade-in-0 zoom-in-95">
                {[
                  { label: 'Download', onClick: onDownload, disabled: !hasSelection },
                  { label: 'Rename', onClick: onRename, disabled: !hasSelection },
                  { label: 'Edit', onClick: onEdit, disabled: !hasSelection || selectedNode?.type !== 'file' },
                  { label: 'Duplicate', onClick: onDuplicate, disabled: !hasSelection || selectedNode?.type !== 'file' },
                  { label: 'Move to…', onClick: onMove, disabled: !hasSelection },
                  { label: 'Properties', onClick: onProperties, disabled: !hasSelection },
                  { label: 'Delete', onClick: onDelete, disabled: !canDelete, destructive: true },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left disabled:opacity-40',
                      item.destructive
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'hover:bg-accent',
                    )}
                    onClick={() => {
                      setActionsOpen(false)
                      item.onClick()
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
