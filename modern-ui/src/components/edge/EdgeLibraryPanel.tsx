import { Box, Star, Workflow, RefreshCw, Search } from 'lucide-react'
import { Tabs } from '../ui/tabs'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { SegmentedTabs } from '../SegmentedTabs'
import { cn } from '@/lib/utils'
import { sectionCard } from '@/lib/ui-tokens'
import type { EdgeBlockInfo, EdgeProcessInfo } from '@/lib/edge-api-client'

export type WorkspaceTarget =
  | { type: 'block'; name: string }
  | { type: 'process'; name: string }

export type LibraryCategory = 'block' | 'process'

type EdgeLibraryPanelProps = {
  uiEnabled: boolean
  category: LibraryCategory
  onCategoryChange: (category: LibraryCategory) => void
  blocks: EdgeBlockInfo[]
  processes: EdgeProcessInfo[]
  filteredBlocks: EdgeBlockInfo[]
  filteredProcesses: EdgeProcessInfo[]
  blockSearch: string
  processSearch: string
  onBlockSearchChange: (v: string) => void
  onProcessSearchChange: (v: string) => void
  onOpenBlock: (name: string) => void
  onOpenProcess: (name: string) => void
  pinnedBlocks: string[]
  pinnedProcesses: string[]
  onTogglePinBlock: (name: string) => void
  onTogglePinProcess: (name: string) => void
  loadingBlocks: boolean
  loadingProcesses: boolean
  onRefreshBlocks: () => void
  onRefreshProcesses: () => void
  blockSearchRef?: React.RefObject<HTMLInputElement>
  processSearchRef?: React.RefObject<HTMLInputElement>
}

function sortWithPinned<T extends { name: string }>(items: T[], pinned: string[]): T[] {
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
  for (const item of items) {
    if (!seen.has(item.name)) ordered.push(item)
  }
  return ordered
}

function ListRow({
  name,
  disabled,
  onOpen,
  pinned,
  onTogglePin,
  icon,
  suffix,
}: {
  name: string
  disabled: boolean
  onOpen: () => void
  pinned: boolean
  onTogglePin: () => void
  icon: React.ReactNode
  suffix?: React.ReactNode
}) {
  return (
    <div className="group flex items-center gap-1 border-b border-border/30 last:border-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="smooth-press flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{name}</span>
        {suffix}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onTogglePin}
        className={cn(
          'smooth-press shrink-0 rounded-md p-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
          pinned && 'opacity-100 text-warning',
        )}
        title={pinned ? 'Unpin' : 'Pin'}
      >
        <Star className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
      </button>
    </div>
  )
}

export function EdgeLibraryPanel({
  uiEnabled,
  category,
  onCategoryChange,
  blocks,
  processes,
  filteredBlocks,
  filteredProcesses,
  blockSearch,
  processSearch,
  onBlockSearchChange,
  onProcessSearchChange,
  onOpenBlock,
  onOpenProcess,
  pinnedBlocks,
  pinnedProcesses,
  onTogglePinBlock,
  onTogglePinProcess,
  loadingBlocks,
  loadingProcesses,
  onRefreshBlocks,
  onRefreshProcesses,
  blockSearchRef,
  processSearchRef,
}: EdgeLibraryPanelProps) {
  const isBlocks = category === 'block'
  const displayBlocks = sortWithPinned(blockSearch.trim() ? filteredBlocks : blocks, pinnedBlocks)
  const displayProcesses = sortWithPinned(
    processSearch.trim() ? filteredProcesses : processes,
    pinnedProcesses,
  )
  const runningCount = processes.filter((p) => p.started).length

  return (
    <div className={cn(sectionCard, 'flex min-h-0 flex-1 flex-col overflow-hidden')} data-tour="tour-edge-library">
      <Tabs
        value={category}
        onValueChange={(v) => onCategoryChange(v as LibraryCategory)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border/30 p-3">
          <SegmentedTabs
            value={category}
            layoutId="edge-library-category"
            className="mx-auto max-w-md grid-cols-2"
            triggerClassName="gap-1.5 py-2"
            items={[
              {
                value: 'block',
                label: (
                  <span className="flex items-center gap-1.5">
                    Blocks
                    <span className="rounded-full bg-info/15 px-1.5 py-px text-[10px] font-semibold text-info">
                      {blocks.length}
                    </span>
                  </span>
                ),
                icon: <Box className="h-3.5 w-3.5 text-info" />,
              },
              {
                value: 'process',
                label: (
                  <span className="flex items-center gap-1.5">
                    Processes
                    <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">
                      {processes.length}
                    </span>
                  </span>
                ),
                icon: <Workflow className="h-3.5 w-3.5 text-primary" />,
              },
            ]}
          />
        </div>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-3 bg-gradient-to-b p-4',
            isBlocks ? 'from-info/10 via-transparent to-transparent' : 'from-primary/10 via-transparent to-transparent',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {isBlocks ? (
                <Input
                  ref={blockSearchRef}
                  value={blockSearch}
                  onChange={(e) => onBlockSearchChange(e.target.value)}
                  placeholder="Search blocks…  /"
                  className="h-10 pl-9 font-mono text-sm"
                  disabled={!uiEnabled}
                />
              ) : (
                <Input
                  ref={processSearchRef}
                  value={processSearch}
                  onChange={(e) => onProcessSearchChange(e.target.value)}
                  placeholder="Search processes…"
                  className="h-10 pl-9 font-mono text-sm"
                  disabled={!uiEnabled}
                />
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              onClick={() => void (isBlocks ? onRefreshBlocks() : onRefreshProcesses())}
              disabled={!uiEnabled || (isBlocks ? loadingBlocks : loadingProcesses)}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (isBlocks ? loadingBlocks : loadingProcesses) && 'animate-spin')} />
              Refresh
            </Button>
            {!isBlocks && runningCount > 0 && (
              <span className="text-xs text-success">{runningCount} running</span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isBlocks ? (
              displayBlocks.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {blocks.length === 0 ? 'No blocks loaded.' : 'No match.'}
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/30 bg-background/50">
                  {displayBlocks.map((b) => (
                    <ListRow
                      key={b.name}
                      name={b.name}
                      disabled={!uiEnabled}
                      onOpen={() => onOpenBlock(b.name)}
                      pinned={pinnedBlocks.includes(b.name)}
                      onTogglePin={() => onTogglePinBlock(b.name)}
                      icon={<Box className="h-4 w-4 shrink-0 text-info" />}
                    />
                  ))}
                </div>
              )
            ) : displayProcesses.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {processes.length === 0 ? 'No processes loaded.' : 'No match.'}
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/30 bg-background/50">
                {displayProcesses.map((p) => (
                  <ListRow
                    key={p.name}
                    name={p.name}
                    disabled={!uiEnabled}
                    onOpen={() => onOpenProcess(p.name)}
                    pinned={pinnedProcesses.includes(p.name)}
                    onTogglePin={() => onTogglePinProcess(p.name)}
                    icon={
                      <span
                        className={cn(
                          'h-2.5 w-2.5 shrink-0 rounded-full',
                          p.started
                            ? 'bg-success shadow-[0_0_6px_hsl(var(--success)/0.8)]'
                            : 'bg-muted-foreground/40',
                        )}
                      />
                    }
                    suffix={
                      p.started != null ? (
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-px text-[9px] font-medium uppercase',
                            p.started ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {p.started ? 'run' : 'stop'}
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  )
}
