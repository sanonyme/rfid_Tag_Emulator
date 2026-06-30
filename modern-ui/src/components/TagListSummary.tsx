import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip'
import { ScrollArea } from './ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { validateTagList, type TagListKind } from '@/lib/tag-list-validation'

interface TagListSummaryProps {
  value: string
  kind: TagListKind
  variant?: 'default' | 'compact'
  className?: string
}

/**
 * Tiny inline summary that lives in the header of a tag-list card.
 *
 * Shows "→ N EPCs" when everything is clean and "→ N EPCs · M errors" when
 * one or more lines are invalid. Clicking opens a dialog listing the offending
 * lines with the parser's reason for each.
 */
export function TagListSummary({ value, kind, variant = 'default', className }: TagListSummaryProps) {
  const [open, setOpen] = useState(false)
  const debouncedValue = useDebouncedValue(value, 120)
  const result = useMemo(() => validateTagList(debouncedValue, kind), [debouncedValue, kind])

  if (result.nonBlankLines === 0) return null

  const hasErrors = result.invalidLines > 0
  const baseColor = hasErrors
    ? 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
    : 'text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'

  const triggerLabel = `${result.totalTags.toLocaleString()} EPC${result.totalTags === 1 ? '' : 's'}`
  const errorLabel = hasErrors
    ? `${result.invalidLines} error${result.invalidLines === 1 ? '' : 's'}`
    : null

  return (
    <>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => hasErrors && setOpen(true)}
            disabled={!hasErrors}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-medium leading-5 transition-colors',
              variant === 'compact' ? 'h-5' : 'h-6 px-2 text-[11px]',
              baseColor,
              !hasErrors && 'cursor-default',
              hasErrors && 'cursor-pointer',
              className,
            )}
          >
            {hasErrors ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            <span>→ {triggerLabel}</span>
            {errorLabel && (
              <>
                <span className="opacity-60">·</span>
                <span>{errorLabel}</span>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[18rem] text-xs">
          {hasErrors
            ? `${result.validLines} line${result.validLines === 1 ? '' : 's'} ok, ${result.invalidLines} invalid — click to see what was skipped.`
            : `${result.validLines} line${result.validLines === 1 ? '' : 's'}, ${result.totalTags} tag${result.totalTags === 1 ? '' : 's'} ready to send.`}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invalid lines in {kind.toUpperCase()} list</DialogTitle>
            <DialogDescription>
              These lines are skipped when you send. Fix or delete them so the count matches what
              you expect.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[300px] rounded-md border bg-muted/10">
            {result.invalidLinesTruncated && (
              <p className="border-b border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Showing first {result.lines.length} of {result.invalidLines.toLocaleString()} invalid
                lines.
              </p>
            )}
            <ul className="divide-y divide-border/40">
              {result.lines.map((line) => (
                  <li key={line.lineNumber} className="space-y-1 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        line {line.lineNumber}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">{line.error}</span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/20 px-2 py-1 font-mono text-[11px]">
                      {line.raw || '(empty)'}
                    </pre>
                  </li>
                ))}
            </ul>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
