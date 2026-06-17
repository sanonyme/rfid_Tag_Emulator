import { useState, useRef, useLayoutEffect, type ComponentType } from 'react'
import {
  Download,
  Copy,
  Pencil,
  Trash2,
  FolderOpen,
  FileText,
  ClipboardCopy,
  Info,
  ChevronRight,
  FolderInput,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SftpFileNode } from './SftpFileTree'

function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

function CtxButton({
  icon: Icon,
  label,
  shortcut,
  disabled,
  destructive,
  onClick,
  className,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left disabled:opacity-40 disabled:pointer-events-none',
        destructive ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-accent',
        className,
      )}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
      <span className={cn('flex-1', !disabled && label === 'Open' && 'font-medium')}>{label}</span>
      {shortcut && (
        <span className="text-[10px] text-muted-foreground tabular-nums">{shortcut}</span>
      )}
    </button>
  )
}

export interface SftpRemoteContextMenuProps {
  x: number
  y: number
  node: SftpFileNode
  onClose: () => void
  onOpen: () => void
  onEdit: () => void
  onDownload: () => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  onRename: () => void
  onCopyPath: () => void
  onCopyName: () => void
  onCopyParent: () => void
  onProperties: () => void
}

export function SftpRemoteContextMenu({
  x,
  y,
  node,
  onClose,
  onOpen,
  onEdit,
  onDownload,
  onDuplicate,
  onMove,
  onDelete,
  onRename,
  onCopyPath,
  onCopyName,
  onCopyParent,
  onProperties,
}: SftpRemoteContextMenuProps) {
  const [fileNamesOpen, setFileNamesOpen] = useState(false)
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right')
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const isFile = node.type === 'file'

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = y

    if (top + height > window.innerHeight - margin) {
      top = y - height
    }
    if (top < margin) top = margin

    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin
    }
    if (left < margin) left = margin

    setPosition({ left, top })
  }, [x, y])

  useLayoutEffect(() => {
    if (!fileNamesOpen || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const submenuWidth = 200
    setSubmenuSide(rect.right + submenuWidth > window.innerWidth - 8 ? 'left' : 'right')
  }, [fileNamesOpen, position])

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  return (
    <div
      ref={menuRef}
      id="sftp-remote-ctx-menu"
      className="fixed z-[9999] min-w-[240px] rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CtxButton icon={FolderOpen} label="Open" onClick={() => run(onOpen)} />
      <CtxButton
        icon={FileText}
        label="Edit"
        disabled={!isFile}
        onClick={() => run(onEdit)}
      />
      <CtxButton
        icon={Download}
        label="Download…"
        shortcut="F5"
        onClick={() => run(onDownload)}
      />
      <CtxButton
        icon={Copy}
        label="Duplicate…"
        shortcut="Shift+F5"
        disabled={!isFile}
        onClick={() => run(onDuplicate)}
      />
      <CtxButton
        icon={FolderInput}
        label="Move To…"
        shortcut="Shift+F6"
        onClick={() => run(onMove)}
      />
      <CtxButton
        icon={Trash2}
        label="Delete"
        shortcut="F8"
        destructive
        onClick={() => run(onDelete)}
      />
      <CtxButton
        icon={Pencil}
        label="Rename"
        shortcut="F2"
        onClick={() => run(onRename)}
      />
      <CtxButton
        icon={ClipboardCopy}
        label="Copy to Clipboard"
        shortcut="Ctrl+C"
        onClick={() => run(onCopyPath)}
      />

      <div className="border-t border-border/50 my-1" />

      <div className="relative">
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left',
            fileNamesOpen && 'bg-accent/60',
          )}
          onMouseEnter={() => setFileNamesOpen(true)}
          onMouseLeave={() => setFileNamesOpen(false)}
        >
          <span className="w-3.5 shrink-0" />
          <span className="flex-1">File Names</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {fileNamesOpen && (
          <div
            className={cn(
              'absolute top-0 min-w-[200px] rounded-lg border border-border/60 bg-popover shadow-xl py-1',
              submenuSide === 'right' ? 'left-full ml-0.5' : 'right-full mr-0.5',
            )}
            onMouseEnter={() => setFileNamesOpen(true)}
            onMouseLeave={() => setFileNamesOpen(false)}
          >
            <CtxButton icon={ClipboardCopy} label="Copy full path" onClick={() => run(onCopyPath)} />
            <CtxButton icon={ClipboardCopy} label="Copy file name" onClick={() => run(onCopyName)} />
            <CtxButton
              icon={ClipboardCopy}
              label="Copy parent directory"
              onClick={() => run(onCopyParent)}
            />
          </div>
        )}
      </div>

      <div className="border-t border-border/50 my-1" />

      <CtxButton
        icon={Info}
        label="Properties"
        shortcut="F9"
        onClick={() => run(onProperties)}
      />
    </div>
  )
}

export { parentDir as sftpParentDir }
