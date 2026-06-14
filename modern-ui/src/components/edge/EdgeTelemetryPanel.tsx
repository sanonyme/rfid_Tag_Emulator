import { useState } from 'react'
import { Activity, Check, Copy, RotateCcw, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn, formatTime } from '@/lib/utils'
import { sectionCard, sectionLabel } from '@/lib/ui-tokens'
import { fadeInUp, prefersReducedMotion } from '@/lib/motion'
import { toast } from 'sonner'

export type InvokeResponse = {
  blockName: string
  status: number
  formatted: string
  time: string
}

type EdgeTelemetryPanelProps = {
  log: string[]
  lastInvokeResponse: InvokeResponse | null
  onClear: () => void
  onReInvoke?: () => void
  logScrollRef: React.RefObject<HTMLDivElement>
}

function statusBadgeVariant(status: number): 'success' | 'warning' | 'destructive' {
  if (status >= 200 && status < 300) return 'success'
  if (status >= 400 && status < 500) return 'warning'
  return 'destructive'
}

export function EdgeTelemetryPanel({
  log,
  lastInvokeResponse,
  onClear,
  onReInvoke,
  logScrollRef,
}: EdgeTelemetryPanelProps) {
  const [copied, setCopied] = useState(false)
  const [responseTab, setResponseTab] = useState<'formatted' | 'raw'>('formatted')
  const reduced = prefersReducedMotion()

  const copyResponse = async () => {
    if (!lastInvokeResponse) return
    try {
      await navigator.clipboard.writeText(lastInvokeResponse.formatted)
      setCopied(true)
      toast.success('Response copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <div
      className={cn(
        sectionCard,
        'flex min-h-0 w-full flex-col overflow-hidden xl:w-[340px] xl:shrink-0',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-info" />
          <span className={sectionLabel}>Logs</span>
        </div>
        {(log.length > 0 || lastInvokeResponse) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div
          ref={logScrollRef}
          className="h-[min(120px,18vh)] shrink-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/30 bg-muted/15 p-2.5 overscroll-contain"
        >
          {log.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Invoke blocks and start/stop processes — activity appears here.
            </p>
          ) : (
            <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
              {log.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'break-all',
                    line.includes('✗') || line.includes('Error')
                      ? 'text-destructive'
                      : line.includes('▶') || line.includes('✓')
                        ? 'text-success'
                        : 'text-foreground/85',
                  )}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {lastInvokeResponse ? (
            <motion.div
              key={lastInvokeResponse.blockName + lastInvokeResponse.time}
              variants={fadeInUp}
              initial={reduced ? false : 'hidden'}
              animate="show"
              exit={reduced ? { opacity: 0 } : 'hidden'}
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/40 bg-background/90 ring-1 ring-border/20"
            >
              <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-border/30 bg-muted/25 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium">{lastInvokeResponse.blockName}</p>
                  <div className="mt-0.5">
                    <Badge variant={statusBadgeVariant(lastInvokeResponse.status)} className="text-[10px]">
                      HTTP {lastInvokeResponse.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-1">
                  {onReInvoke && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
                      onClick={onReInvoke}
                    >
                      <RotateCcw className="mr-1 h-3 w-3 shrink-0" />
                      Re-invoke
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-[4.75rem] shrink-0 justify-center px-2 text-[10px]"
                    onClick={() => void copyResponse()}
                  >
                    {copied ? (
                      <Check className="mr-1 h-3 w-3 shrink-0 text-success" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3 shrink-0" />
                    )}
                    <span className="w-[2.5rem] text-left">{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </div>

              <div className="flex shrink-0 gap-1 border-b border-border/20 px-2 py-1">
                {(['formatted', 'raw'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setResponseTab(tab)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] capitalize transition-colors',
                      responseTab === tab
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <pre className="m-0 min-h-0 flex-1 overflow-auto p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground/90">
                {responseTab === 'formatted'
                  ? lastInvokeResponse.formatted
                  : lastInvokeResponse.formatted}
              </pre>
            </motion.div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/30 p-4">
              <p className="text-center text-xs text-muted-foreground">
                Response inspector — invoke a block to see output here.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function formatInvokeResponseBody(body: string | null): string {
  const raw = body?.trim() ?? ''
  if (!raw) return '(empty body)'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function createInvokeResponse(
  blockName: string,
  status: number,
  body: string | null,
  maxChars: number,
): InvokeResponse {
  let formatted = formatInvokeResponseBody(body)
  if (formatted.length > maxChars) {
    formatted = `${formatted.slice(0, maxChars)}\n… (truncated)`
  }
  return { blockName, status, formatted, time: formatTime() }
}
