import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Loader2, RotateCcw, Square, Workflow } from 'lucide-react'
import type { EdgeBlockParam, EdgeLogicalDevice, EdgeProcessInfo } from '@/lib/edge-api-client'
import { edgeParamInvokeKey, isLogicalDeviceParam } from '@/lib/edge-api-types'
import { formatTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { SendButton } from '../SendControls'
import { cn } from '@/lib/utils'
import type { WorkspaceTarget } from './EdgeLibraryPanel'

const MAX_RESPONSE_CHARS = 12_000

function formatBody(body: string | null): string {
  const raw = body?.trim() ?? ''
  if (!raw) return '(empty body)'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

type EdgeActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: WorkspaceTarget | null
  uiEnabled: boolean
  processInfo?: EdgeProcessInfo
  fetchBlockParams: (name: string) => Promise<EdgeBlockParam[]>
  listLogicalDevices: () => Promise<EdgeLogicalDevice[]>
  invokeBlock: (
    name: string,
    params: Record<string, unknown>,
    order: string[],
  ) => Promise<{ status: number; response: string | null }>
  startProcess: (name: string) => Promise<void>
  stopProcess: (name: string) => Promise<void>
  onProcessUsed?: (name: string) => void
}

export function EdgeActionDialog({
  open,
  onOpenChange,
  target,
  uiEnabled,
  processInfo,
  fetchBlockParams,
  listLogicalDevices,
  invokeBlock,
  startProcess,
  stopProcess,
  onProcessUsed,
}: EdgeActionDialogProps) {
  const [paramDefs, setParamDefs] = useState<EdgeBlockParam[]>([])
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [loadingParams, setLoadingParams] = useState(false)
  const [logicalDevices, setLogicalDevices] = useState<EdgeLogicalDevice[]>([])
  const [invoking, setInvoking] = useState(false)
  const [processAction, setProcessAction] = useState<'start' | 'stop' | null>(null)
  const [responseText, setResponseText] = useState<string | null>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)
  const paramCache = useRef<Record<string, Record<string, string>>>({})

  const blockName = target?.type === 'block' ? target.name : ''
  const processName = target?.type === 'process' ? target.name : ''
  const isBlock = target?.type === 'block'
  const running = processInfo?.started === true

  useEffect(() => {
    if (!open || !target) return
    setResponseText(null)
    setHttpStatus(null)
  }, [open, target?.name, target?.type])

  useEffect(() => {
    if (!open || !blockName || !uiEnabled) {
      setParamDefs([])
      setParamValues({})
      return
    }

    let cancelled = false
    setLoadingParams(true)

    const loadId = window.setTimeout(() => {
      void (async () => {
        try {
          const defs = await fetchBlockParams(blockName)
          if (cancelled) return
          setParamDefs(defs)
          const saved = paramCache.current[blockName]
          const initial: Record<string, string> = {}
          for (const p of defs) {
            const legacyKey = p.type ? `${p.name}:${p.type}` : p.name
            initial[p.name] = saved?.[p.name] ?? saved?.[legacyKey] ?? p.defaultValue ?? ''
          }
          if (saved) {
            for (const [k, v] of Object.entries(saved)) {
              const clean = edgeParamInvokeKey(k)
              if (clean !== k && initial[clean] === '') initial[clean] = v
            }
          }
          setParamValues(initial)
        } catch (e: unknown) {
          if (cancelled) return
          toast.error(e instanceof Error ? e.message : String(e))
          setParamDefs([])
          setParamValues({})
        } finally {
          if (!cancelled) setLoadingParams(false)
        }
      })()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(loadId)
    }
  }, [open, blockName, uiEnabled, fetchBlockParams])

  const needsDevices = paramDefs.some(isLogicalDeviceParam)

  useEffect(() => {
    if (!open || !uiEnabled || !needsDevices) {
      setLogicalDevices([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const devices = await listLogicalDevices()
        if (!cancelled) setLogicalDevices(devices)
      } catch {
        if (!cancelled) setLogicalDevices([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, uiEnabled, needsDevices, listLogicalDevices])

  const setParam = (name: string, value: string) => {
    setParamValues((prev) => {
      const next = { ...prev, [name]: value }
      if (blockName) paramCache.current[blockName] = next
      return next
    })
  }

  const resetParams = () => {
    const initial: Record<string, string> = {}
    for (const p of paramDefs) initial[p.name] = p.defaultValue ?? ''
    setParamValues(initial)
    if (blockName) paramCache.current[blockName] = initial
  }

  const handleInvoke = useCallback(async () => {
    if (!blockName) return
    const params: Record<string, unknown> = {}
    for (const p of paramDefs) {
      params[p.name] = (paramValues[p.name] ?? p.defaultValue ?? '').trim()
    }
    const order = paramDefs.map((p) => p.name)
    setInvoking(true)
    setResponseText(null)
    setHttpStatus(null)
    try {
      const { status, response } = await invokeBlock(blockName, params, order)
      let formatted = formatBody(response)
      if (formatted.length > MAX_RESPONSE_CHARS) {
        formatted = `${formatted.slice(0, MAX_RESPONSE_CHARS)}\n… (truncated)`
      }
      setHttpStatus(status)
      setResponseText(formatted)
      toast.success('Block invoked')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setResponseText(msg)
      setHttpStatus(null)
      toast.error(msg.split('\n')[0])
    } finally {
      setInvoking(false)
    }
  }, [blockName, paramDefs, paramValues, invokeBlock])

  const handleStart = async () => {
    if (!processName) return
    onProcessUsed?.(processName)
    setProcessAction('start')
    setResponseText(null)
    try {
      await startProcess(processName)
      setResponseText(`[${formatTime()}] Process started successfully.`)
      toast.success('Process started')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setResponseText(msg)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  const handleStop = async () => {
    if (!processName) return
    setProcessAction('stop')
    setResponseText(null)
    try {
      await stopProcess(processName)
      setResponseText(`[${formatTime()}] Process stopped successfully.`)
      toast.success('Process stopped')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setResponseText(msg)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  useEffect(() => {
    if (!open || !isBlock) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void handleInvoke()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isBlock, handleInvoke])

  if (!target) return null

  const hasModifiedParams = paramDefs.some(
    (p) => (paramValues[p.name] ?? '') !== (p.defaultValue ?? ''),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6">
            {isBlock ? (
              <Box className="h-5 w-5 shrink-0 text-info" />
            ) : (
              <Workflow className="h-5 w-5 shrink-0 text-primary" />
            )}
            <DialogTitle className="truncate font-mono text-base">{target.name}</DialogTitle>
          </div>
          <DialogDescription>
            {isBlock ? 'Set parameters and invoke this block.' : 'Start or stop this workflow.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(60vh,520px)] space-y-4 overflow-y-auto pr-1">
          {isBlock ? (
            loadingParams ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading parameters…
              </div>
            ) : paramDefs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parameters required.</p>
            ) : (
              <div className="space-y-3">
                {hasModifiedParams && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetParams}>
                    <RotateCcw className="h-3 w-3" />
                    Reset defaults
                  </Button>
                )}
                {paramDefs.map((p) => (
                  <div key={p.name} className="space-y-1.5">
                    <Label htmlFor={`dlg-${p.name}`} className="font-mono text-xs">
                      {p.name}
                      {p.type && (
                        <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px] font-sans">
                          {p.type}
                        </Badge>
                      )}
                    </Label>
                    {isLogicalDeviceParam(p) && logicalDevices.length > 0 ? (
                      <Select
                        value={paramValues[p.name] ?? ''}
                        onValueChange={(v) => setParam(p.name, v)}
                        disabled={!uiEnabled}
                      >
                        <SelectTrigger id={`dlg-${p.name}`} className="h-9 font-mono text-xs focus:ring-0 focus-visible:ring-0">
                          <SelectValue placeholder={p.defaultValue || 'Select device…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {logicalDevices.map((d) => (
                            <SelectItem key={d.name} value={d.name} className="font-mono text-xs">
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`dlg-${p.name}`}
                        value={paramValues[p.name] ?? ''}
                        onChange={(e) => setParam(p.name, e.target.value)}
                        className="h-9 font-mono text-xs focus:ring-0 focus-visible:ring-0"
                        disabled={!uiEnabled}
                        placeholder={p.defaultValue || ''}
                      />
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3',
                running ? 'border-success/40 bg-success/5' : 'border-border/40 bg-muted/20',
              )}
            >
              <span
                className={cn(
                  'h-3 w-3 shrink-0 rounded-full',
                  running ? 'bg-success' : 'bg-muted-foreground/50',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{running ? 'Running' : 'Stopped'}</p>
              </div>
              <Badge variant={running ? 'success' : 'secondary'}>{running ? 'Active' : 'Idle'}</Badge>
            </div>
          )}

          {responseText && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
                {httpStatus != null && (
                  <Badge
                    variant={
                      httpStatus >= 200 && httpStatus < 300
                        ? 'success'
                        : httpStatus >= 400 && httpStatus < 500
                          ? 'warning'
                          : 'destructive'
                    }
                    className="text-[10px]"
                  >
                    HTTP {httpStatus}
                  </Badge>
                )}
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg border border-border/40 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {responseText}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {isBlock ? (
            <SendButton
              type="button"
              label={invoking ? 'Invoking…' : 'Invoke'}
              shortcut="⌃↵"
              className="w-full sm:w-auto"
              onClick={() => void handleInvoke()}
              disabled={!uiEnabled || invoking || loadingParams}
            />
          ) : (
            <>
              <Button
                type="button"
                className="flex-1 gap-2"
                onClick={() => void handleStart()}
                disabled={!uiEnabled || processAction !== null}
              >
                {processAction === 'start' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Workflow className="h-4 w-4" />
                )}
                Start
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => void handleStop()}
                disabled={!uiEnabled || processAction !== null}
              >
                {processAction === 'stop' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
