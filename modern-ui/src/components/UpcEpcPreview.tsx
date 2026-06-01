import { useMemo, useState } from 'react'
import { Copy, Eye, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildUpcEpcPreview, buildUpcEpcPreviewSummary } from '@/lib/upc-epc-preview'
import { validateTagList } from '@/lib/tag-list-validation'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'

interface UpcEpcPreviewProps {
  upcList: string
  startSerial: string | number | undefined
  serialContinuesAcrossUpcLines: boolean
  className?: string
}

function truncateEpc(epc: string, max = 28): string {
  if (epc.length <= max) return epc
  return `${epc.slice(0, 14)}…${epc.slice(-10)}`
}

export function UpcEpcPreview({
  upcList,
  startSerial,
  serialContinuesAcrossUpcLines,
  className,
}: UpcEpcPreviewProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const debouncedUpcList = useDebouncedValue(upcList, 120)

  const preview = useMemo(
    () => buildUpcEpcPreviewSummary(debouncedUpcList, startSerial, serialContinuesAcrossUpcLines),
    [debouncedUpcList, startSerial, serialContinuesAcrossUpcLines],
  )

  const validation = useMemo(() => validateTagList(debouncedUpcList, 'upc'), [debouncedUpcList])

  const fullPreview = useMemo(() => {
    if (!open) return null
    return buildUpcEpcPreview(debouncedUpcList, startSerial, serialContinuesAcrossUpcLines)
  }, [open, debouncedUpcList, startSerial, serialContinuesAcrossUpcLines])

  if (preview.count === 0) return null

  const skipped =
    validation.totalTags > preview.count
      ? validation.totalTags - preview.count
      : 0

  const handleCopyAll = async () => {
    const tags = fullPreview?.tags ?? buildUpcEpcPreview(debouncedUpcList, startSerial, serialContinuesAcrossUpcLines).tags
    const text = tags.map((t) => t.epc).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div
        className={cn(
          'rounded-lg border border-border/35 bg-muted/15 px-3 py-2.5 ring-1 ring-border/15',
          className,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Will send{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {preview.count.toLocaleString()}
              </span>{' '}
              EPC{preview.count === 1 ? '' : 's'}
              {serialContinuesAcrossUpcLines ? ' · serial continues across lines' : ''}
            </p>
            {preview.count === 1 && preview.firstEpc ? (
              <code className="block break-all font-mono text-[11px] text-foreground/90">
                {preview.firstEpc}
              </code>
            ) : (
              <div className="space-y-1 text-[11px]">
                {preview.firstEpc && (
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="shrink-0 text-muted-foreground">First</span>
                    <code className="break-all font-mono text-foreground/90" title={preview.firstEpc}>
                      {truncateEpc(preview.firstEpc)}
                    </code>
                  </div>
                )}
                {preview.lastEpc && preview.lastEpc !== preview.firstEpc && (
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="shrink-0 text-muted-foreground">Last</span>
                    <code className="break-all font-mono text-foreground/90" title={preview.lastEpc}>
                      {truncateEpc(preview.lastEpc)}
                    </code>
                  </div>
                )}
              </div>
            )}
            {skipped > 0 && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                {skipped} tag{skipped === 1 ? '' : 's'} from invalid lines will be skipped at send time.
              </p>
            )}
          </div>
          {preview.count > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 rounded-md px-2 text-[10px] shadow-none"
              onClick={() => setOpen(true)}
            >
              <Eye className="h-3 w-3" />
              View all
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Generated EPC preview</DialogTitle>
            <DialogDescription>
              SGTIN-96 hex from your UPC lines (starting serial {String(startSerial || '1')}
              {serialContinuesAcrossUpcLines ? ', continuing across lines' : ', per line'}).
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[min(50vh,360px)] rounded-md border bg-muted/10">
            <ol className="divide-y divide-border/40 font-mono text-[11px]">
              {(fullPreview?.tags ?? []).map((tag, index) => (
                <li key={`${index}-${tag.epc}`} className="flex gap-2 px-3 py-2">
                  <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{index + 1}.</span>
                  <span className="min-w-0 break-all text-foreground">{tag.epc}</span>
                  {tag.customTid && (
                    <span className="shrink-0 text-muted-foreground">TID {tag.customTid}</span>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={handleCopyAll} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy all EPCs'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
