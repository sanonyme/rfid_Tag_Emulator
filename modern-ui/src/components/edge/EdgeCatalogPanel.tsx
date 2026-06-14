import { Box, Search, Star, Workflow } from 'lucide-react'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { sectionCard, sectionLabel } from '@/lib/ui-tokens'
import type { EdgeBlockInfo, EdgeProcessInfo } from '@/lib/edge-api-client'

type EdgeCatalogPanelProps = {
  uiEnabled: boolean
  blocks: EdgeBlockInfo[]
  processes: EdgeProcessInfo[]
  search: string
  onSearchChange: (v: string) => void
  pinnedBlocks: string[]
  pinnedProcesses: string[]
  onSelectBlock: (name: string) => void
  onSelectProcess: (name: string) => void
  onTogglePinBlock: (name: string) => void
  onTogglePinProcess: (name: string) => void
}

function CatalogCard({
  name,
  type,
  pinned,
  running,
  disabled,
  onSelect,
  onTogglePin,
}: {
  name: string
  type: 'block' | 'process'
  pinned: boolean
  running?: boolean
  disabled: boolean
  onSelect: () => void
  onTogglePin: () => void
}) {
  return (
    <div
      className={cn(
        sectionCard,
        'group relative flex flex-col gap-2 p-3 transition-all duration-200 hover:shadow-elev-md hover:-translate-y-0.5',
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="smooth-press flex min-w-0 flex-1 flex-col items-start gap-2 text-left disabled:opacity-50"
      >
        <div className="flex w-full items-center gap-2">
          {type === 'block' ? (
            <Box className="h-4 w-4 shrink-0 text-info" />
          ) : (
            <Workflow className="h-4 w-4 shrink-0 text-primary" />
          )}
          <Badge variant="outline" className="text-[9px] capitalize">
            {type}
          </Badge>
          {running != null && (
            <Badge variant={running ? 'success' : 'secondary'} className="ml-auto text-[9px]">
              {running ? 'Running' : 'Stopped'}
            </Badge>
          )}
        </div>
        <span className="line-clamp-2 font-mono text-sm font-medium leading-snug">{name}</span>
      </button>
      <button
        type="button"
        onClick={onTogglePin}
        className={cn(
          'absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100',
          pinned && 'opacity-100 text-warning',
        )}
        title={pinned ? 'Unpin' : 'Pin'}
      >
        <Star className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
      </button>
    </div>
  )
}

export function EdgeCatalogPanel({
  uiEnabled,
  blocks,
  processes,
  search,
  onSearchChange,
  pinnedBlocks,
  pinnedProcesses,
  onSelectBlock,
  onSelectProcess,
  onTogglePinBlock,
  onTogglePinProcess,
}: EdgeCatalogPanelProps) {
  const q = search.trim().toLowerCase()
  const filteredBlocks = q ? blocks.filter((b) => b.name.toLowerCase().includes(q)) : blocks
  const filteredProcesses = q ? processes.filter((p) => p.name.toLowerCase().includes(q)) : processes

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Catalog</h3>
          <p className="text-sm text-muted-foreground">
            Browse all blocks and workflows — click to open in Operate mode
          </p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search catalog…"
            className="h-9 pl-9 font-mono text-sm"
            disabled={!uiEnabled}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pinnedBlocks.length > 0 && (
          <section className="mb-6">
            <span className={sectionLabel}>Pinned blocks</span>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {blocks
                .filter((b) => pinnedBlocks.includes(b.name))
                .map((b) => (
                  <CatalogCard
                    key={`pin-${b.name}`}
                    name={b.name}
                    type="block"
                    pinned
                    disabled={!uiEnabled}
                    onSelect={() => onSelectBlock(b.name)}
                    onTogglePin={() => onTogglePinBlock(b.name)}
                  />
                ))}
            </div>
          </section>
        )}

        <section className="mb-6">
          <span className={sectionLabel}>
            Blocks <span className="font-normal normal-case">({filteredBlocks.length})</span>
          </span>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBlocks.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No blocks found.</p>
            ) : (
              filteredBlocks.map((b) => (
                <CatalogCard
                  key={b.name}
                  name={b.name}
                  type="block"
                  pinned={pinnedBlocks.includes(b.name)}
                  disabled={!uiEnabled}
                  onSelect={() => onSelectBlock(b.name)}
                  onTogglePin={() => onTogglePinBlock(b.name)}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <span className={sectionLabel}>
            Processes <span className="font-normal normal-case">({filteredProcesses.length})</span>
          </span>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProcesses.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No processes found.
              </p>
            ) : (
              filteredProcesses.map((p) => (
                <CatalogCard
                  key={p.name}
                  name={p.name}
                  type="process"
                  pinned={pinnedProcesses.includes(p.name)}
                  running={p.started}
                  disabled={!uiEnabled}
                  onSelect={() => onSelectProcess(p.name)}
                  onTogglePin={() => onTogglePinProcess(p.name)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
