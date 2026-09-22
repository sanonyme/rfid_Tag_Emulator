import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { STANDARD_AUTOMATION_VARS } from '@/lib/automation-template'
import { cn } from '@/lib/utils'
import { Braces } from 'lucide-react'

export interface VariableAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
  rows?: number
  upstreamVariables?: string[]
  id?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
}

interface SuggestionItem {
  name: string
  label?: string
  isStandard?: boolean
}

export function VariableAutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
  rows = 3,
  upstreamVariables = [],
  id,
  onKeyDown,
}: VariableAutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [triggerPos, setTriggerPos] = useState<number>(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Combine standard and upstream variables
  const allSuggestions: SuggestionItem[] = useMemo(() => {
    const items: SuggestionItem[] = []
    const seen = new Set<string>()

    // Add upstream/custom vars first
    for (const v of upstreamVariables) {
      if (!v || seen.has(v)) continue
      seen.add(v)
      items.push({ name: v, label: 'Custom / Output var', isStandard: false })
    }

    // Add standard vars
    for (const s of STANDARD_AUTOMATION_VARS) {
      if (seen.has(s.name)) continue
      seen.add(s.name)
      items.push({ name: s.name, label: s.label, isStandard: true })
    }

    return items
  }, [upstreamVariables])

  // Filter based on typed text after `{{`
  const filtered = useMemo(() => {
    if (!open) return []
    const q = query.toLowerCase().trim()
    if (!q) return allSuggestions.slice(0, 12)
    return allSuggestions
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 12)
  }, [open, query, allSuggestions])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open])

  const checkTrigger = useCallback((text: string, cursor: number) => {
    const textBeforeCursor = text.slice(0, cursor)
    const lastTrigger = textBeforeCursor.lastIndexOf('{{')
    if (lastTrigger !== -1) {
      // Check that there's no closing `}}` between the trigger and the cursor
      const textBetween = textBeforeCursor.slice(lastTrigger + 2)
      if (!textBetween.includes('}}') && !textBetween.includes('\n')) {
        setTriggerPos(lastTrigger)
        setQuery(textBetween)
        setOpen(true)
        return
      }
    }
    setOpen(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    onChange(val)
    const cursor = e.target.selectionStart ?? val.length
    checkTrigger(val, cursor)
  }

  const insertVariable = (varName: string) => {
    const el = inputRef.current
    const cursor = el?.selectionStart ?? value.length
    const before = value.slice(0, triggerPos)
    // Find if there's already closing `}}` right after cursor
    const after = value.slice(cursor)
    const hasClosing = after.startsWith('}}')
    const nextVal = `${before}{{${varName}}}${hasClosing ? after.slice(2) : after}`
    onChange(nextVal)
    setOpen(false)

    // Put focus back and position cursor after `}}`
    setTimeout(() => {
      if (el) {
        el.focus()
        const nextCursor = before.length + varName.length + 4 // 4 for `{{` and `}}`
        el.setSelectionRange(nextCursor, nextCursor)
      }
    }, 0)
  }

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = filtered[selectedIndex]
        if (selected) {
          insertVariable(selected.name)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      {multiline ? (
        <Textarea
          id={id}
          ref={inputRef as any}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDownInternal}
          placeholder={placeholder}
          rows={rows}
          className={cn('font-mono text-xs', className)}
        />
      ) : (
        <Input
          id={id}
          ref={inputRef as any}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDownInternal}
          placeholder={placeholder}
          className={cn('font-mono text-xs', className)}
        />
      )}

      {open && filtered.length > 0 && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] max-h-[220px] overflow-y-auto rounded-lg border border-border/60 bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95 font-mono text-xs"
          role="listbox"
        >
          <div className="px-2 py-1 text-[10px] uppercase font-semibold text-muted-foreground border-b border-border/30 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Braces className="w-3 h-3 text-primary" /> Insert Variable
            </span>
            <span className="text-[9px] opacity-70">↑↓ Navigate · ↵ Select</span>
          </div>

          <div className="py-1">
            {filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={item.name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left transition-colors',
                    isSelected ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-muted/40',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertVariable(item.name)
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-primary font-bold">{`{{${item.name}}}`}</span>
                    {item.label && (
                      <span className="text-[11px] text-muted-foreground truncate opacity-80">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {item.isStandard ? (
                    <Badge variant="outline" className="text-[9px] py-0 px-1 opacity-60">
                      built-in
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] py-0 px-1 text-primary">
                      step var
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
