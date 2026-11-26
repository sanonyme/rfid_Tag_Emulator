import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, CornerDownLeft } from 'lucide-react'
import type { ActionType } from '@/lib/automation-types'
import {
  NODE_CATEGORY_META,
  searchCatalog,
  type NodeCategory,
  type NodeCatalogEntry,
} from '@/lib/automation-node-catalog'
import { NODE_VISUAL_STYLES } from '@/lib/automation-node-styles'
import { cn } from '@/lib/utils'

interface NodePaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (type: ActionType) => void
}

/**
 * A command-palette style node picker (⌘K feel): fuzzy search across every node
 * type, grouped by category, fully keyboard-navigable. Replaces the old flat
 * add-menu so large node libraries stay fast to browse.
 */
export function NodePalette({ open, onOpenChange, onSelect }: NodePaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchCatalog(query), [query])

  // Group results by category, preserving catalog rank order within each group.
  const groups = useMemo(() => {
    const byCat = new Map<NodeCategory, NodeCatalogEntry[]>()
    for (const entry of results) {
      const arr = byCat.get(entry.category) ?? []
      arr.push(entry)
      byCat.set(entry.category, arr)
    }
    return Array.from(byCat.entries()).sort(
      (a, b) => NODE_CATEGORY_META[a[0]].order - NODE_CATEGORY_META[b[0]].order,
    )
  }, [results])

  // Flat order matches visual order — used for keyboard navigation.
  const flat = useMemo(() => groups.flatMap(([, entries]) => entries), [groups])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus the input once the palette has mounted/animated in.
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keep the active row scrolled into view.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const choose = useCallback(
    (type: ActionType) => {
      onSelect(type)
      onOpenChange(false)
    },
    [onSelect, onOpenChange],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = flat[activeIndex]
      if (entry) choose(entry.type)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onOpenChange(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-node-palette
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[10vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={() => onOpenChange(false)}
        >
          <motion.div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add node"
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search nodes — try “http”, “loop”, “random”…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto overscroll-contain py-2">
              {flat.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No nodes match “{query}”.
                </p>
              ) : (
                groups.map(([cat, entries]) => (
                  <div key={cat} className="mb-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {NODE_CATEGORY_META[cat].label}
                    </p>
                    {entries.map((entry) => {
                      const idx = flat.indexOf(entry)
                      const active = idx === activeIndex
                      const visual = NODE_VISUAL_STYLES[entry.type]
                      const Icon = visual.Icon
                      return (
                        <button
                          key={entry.type}
                          data-idx={idx}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => choose(entry.type)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus:outline-none',
                            active ? 'bg-accent' : 'hover:bg-accent/50',
                          )}
                        >
                          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1', visual.iconBg)}>
                            <Icon className={cn('h-4 w-4', visual.iconText)} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-foreground">{entry.label}</span>
                              <span className="shrink-0 rounded bg-muted/70 px-1 py-px font-mono text-[9px] font-semibold text-muted-foreground">
                                {visual.badge}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>
                          </span>
                          {active && (
                            <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><kbd className="rounded border border-border/60 bg-muted px-1">↑</kbd><kbd className="rounded border border-border/60 bg-muted px-1">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border/60 bg-muted px-1">↵</kbd> add</span>
              <span className="ml-auto tabular-nums">{flat.length} node{flat.length !== 1 ? 's' : ''}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
