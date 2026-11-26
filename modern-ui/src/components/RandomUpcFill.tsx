import { useCallback, useState } from 'react'
import { Dices, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '@/lib/utils'
import { loadDbCredentials } from '@/lib/db-credentials'
import {
  fetchRandomItemUpcLines,
  generateRandomUpcLines,
  type RandomUpcSource,
} from '@/lib/random-upc'

interface RandomUpcFillProps {
  host: string
  onApply: (content: string, mode: 'replace' | 'append') => void
  /** Icon button styled like ExpandableTagField’s expand / defined-items controls. */
  trigger?: 'default' | 'icon'
  className?: string
}

export function RandomUpcFill({
  host,
  onApply,
  trigger = 'icon',
  className,
}: RandomUpcFillProps) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<RandomUpcSource>('item')
  const [lineCount, setLineCount] = useState('10')
  const [countPer, setCountPer] = useState('1')
  const [loading, setLoading] = useState(false)

  const apply = useCallback(
    async (mode: 'replace' | 'append') => {
      const n = parseInt(lineCount, 10)
      const count = parseInt(countPer, 10)
      if (!Number.isFinite(n) || n < 1) {
        toast.error('Enter how many UPCs to generate')
        return
      }
      if (!Number.isFinite(count) || count < 1) {
        toast.error('Count per UPC must be at least 1')
        return
      }

      setLoading(true)
      try {
        if (source === 'generated') {
          const result = generateRandomUpcLines(n, count)
          onApply(result.text, mode)
          toast.success(
            mode === 'append'
              ? `Appended ${result.itemCount} generated UPC line${result.itemCount === 1 ? '' : 's'}`
              : `Generated ${result.itemCount} random UPC line${result.itemCount === 1 ? '' : 's'} (${result.tagCount} tags)`,
          )
          setOpen(false)
          return
        }

        if (!host.trim()) {
          toast.error('Enter the host IP first')
          return
        }

        const creds = await loadDbCredentials()
        if (!creds) {
          toast.error('Save MySQL credentials in the Database tab first (with “Remember credentials”).')
          return
        }

        const result = await fetchRandomItemUpcLines(host, creds.user, creds.pass, n, count)
        onApply(result.text, mode)
        const short = result.itemCount < n ? ` (only ${result.itemCount} available)` : ''
        toast.success(
          mode === 'append'
            ? `Appended ${result.itemCount} random UPC${result.itemCount === 1 ? '' : 's'} from ${result.database}.item${short}`
            : `Loaded ${result.itemCount} random UPC${result.itemCount === 1 ? '' : 's'} from ${result.database}.item${short}`,
        )
        setOpen(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to fill random UPCs')
      } finally {
        setLoading(false)
      }
    },
    [countPer, host, lineCount, onApply, source],
  )

  const openDialog = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  const iconButtonClassName = cn(
    'pointer-events-auto h-8 w-8 shrink-0 rounded-md',
    'border border-border/60 bg-background/90 shadow-sm backdrop-blur-sm',
    'hover:bg-accent hover:text-accent-foreground',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    className,
  )

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
              aria-label="Random UPCs"
              onClick={openDialog}
            >
              <Dices className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[14rem] text-xs">
            Fill random UPCs from the item table or generate new ones
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('gap-1.5', className)}
          onClick={openDialog}
        >
          <Dices className="h-3.5 w-3.5" />
          Random UPCs
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Random UPCs</DialogTitle>
              <DialogDescription>
                Fill the UPC list with random barcodes from the database, or generate new GTINs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="random-upc-source">Source</Label>
                <Select
                  value={source}
                  onValueChange={(value) => setSource(value as RandomUpcSource)}
                  disabled={loading}
                >
                  <SelectTrigger id="random-upc-source" className="h-10 text-sm shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="item">From item table</SelectItem>
                    <SelectItem value="generated">Generated</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {source === 'item'
                    ? 'Picks random numeric barcodes from item.barcode (ats_db_staging / ats_db)'
                    : 'Creates random 14-digit GTINs with a valid check digit'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="random-upc-lines">UPC lines</Label>
                  <Input
                    id="random-upc-lines"
                    type="number"
                    min={1}
                    max={500}
                    value={lineCount}
                    onChange={(e) => setLineCount(e.target.value)}
                    disabled={loading}
                    className="h-10 font-mono text-sm shadow-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="random-upc-count">Count each</Label>
                  <Input
                    id="random-upc-count"
                    type="number"
                    min={1}
                    max={9999}
                    value={countPer}
                    onChange={(e) => setCountPer(e.target.value)}
                    disabled={loading}
                    className="h-10 font-mono text-sm shadow-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void apply('replace')}
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Dices className="h-4 w-4" />}
                  Use random
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => void apply('append')}
                >
                  Append
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
