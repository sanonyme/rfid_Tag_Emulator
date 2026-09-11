import { useEffect, useState } from 'react'
import {
  Bookmark,
  BookmarkPlus,
  Cloud,
  FolderInput,
  HardDrive,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Trash2,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import {
  connectionSubtitle,
  partitionConnections,
  protocolShortLabel,
  resolvedConnectionName,
  type SavedExplorerConnection,
} from '@/lib/sftp-saved-connections'

const SIDEBAR_EXPANDED_KEY = 'sftp-connections-sidebar-expanded'

function protocolIcon(protocol: SavedExplorerConnection['protocol']) {
  if (protocol === 's3') return Cloud
  if (protocol === 's3compat') return HardDrive
  if (protocol === 'ftp') return Server
  return FolderInput
}

function ConnectionRow({
  connection: c,
  connecting,
  active,
  showPin,
  compact,
  onConnect,
  onDelete,
  onPin,
}: {
  connection: SavedExplorerConnection
  connecting: boolean
  active: boolean
  showPin?: boolean
  compact?: boolean
  onConnect: (connection: SavedExplorerConnection) => void
  onDelete: (id: string) => void
  onPin?: (connection: SavedExplorerConnection) => void
}) {
  const Icon = protocolIcon(c.protocol)
  if (compact) {
    return (
      <button
        type="button"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          active && 'bg-primary/10 text-primary',
        )}
        disabled={connecting}
        title={resolvedConnectionName(c)}
        onClick={() => onConnect(c)}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    )
  }
  return (
    <div
      className={cn(
        'flex w-full items-center gap-1.5 rounded-lg border border-border/50 bg-background/70 px-2 py-1.5',
        active && 'border-primary/40 bg-primary/5',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        disabled={connecting}
        onClick={() => onConnect(c)}
        title="Connect"
      >
        <div className="truncate text-sm font-medium text-foreground">{resolvedConnectionName(c)}</div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {protocolShortLabel(c.protocol)} · {connectionSubtitle(c)}
        </div>
      </button>
      {showPin && onPin && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={connecting}
          title="Save connection"
          onClick={(e) => {
            e.stopPropagation()
            onPin(c)
          }}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={connecting}
        title="Remove"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(c.id)
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      {connecting && active && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  )
}

export function SftpSavedConnections({
  connections,
  connecting,
  activeId,
  onConnect,
  onDelete,
  onPin,
}: {
  connections: SavedExplorerConnection[]
  connecting: boolean
  activeId?: string | null
  onConnect: (connection: SavedExplorerConnection) => void
  onDelete: (id: string) => void
  onPin: (connection: SavedExplorerConnection) => void
}) {
  const { saved, recents } = partitionConnections(connections)
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_EXPANDED_KEY) !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(expanded))
    } catch {
      /* ignore */
    }
  }, [expanded])

  if (saved.length === 0 && recents.length === 0) return null

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col border-r border-border/40 bg-muted/15 transition-[width] duration-200 ease-out',
        expanded ? 'w-72' : 'w-12',
      )}
    >
      <div className={cn('flex shrink-0 items-center border-b border-border/30', expanded ? 'justify-between px-2.5 py-1.5' : 'justify-center px-1 py-1.5')}>
        {expanded && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Connections
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse connections' : 'Expand connections'}
          aria-label={expanded ? 'Collapse connections' : 'Expand connections'}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          expanded ? 'space-y-4 px-2.5 py-3' : 'flex flex-col items-center gap-1 px-1 py-2',
        )}
      >
        {saved.length > 0 && (
          <section className={cn(expanded ? 'space-y-1.5' : 'flex flex-col items-center gap-1')}>
            {expanded ? (
              <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Bookmark className="h-3 w-3" />
                Saved
              </p>
            ) : (
              <Bookmark className="mb-0.5 h-3 w-3 text-muted-foreground" />
            )}
            <ul className={cn(expanded ? 'space-y-1' : 'flex flex-col items-center gap-1')}>
              {saved.map((c) => (
                <li key={c.id}>
                  <ConnectionRow
                    connection={c}
                    connecting={connecting}
                    active={activeId === c.id}
                    compact={!expanded}
                    onConnect={onConnect}
                    onDelete={onDelete}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {recents.length > 0 && (
          <section className={cn(expanded ? 'space-y-1.5' : 'flex flex-col items-center gap-1')}>
            {expanded && (
              <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recent
              </p>
            )}
            <ul className={cn(expanded ? 'space-y-1' : 'flex flex-col items-center gap-1')}>
              {recents.map((c) => (
                <li key={c.id}>
                  <ConnectionRow
                    connection={c}
                    connecting={connecting}
                    active={activeId === c.id}
                    compact={!expanded}
                    showPin={expanded}
                    onConnect={onConnect}
                    onDelete={onDelete}
                    onPin={onPin}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
