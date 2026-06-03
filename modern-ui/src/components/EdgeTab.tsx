import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  Play,
  Square,
  RefreshCw,
  Box,
  Workflow,
  Loader2,
  Wifi,
  AlertCircle,
  Search,
  Trash2,
  Copy,
  Check,
} from 'lucide-react'
import type { EdgeBlockParam, EdgeLogicalDevice } from '@/lib/edge-api-client'
import { edgeParamInvokeKey, isLogicalDeviceParam } from '@/lib/edge-api-types'
import { cn, formatTime } from '@/lib/utils'
import { toast } from 'sonner'
import { useEdgeSession } from '@/contexts/EdgeSessionContext'
import { EdgeAutomationHintBanner } from './EdgeAutomationLink'

const SECTION_CARD =
  'rounded-xl border-border/40 bg-card/95 shadow-sm ring-1 ring-border/20 backdrop-blur-sm'

const MAX_LOG_LINES = 80
const MAX_RESPONSE_CHARS = 12_000

function formatInvokeResponseBody(body: string | null): string {
  const raw = body?.trim() ?? ''
  if (!raw) return '(empty body)'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

type EdgeTabProps = {
  onSwitchTab?: (tab: string) => void
}

export function EdgeTab({ onSwitchTab }: EdgeTabProps = {}) {
  const {
    tcpConnected,
    edgeReady,
    edgeConnecting,
    edgeError,
    blocks,
    processes,
    loadingBlocks,
    loadingProcesses,
    refreshBlocks,
    refreshProcesses,
    refreshAll,
    fetchBlockParams,
    listLogicalDevices,
    notifySelectedProcess,
    invokeBlock,
    startProcess,
    stopProcess,
    edgeApiBaseUrl,
  } = useEdgeSession()

  const [selectedBlock, setSelectedBlock] = useState('')
  const [blockSearch, setBlockSearch] = useState('')
  const [processSearch, setProcessSearch] = useState('')
  const [blockParamDefs, setBlockParamDefs] = useState<EdgeBlockParam[]>([])
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [loadingBlockParams, setLoadingBlockParams] = useState(false)
  const paramValuesByBlockRef = useRef<Record<string, Record<string, string>>>({})
  const [selectedProcess, setSelectedProcess] = useState('')
  const [invokingBlock, setInvokingBlock] = useState(false)
  const [processAction, setProcessAction] = useState<'start' | 'stop' | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [lastInvokeResponse, setLastInvokeResponse] = useState<{
    blockName: string
    status: number
    formatted: string
    time: string
  } | null>(null)
  const [responseCopied, setResponseCopied] = useState(false)
  const [logicalDevices, setLogicalDevices] = useState<EdgeLogicalDevice[]>([])
  const logScrollRef = useRef<HTMLDivElement>(null)
  const sessionLoggedRef = useRef({ connecting: false, ready: false })

  const uiEnabled = tcpConnected && edgeReady

  const filteredBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase()
    const sorted = [...blocks].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter((b) => b.name.toLowerCase().includes(q))
  }, [blocks, blockSearch])

  const filteredProcesses = useMemo(() => {
    const q = processSearch.trim().toLowerCase()
    const sorted = [...processes].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter((p) => p.name.toLowerCase().includes(q))
  }, [processes, processSearch])

  const selectedProcessInfo = useMemo(
    () => processes.find((p) => p.name === selectedProcess),
    [processes, selectedProcess],
  )

  const addLog = useCallback((msg: string) => {
    setLog((prev) => {
      const next = [...prev, `[${formatTime()}] ${msg}`]
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next
    })
  }, [])

  // Scroll log panel only — never scroll the page (scrollIntoView caused the jump).
  useEffect(() => {
    const el = logScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [log, lastInvokeResponse])

  useEffect(() => {
    if (blocks.length && !selectedBlock) setSelectedBlock(blocks[0].name)
  }, [blocks, selectedBlock])

  useEffect(() => {
    if (!selectedBlock || !uiEnabled) {
      setBlockParamDefs([])
      setParamValues({})
      return
    }

    let cancelled = false
    setLoadingBlockParams(true)

    const loadId = window.setTimeout(() => {
      void (async () => {
      try {
        const defs = await fetchBlockParams(selectedBlock)
        if (cancelled) return

        setBlockParamDefs(defs)
        const saved = paramValuesByBlockRef.current[selectedBlock]
        const initial: Record<string, string> = {}
        for (const p of defs) {
          const legacyKey = p.type ? `${p.name}:${p.type}` : p.name
          initial[p.name] =
            saved?.[p.name] ?? saved?.[legacyKey] ?? p.defaultValue ?? ''
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
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(msg)
        setBlockParamDefs([])
        setParamValues({})
      } finally {
        if (!cancelled) setLoadingBlockParams(false)
      }
      })()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(loadId)
    }
  }, [selectedBlock, uiEnabled, fetchBlockParams])

  const setParamValue = (name: string, value: string) => {
    setParamValues((prev) => {
      const next = { ...prev, [name]: value }
      if (selectedBlock) {
        paramValuesByBlockRef.current[selectedBlock] = next
      }
      return next
    })
  }

  useEffect(() => {
    if (processes.length && !selectedProcess) setSelectedProcess(processes[0].name)
  }, [processes, selectedProcess])

  useEffect(() => {
    notifySelectedProcess(selectedProcess)
  }, [selectedProcess, notifySelectedProcess])

  useEffect(() => {
    if (!tcpConnected) {
      sessionLoggedRef.current = { connecting: false, ready: false }
      return
    }
    if (edgeConnecting && !sessionLoggedRef.current.connecting) {
      sessionLoggedRef.current.connecting = true
      addLog('Signing in to Edge API…')
    }
  }, [tcpConnected, edgeConnecting, addLog])

  useEffect(() => {
    if (edgeReady && !sessionLoggedRef.current.ready) {
      sessionLoggedRef.current.ready = true
      addLog('Edge API ready')
    }
    if (!edgeReady) sessionLoggedRef.current.ready = false
  }, [edgeReady, addLog])

  useEffect(() => {
    if (edgeError) addLog(`Error: ${edgeError}`)
  }, [edgeError, addLog])

  const needsLogicalDeviceList = useMemo(
    () => blockParamDefs.some(isLogicalDeviceParam),
    [blockParamDefs],
  )

  useEffect(() => {
    if (!uiEnabled || !needsLogicalDeviceList) {
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
  }, [uiEnabled, needsLogicalDeviceList, listLogicalDevices])

  const showInvokeResponse = useCallback((blockName: string, status: number, body: string | null) => {
    let formatted = formatInvokeResponseBody(body)
    if (formatted.length > MAX_RESPONSE_CHARS) {
      formatted = `${formatted.slice(0, MAX_RESPONSE_CHARS)}\n… (truncated)`
    }
    setLastInvokeResponse({ blockName, status, formatted, time: formatTime() })
    setResponseCopied(false)
  }, [])

  const copyInvokeResponse = useCallback(async () => {
    if (!lastInvokeResponse) return
    try {
      await navigator.clipboard.writeText(lastInvokeResponse.formatted)
      setResponseCopied(true)
      toast.success('Response copied')
      window.setTimeout(() => setResponseCopied(false), 2000)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }, [lastInvokeResponse])

  const buildInvokeParams = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const p of blockParamDefs) {
      out[p.name] = (paramValues[p.name] ?? p.defaultValue ?? '').trim()
    }
    return out
  }

  const handleInvokeBlock = async () => {
    if (!selectedBlock) {
      toast.error('Select a block')
      return
    }
    const params = buildInvokeParams()
    const paramOrder = blockParamDefs.map((p) => p.name)
    setInvokingBlock(true)
    addLog(`Invoke → ${selectedBlock}`)
    try {
      const { status, response } = await invokeBlock(selectedBlock, params, paramOrder)
      addLog(`✓ Block ${selectedBlock}`)
      showInvokeResponse(selectedBlock, status, response)
      toast.success('Block invoked')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const line of msg.split('\n')) {
        addLog(`✗ ${line}`)
      }
      toast.error(msg.split('\n')[0], {
        description: msg.length > 120 ? msg.slice(0, 500) : undefined,
        duration: 8000,
      })
    } finally {
      setInvokingBlock(false)
    }
  }

  const handleStartProcess = async () => {
    if (!selectedProcess) return
    setProcessAction('start')
    try {
      await startProcess(selectedProcess)
      addLog(`▶ Started ${selectedProcess}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`✗ Start: ${msg}`)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  const handleStopProcess = async () => {
    if (!selectedProcess) return
    setProcessAction('stop')
    try {
      await stopProcess(selectedProcess)
      addLog(`■ Stopped ${selectedProcess}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      addLog(`✗ Stop: ${msg}`)
      toast.error(msg)
    } finally {
      setProcessAction(null)
    }
  }

  const statusBanner = !tcpConnected ? (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground shrink-0">
      <Wifi className="w-4 h-4 shrink-0" />
      Connect to an Edge IP using the connection bubble.
    </div>
  ) : edgeConnecting ? (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-sm shrink-0">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      Signing in to Edge API…
    </div>
  ) : edgeError ? (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive shrink-0">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {edgeError}
    </div>
  ) : edgeReady ? (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm shrink-0">
      <span className="text-foreground min-w-0">
        Edge API ready
        {edgeApiBaseUrl ? (
          <span className="block font-mono text-xs text-muted-foreground truncate" title={edgeApiBaseUrl}>
            {edgeApiBaseUrl}/ALE/api/…
          </span>
        ) : null}
      </span>
      <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => void refreshAll()}>
        <RefreshCw
          className={cn('w-3.5 h-3.5', (loadingBlocks || loadingProcesses) && 'animate-spin')}
        />
        Refresh all
      </Button>
    </div>
  ) : null

  return (
    <div
      className="flex flex-col h-full min-h-0 gap-3 overflow-hidden"
      data-tour="tour-edge"
    >
      {statusBanner}

      <EdgeAutomationHintBanner onSwitchTab={onSwitchTab} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
        {/* Blocks */}
        <Card className={cn(SECTION_CARD, 'flex flex-col min-h-0 overflow-hidden')}>
          <CardHeader className="py-3 px-4 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Box className="w-4 h-4 shrink-0" />
                  Blocks
                </CardTitle>
                <CardDescription className="mt-0.5 truncate">
                  {blocks.length} total
                  {blockSearch.trim() ? ` · ${filteredBlocks.length} match` : ''}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => void refreshBlocks()}
                disabled={!uiEnabled || loadingBlocks}
                title="Refresh blocks"
              >
                <RefreshCw className={cn('w-4 h-4', loadingBlocks && 'animate-spin')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 min-h-0 gap-2 px-4 pb-4 pt-0 overflow-hidden">
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={blockSearch}
                onChange={(e) => setBlockSearch(e.target.value)}
                placeholder="Search blocks…"
                className="pl-9 font-mono text-sm h-9"
                disabled={!uiEnabled}
              />
            </div>

            <ScrollArea className="h-[min(140px,22vh)] shrink-0 rounded-lg border border-border/40">
              <div className="p-1">
                {filteredBlocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-3">
                    {blocks.length === 0 ? 'No blocks loaded.' : 'No match.'}
                  </p>
                ) : (
                  filteredBlocks.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      disabled={!uiEnabled}
                      onClick={() => setSelectedBlock(b.name)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 rounded-md font-mono text-xs transition-colors',
                        selectedBlock === b.name
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'hover:bg-muted/60 text-foreground/90',
                        !uiEnabled && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      {b.name}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>

            {selectedBlock ? (
              <div className="min-h-0 flex-1 space-y-2 border-t border-border/40 pt-2 overflow-y-auto overscroll-contain">
                <p className="text-xs text-muted-foreground truncate font-mono" title={selectedBlock}>
                  {selectedBlock}
                </p>
                {loadingBlockParams ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading params…
                  </div>
                ) : blockParamDefs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No parameters</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {blockParamDefs.map((p) => (
                      <div key={p.name} className="space-y-1">
                        <Label
                          htmlFor={`edge-param-${p.name}`}
                          className="text-[11px] font-mono leading-tight"
                        >
                          {p.name}
                          {p.type ? (
                            <span className="text-muted-foreground font-sans"> · {p.type}</span>
                          ) : null}
                        </Label>
                        {isLogicalDeviceParam(p) && logicalDevices.length > 0 ? (
                          <Select
                            value={paramValues[p.name] ?? ''}
                            onValueChange={(v) => setParamValue(p.name, v)}
                            disabled={!uiEnabled}
                          >
                            <SelectTrigger
                              id={`edge-param-${p.name}`}
                              className="font-mono text-xs h-8"
                            >
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
                            id={`edge-param-${p.name}`}
                            value={paramValues[p.name] ?? ''}
                            onChange={(e) => setParamValue(p.name, e.target.value)}
                            className="font-mono text-xs h-8"
                            disabled={!uiEnabled}
                            placeholder={p.defaultValue || ''}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="shrink-0 pt-2 border-t border-border/40 bg-card">
              <Button
                type="button"
                className="w-full gap-2 h-9"
                onClick={() => void handleInvokeBlock()}
                disabled={!uiEnabled || !selectedBlock || invokingBlock || loadingBlockParams}
              >
                {invokingBlock ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Invoke block
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Processes */}
        <Card className={cn(SECTION_CARD, 'flex flex-col min-h-0 overflow-hidden')}>
          <CardHeader className="py-3 px-4 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Workflow className="w-4 h-4 shrink-0" />
                  Processes
                </CardTitle>
                <CardDescription className="mt-0.5">
                  {processes.length} workflow{processes.length === 1 ? '' : 's'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => void refreshProcesses()}
                disabled={!uiEnabled || loadingProcesses}
                title="Refresh processes"
              >
                <RefreshCw className={cn('w-4 h-4', loadingProcesses && 'animate-spin')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 min-h-0 gap-3 px-4 pb-4 pt-0">
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                placeholder="Search processes…"
                className="pl-9 font-mono text-sm h-9"
                disabled={!uiEnabled}
              />
            </div>

            <Select
              value={selectedProcess}
              onValueChange={setSelectedProcess}
              disabled={!uiEnabled || processes.length === 0}
            >
              <SelectTrigger className="font-mono text-sm h-10 shrink-0">
                <SelectValue placeholder="Select process…" />
              </SelectTrigger>
              <SelectContent>
                {(processSearch.trim() ? filteredProcesses : processes).map((p) => (
                  <SelectItem key={p.name} value={p.name} className="font-mono text-sm">
                    {p.name}
                    {p.started != null ? (p.started ? ' · running' : ' · stopped') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProcess && (
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-mono shrink-0 border',
                  selectedProcessInfo?.started
                    ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                    : 'bg-muted/40 border-border/50 text-muted-foreground',
                )}
              >
                {selectedProcessInfo?.started ? '● Running' : '○ Stopped'} — {selectedProcess}
              </div>
            )}

            <div className="flex gap-2 mt-auto shrink-0">
              <Button
                type="button"
                className="flex-1 gap-2 h-10"
                onClick={() => void handleStartProcess()}
                disabled={!uiEnabled || !selectedProcess || processAction !== null}
              >
                {processAction === 'start' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Start
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1 gap-2 h-10"
                onClick={() => void handleStopProcess()}
                disabled={!uiEnabled || !selectedProcess || processAction !== null}
              >
                {processAction === 'stop' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity log — capped height so Invoke stays visible above */}
      <Card className={cn(SECTION_CARD, 'shrink-0 flex flex-col max-h-[min(240px,34vh)] min-h-0 overflow-hidden')}>
        <CardHeader className="py-2 px-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium">Activity log</CardTitle>
          {(log.length > 0 || lastInvokeResponse) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setLog([])
                setLastInvokeResponse(null)
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 flex flex-col min-h-0 gap-2 overflow-hidden">
          <div
            ref={logScrollRef}
            className="h-[56px] shrink-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/40 bg-muted/20 p-2 overscroll-contain"
          >
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground">Start/stop and invoke actions appear here.</p>
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
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-foreground/85',
                    )}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          {lastInvokeResponse ? (
            <div className="min-h-0 flex-1 flex flex-col rounded-lg border border-border/50 bg-background/90 overflow-hidden ring-1 ring-border/20">
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/40 bg-muted/30 shrink-0">
                <div className="min-w-0 text-[11px] text-muted-foreground truncate">
                  <span className="font-medium text-foreground">{lastInvokeResponse.blockName}</span>
                  <span className="mx-1.5">·</span>
                  HTTP {lastInvokeResponse.status}
                  <span className="mx-1.5">·</span>
                  {lastInvokeResponse.time}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] shrink-0"
                  onClick={() => void copyInvokeResponse()}
                >
                  {responseCopied ? (
                    <Check className="w-3 h-3 mr-1 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3 mr-1" />
                  )}
                  {responseCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <pre className="m-0 min-h-0 flex-1 overflow-auto p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground/90">
                {lastInvokeResponse.formatted}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
