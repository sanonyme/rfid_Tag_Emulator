import { useState, useMemo } from 'react'
import { Search, Plus, Sparkles, GripVertical, Layers } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { ActionType, AutomationSequence } from '@/lib/automation-types'
import {
  NODE_CATEGORY_META,
  searchCatalog,
  type NodeCategory,
  type NodeCatalogEntry,
} from '@/lib/automation-node-catalog'
import { NODE_VISUAL_STYLES } from '@/lib/automation-node-styles'
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@/lib/automation-templates'
import { cn } from '@/lib/utils'

export const DND_NODE_MIME = 'application/zeus-automation-node'

const CATEGORY_FILTER_OPTIONS: { value: NodeCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'devices', label: 'Devices' },
  { value: 'data', label: 'Data' },
  { value: 'flow', label: 'Flow' },
  { value: 'edge', label: 'Edge' },
  { value: 'utility', label: 'Util' },
]

export function NodeLibraryDrawer({
  disabled,
  onAddNode,
}: {
  disabled?: boolean
  onAddNode: (type: ActionType) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<NodeCategory | 'all'>('all')

  const groups = useMemo(() => {
    const matches = searchCatalog(query).filter(
      (entry) => category === 'all' || entry.category === category,
    )
    const byCat = new Map<NodeCategory, NodeCatalogEntry[]>()
    for (const entry of matches) {
      const arr = byCat.get(entry.category) ?? []
      arr.push(entry)
      byCat.set(entry.category, arr)
    }
    return Array.from(byCat.entries()).sort(
      (a, b) => NODE_CATEGORY_META[a[0]].order - NODE_CATEGORY_META[b[0]].order,
    )
  }, [query, category])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/50 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 30+ nodes…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors',
                category === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No nodes match “{query}”.</p>
        ) : (
          groups.map(([cat, entries]) => (
            <div key={cat} className="space-y-1">
              <p className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {NODE_CATEGORY_META[cat].label}
              </p>
              <div className="space-y-1">
                {entries.map((entry) => {
                  const visual = NODE_VISUAL_STYLES[entry.type]
                  const Icon = visual.Icon
                  return (
                    <div
                      key={entry.type}
                      draggable={!disabled}
                      onDragStart={(e) => {
                        if (disabled) return
                        e.dataTransfer.setData(DND_NODE_MIME, entry.type)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => !disabled && onAddNode(entry.type)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                          e.preventDefault()
                          onAddNode(entry.type)
                        }
                      }}
                      title="Drag onto canvas or click to add"
                      className={cn(
                        'group flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-2 py-1.5 transition-all select-none',
                        disabled
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm',
                      )}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1',
                          visual.iconBg,
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5', visual.iconText)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground">{entry.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{entry.description}</div>
                      </div>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/40 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        Drag any node onto the canvas, or click to insert.
      </div>
    </div>
  )
}

export function WorkflowTemplatesDrawer({
  onInsertSequences,
  onLoadFullDemo,
}: {
  onInsertSequences: (seqs: AutomationSequence[], templateName: string) => void
  onLoadFullDemo: () => void
}) {
  const [filter, setFilter] = useState('')

  const items = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return WORKFLOW_TEMPLATES
    return WORKFLOW_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    )
  }, [filter])

  const handleUse = (tpl: WorkflowTemplate) => {
    onInsertSequences(tpl.build(), tpl.name)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/50 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search templates…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadFullDemo}
          className="h-8 w-full justify-start gap-2 border-primary/30 bg-primary/5 text-xs text-primary hover:bg-primary/10"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Load Full Showcase Demo
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {items.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-xl border border-border/50 bg-background/60 p-2.5 space-y-2 transition-colors hover:border-primary/40 hover:bg-accent/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-snug text-foreground">{tpl.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9.5px] font-medium">
                    {tpl.category}
                  </Badge>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Layers className="h-2.5 w-2.5" />
                    {tpl.nodeCount} nodes
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{tpl.description}</p>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={() => handleUse(tpl)}
            >
              <Plus className="h-3 w-3" />
              Insert Template
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
