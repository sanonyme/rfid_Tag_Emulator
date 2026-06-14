import { motion, LayoutGroup } from 'framer-motion'
import { Box, Star, Workflow, RefreshCw, Search } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '@/lib/utils'
import { sectionCard, sectionLabel } from '@/lib/ui-tokens'
import { indicatorSpring, prefersReducedMotion } from '@/lib/motion'
import type { EdgeBlockInfo, EdgeProcessInfo } from '@/lib/edge-api-client'

export type WorkspaceTarget =
  | { type: 'block'; name: string }
  | { type: 'process'; name: string }

type EdgeLibraryPanelProps = {
  uiEnabled: boolean
  blocks: EdgeBlockInfo[]
  processes: EdgeProcessInfo[]
  filteredBlocks: EdgeBlockInfo[]
  filteredProcesses: EdgeProcessInfo[]
  blockSearch: string
  processSearch: string
  onBlockSearchChange: (v: string) => void
  onProcessSearchChange: (v: string) => void
  workspaceTarget: WorkspaceTarget | null
  onSelectBlock: (name: string) => void
  onSelectProcess: (name: string) => void
  pinnedBlocks: string[]
  pinnedProcesses: string[]
  recentProcesses: string[]
  onTogglePinBlock: (name: string) => void
  onTogglePinProcess: (name: string) => void
  loadingBlocks: boolean
  loadingProcesses: boolean
  onRefreshBlocks: () => void
  onRefreshProcesses: () => void
  blockSearchRef?: React.RefObject<HTMLInputElement>
}

function sortWithPinned<T extends { name: string }>(
  items: T[],
  pinned: string[],
  recent: string[],
): T[] {
  const byName = new Map(items.map((i) => [i.name, i]))
  const ordered: T[] = []
  const seen = new Set<string>()

  for (const name of pinned) {
    const item = byName.get(name)
    if (item) {
      ordered.push(item)
      seen.add(name)
    }
  }
  for (const name of recent) {
    if (seen.has(name)) continue
    const item = byName.get(name)
    if (item) {
      ordered.push(item)
      seen.add(name)
    }
  }
  for (const item of items) {
    if (!seen.has(item.name)) ordered.push(item)
  }
  return ordered
}

function LibraryItem({
  name,
  selected,
  disabled,
  onSelect,
  pinned,
  onTogglePin,
  layoutId,
  icon,
  suffix,
}: {
  name: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
  pinned: boolean
  onTogglePin: () => void
  layoutId: string
  icon: React.ReactNode
  suffix?: React.ReactNode
}) {
  const reduced = prefersReducedMotion()

  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          'relative z-0 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-200',
          selected ? 'text-foreground' : 'text-foreground/85 hover:bg-muted/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {selected && (
          <motion.span
            layoutId={layoutId}
            aria-hidden
            className="absolute inset-0 -z-10 rounded-lg bg-info/10 ring-1 ring-info/25 shadow-elev-sm"
            transition={reduced ? { duration: 0 } : indicatorSpring}
          />
        )}
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
        {suffix}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        className={cn(
          'smooth-press ml-0.5 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
          pinned && 'opacity-100 text-warning',
        )}
        title={pinned ? 'Unpin' : 'Pin'}
      >
        <Star className={cn('h-3 w-3', pinned && 'fill-current')} />
      </button>
    </div>
  )
}

export function EdgeLibraryPanel({
  uiEnabled,
  blocks,
  processes,
  filteredBlocks,
  filteredProcesses,
  blockSearch,
  processSearch,
  onBlockSearchChange,
  onProcessSearchChange,
  workspaceTarget,
  onSelectBlock,
  onSelectProcess,
  pinnedBlocks,
  pinnedProcesses,
  recentProcesses,
  onTogglePinBlock,
  onTogglePinProcess,
  loadingBlocks,
  loadingProcesses,
  onRefreshBlocks,
  onRefreshProcesses,
  blockSearchRef,
}: EdgeLibraryPanelProps) {
  const displayBlocks = sortWithPinned(
    blockSearch.trim() ? filteredBlocks : blocks,
    pinnedBlocks,
    [],
  )
  const displayProcesses = sortWithPinned(
    processSearch.trim() ? filteredProcesses : processes,
    pinnedProcesses,
    recentProcesses,
  )

  return (
    <div className={cn(sectionCard, 'flex min-h-0 w-full flex-col overflow-hidden xl:w-[280px] xl:shrink-0')}>
      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-2.5">
        <span className={sectionLabel}>Library</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Box className="h-3.5 w-3.5 text-info" />
              Blocks
              <span className="text-xs font-normal text-muted-foreground">({blocks.length})</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void onRefreshBlocks()}
              disabled={!uiEnabled || loadingBlocks}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingBlocks && 'animate-spin')} />
            </Button>
          </div>

          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={blockSearchRef}
              value={blockSearch}
              onChange={(e) => onBlockSearchChange(e.target.value)}
              placeholder="Search blocks…  /"
              className="h-8 pl-8 font-mono text-xs"
              disabled={!uiEnabled}
            />
          </div>

          <ScrollArea className="min-h-[120px] flex-1 rounded-lg border border-border/30 bg-muted/10">
            <LayoutGroup id="edge-block-list">
              <div className="p-1">
                {displayBlocks.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {blocks.length === 0 ? 'No blocks loaded.' : 'No match.'}
                  </p>
                ) : (
                  displayBlocks.map((b) => (
                    <LibraryItem
                      key={b.name}
                      name={b.name}
                      selected={workspaceTarget?.type === 'block' && workspaceTarget.name === b.name}
                      disabled={!uiEnabled}
                      onSelect={() => onSelectBlock(b.name)}
                      pinned={pinnedBlocks.includes(b.name)}
                      onTogglePin={() => onTogglePinBlock(b.name)}
                      layoutId="edge-block-active"
                      icon={<Box className="h-3.5 w-3.5 shrink-0 text-info/70" />}
                    />
                  ))
                )}
              </div>
            </LayoutGroup>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border/30 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Workflow className="h-3.5 w-3.5 text-primary" />
              Processes
              <span className="text-xs font-normal text-muted-foreground">({processes.length})</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void onRefreshProcesses()}
              disabled={!uiEnabled || loadingProcesses}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingProcesses && 'animate-spin')} />
            </Button>
          </div>

          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={processSearch}
              onChange={(e) => onProcessSearchChange(e.target.value)}
              placeholder="Search processes…"
              className="h-8 pl-8 font-mono text-xs"
              disabled={!uiEnabled}
            />
          </div>

          <ScrollArea className="min-h-[100px] flex-1 rounded-lg border border-border/30 bg-muted/10">
            <LayoutGroup id="edge-process-list">
              <div className="p-1">
                {displayProcesses.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {processes.length === 0 ? 'No processes loaded.' : 'No match.'}
                  </p>
                ) : (
                  displayProcesses.map((p) => (
                    <LibraryItem
                      key={p.name}
                      name={p.name}
                      selected={
                        workspaceTarget?.type === 'process' && workspaceTarget.name === p.name
                      }
                      disabled={!uiEnabled}
                      onSelect={() => onSelectProcess(p.name)}
                      pinned={pinnedProcesses.includes(p.name)}
                      onTogglePin={() => onTogglePinProcess(p.name)}
                      layoutId="edge-process-active"
                      icon={
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            p.started
                              ? 'bg-success shadow-[0_0_6px_hsl(var(--success)/0.8)]'
                              : 'bg-muted-foreground/40',
                          )}
                        />
                      }
                      suffix={
                        p.started != null ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {p.started ? 'run' : 'stop'}
                          </span>
                        ) : null
                      }
                    />
                  ))
                )}
              </div>
            </LayoutGroup>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
