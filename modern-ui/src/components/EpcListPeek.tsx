import { useMemo } from 'react'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { summarizeEpcList } from '@/lib/epc-identify'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'

function shortenHex(hex: string, head = 8, tail = 4): string {
  if (hex.length <= head + tail + 1) return hex
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`
}

interface EpcListPeekProps {
  value: string
  className?: string
}

export function EpcListPeek({ value, className }: EpcListPeekProps) {
  const debounced = useDebouncedValue(value, 120)
  const summary = useMemo(() => summarizeEpcList(debounced), [debounced])

  if (summary.valid === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground',
          className,
        )}
      >
        <p className="font-medium text-foreground/80">Line format</p>
        <ul className="mt-1.5 space-y-0.5 font-mono text-[10px]">
          <li>EPC</li>
          <li>EPC,TID</li>
          <li>EPC,,userdata</li>
          <li>EPC,TID,userdata</li>
        </ul>
        <p className="mt-2 text-[10px]">Drop a .txt / .csv, or generate with Inditex / scheme in the header.</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-muted/10',
        className,
      )}
    >
      <div className="flex flex-wrap gap-1.5 border-b border-border/40 px-2.5 py-1.5">
        {summary.schemeCounts.slice(0, 4).map((entry) => (
          <span
            key={entry.scheme}
            className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 ring-1 ring-border/40"
          >
            {entry.scheme}
            <span className="ml-1 text-muted-foreground">×{entry.count}</span>
          </span>
        ))}
        {summary.schemeCounts.length > 4 && (
          <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
            +{summary.schemeCounts.length - 4} more
          </span>
        )}
        {summary.withTid > 0 && (
          <span className="px-1 py-0.5 text-[10px] text-muted-foreground">TID ×{summary.withTid}</span>
        )}
        {summary.withUserdata > 0 && (
          <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
            userdata ×{summary.withUserdata}
          </span>
        )}
      </div>
      <ScrollArea className="max-h-[9.5rem]">
        <ul className="divide-y divide-border/30">
          {summary.rows.map((row) => (
            <li key={row.lineNumber} className="flex items-baseline gap-2 px-2.5 py-1.5 font-mono text-[10px]">
              <span className="w-7 shrink-0 text-muted-foreground">{row.lineNumber}</span>
              <span className="min-w-0 flex-1 truncate text-foreground" title={row.epc}>
                {shortenHex(row.epc)}
              </span>
              <span className="shrink-0 text-muted-foreground">{row.scheme}</span>
              <span className="w-8 shrink-0 text-right text-muted-foreground">{row.bits}</span>
              {row.tid ? (
                <span className="shrink-0 text-sky-600 dark:text-sky-400" title={row.tid}>
                  TID
                </span>
              ) : null}
              {row.userdata ? (
                <span className="shrink-0 text-violet-600 dark:text-violet-400" title={row.userdata}>
                  UD
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {summary.rowsTruncated && (
          <p className="border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground">
            Showing first {summary.rows.length} of {summary.valid.toLocaleString()} EPCs
          </p>
        )}
      </ScrollArea>
    </div>
  )
}
