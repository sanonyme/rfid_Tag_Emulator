import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Check, Database, Package, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { loadDbCredentials } from '@/lib/db-credentials'
import {
  definedItemsToUpcLines,
  fetchDefinedItems,
  type DefinedItem,
} from '@/lib/defined-items'

interface DefinedItemsPickerProps {
  host: string
  connected: boolean
  onApply: (content: string, mode: 'replace' | 'append') => void
  variant?: 'compact' | 'default'
  /** Icon button styled like ExpandableTagField’s expand control. */
  trigger?: 'default' | 'icon'
  className?: string
}

export const DefinedItemsPicker = memo(function DefinedItemsPicker({
  host,
  connected,
  onApply,
  variant = 'compact',
  trigger = 'default',
  className,
}: DefinedItemsPickerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<DefinedItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [database, setDatabase] = useState<string | null>(null)
  const [skippedNonNumeric, setSkippedNonNumeric] = useState(0)
  const [error, setError] = useState('')
  const [defaultCount, setDefaultCount] = useState('1')
  const [search, setSearch] = useState('')

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.barcode.toLowerCase().includes(q))
  }, [items, search])

  const loadItems = useCallback(async () => {
    if (!host.trim()) {
      setError('Connect to a host IP first')
      return
    }

    setLoading(true)
    setError('')
    try {
      const creds = await loadDbCredentials()
      if (!creds) {
        setError('Save MySQL credentials in the Database tab first (with “Remember credentials”).')
        return
      }

      const result = await fetchDefinedItems(host, creds.user, creds.pass)
      setItems(result.items)
      setDatabase(result.database)
      setSkippedNonNumeric(result.skippedNonNumeric)
      setSelected(new Set(result.items.map((item) => item.barcode)))
      if (result.items.length === 0) {
        setError(`No numeric barcodes found in ${result.database}.item`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load defined items'
      setError(msg)
      setItems([])
      setDatabase(null)
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }, [host])

  useEffect(() => {
    if (open && host.trim()) {
      void loadItems()
    }
  }, [open, host, loadItems])

  const toggleItem = (barcode: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(barcode)) next.delete(barcode)
      else next.add(barcode)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelected(new Set(filteredItems.map((item) => item.barcode)))
  }

  const clearSelection = () => setSelected(new Set())

  const selectedItems = items.filter((item) => selected.has(item.barcode))

  const applySelection = (mode: 'replace' | 'append') => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one item')
      return
    }
    const count = parseInt(defaultCount, 10)
    const lines = definedItemsToUpcLines(selectedItems, Number.isFinite(count) ? count : 1)
    onApply(lines, mode)
    toast.success(
      mode === 'append'
        ? `Appended ${selectedItems.length} UPC line(s)`
        : `Loaded ${selectedItems.length} UPC line(s)`,
    )
    setOpen(false)
  }

  const triggerTitle = connected
    ? 'Load UPCs from item.barcode in ats_db_staging / ats_db'
    : 'Connect to the host IP first'

  const openPicker = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!host.trim()) {
      toast.error('Connect to a host IP first')
      return
    }
    setOpen(true)
  }

  const iconButtonClassName = cn(
    'pointer-events-auto h-8 w-8 shrink-0 rounded-md',
    'border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
    'hover:bg-accent hover:text-accent-foreground',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setItems([])
      setSelected(new Set())
      setSearch('')
      setError('')
      setDatabase(null)
      setSkippedNonNumeric(0)
    }
  }

  return (
    <>
      {trigger === 'icon' ? (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={iconButtonClassName}
              aria-label="Defined items"
              onClick={openPicker}
            >
              <Package className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[14rem] text-xs">
            {triggerTitle}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={variant === 'compact' ? 'sm' : 'default'}
          disabled={!connected || !host.trim()}
          className={cn('gap-1.5', className)}
          title={triggerTitle}
          onClick={openPicker}
        >
          <Package className="h-3.5 w-3.5" />
          Defined items
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
      {open ? (
      <DialogContent className="max-h-[85vh] flex max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Defined items</DialogTitle>
          <DialogDescription>
            UPC barcodes from <span className="font-mono">item.barcode</span> on{' '}
            <span className="font-mono">ats_db_staging</span> or{' '}
            <span className="font-mono">ats_db</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {database && (
            <Badge variant="secondary" className="gap-1 font-mono text-[10px] font-normal">
              <Database className="h-3 w-3" />
              {database}
            </Badge>
          )}
          <Badge variant="outline" className="font-mono text-[10px] font-normal">
            {items.length} item{items.length === 1 ? '' : 's'}
          </Badge>
          {skippedNonNumeric > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Skipped {skippedNonNumeric} non-numeric barcode{skippedNonNumeric === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="defined-items-search" className="text-xs">
              Search
            </Label>
            <Input
              id="defined-items-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter barcodes…"
              className="h-9 font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defined-items-count" className="text-xs">
              Count each
            </Label>
            <Input
              id="defined-items-count"
              type="number"
              min="1"
              value={defaultCount}
              onChange={(e) => setDefaultCount(e.target.value)}
              className="h-9 w-20 font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={selectAllVisible}>
            Select all
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={clearSelection}>
            Clear
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 px-2.5"
            onClick={() => void loadItems()}
            disabled={loading}
            title="Refresh from database"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        <ScrollArea className="h-[min(42vh,360px)] min-h-[180px] rounded-lg border border-border/50 pr-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading items…</div>
          ) : error ? (
            <div className="px-3 py-8 text-center text-sm text-destructive">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No matching barcodes</div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredItems.map((item) => {
                const checked = selected.has(item.barcode)
                return (
                  <button
                    key={item.barcode}
                    type="button"
                    onClick={() => toggleItem(item.barcode)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors',
                      checked ? 'border-primary/25 bg-primary/5' : 'hover:bg-muted/60',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span className="font-mono text-sm">{item.barcode}</span>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={loading || selectedItems.length === 0}
            onClick={() => applySelection('replace')}
          >
            Use selected ({selectedItems.length})
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={loading || selectedItems.length === 0}
            onClick={() => applySelection('append')}
          >
            Append selected
          </Button>
        </div>
      </DialogContent>
      ) : null}
      </Dialog>
    </>
  )
})
