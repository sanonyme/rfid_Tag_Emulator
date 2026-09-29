import { useState, useRef, useEffect, useMemo } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ExpandableTagField } from './ExpandableTagField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  Smartphone,
  Zap,
  Server,
  Plus,
  Trash2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { HandheldServerClient } from '@/lib/tcp-client'
import { useSettings } from '@/lib/settings-context'
import { formatTime, cn } from '@/lib/utils'
import { TagPresetMenu, type TagPresetMenuHandle } from './TagPresetMenu'
import { TagSchemeGenerator } from './TagSchemeGenerator'
import { InditexTempeGenerator } from './InditexTempeGenerator'
import { SendButton, LoopSendButton } from './SendControls'
import { sectionCard } from '@/lib/ui-tokens'
import { handheldAccent } from '@/lib/handheld-colors'
import { useTagListShortcuts } from '@/lib/tag-list-shortcuts'
import { publishStatus, clearStatus, handheldKey } from '@/lib/workspace-status'
import { Switch } from '@/components/ui/switch'
import {
  getHandheldFullActivityLog,
  setHandheldFullActivityLog,
  shouldAppendHandheldLogLine,
} from '@/lib/handheld-log-settings'
import { countHandheldSlotTags } from '@/lib/tag-list-count'
import {
  countHandheldRecipeTags,
  handheldRecipeFromSlot,
} from '@/lib/handheld-tag-iterate'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const MAX_HANDHELD_LOG_LINES = 500

export interface HandheldSlot {
  id: string
  port: number
  upcList: string
  epcList: string
  /** Starting SGTIN-96 serial for each UPC line (serials still increment within a line by count). Defaults to "1". */
  startSerial?: string
}

interface HandheldTabProps {
  slots: HandheldSlot[]
  setSlots: (slots: HandheldSlot[]) => void
  /** Milliseconds between handheld tag broadcasts (separate from fixed reader delay). */
  handheldDelay: string
  setHandheldDelay: (value: string) => void
  /** RSSI string applied to each emitted handheld tag (matches Fixed tab signal strength). */
  rssi: string
}

const DEFAULT_PORT = 10472

/** Stable key so loop mode can detect list / serial changes between rounds. */
function handheldSlotParseKey(s: HandheldSlot, rssi: string, serialContinuesAcrossUpcLines: boolean): string {
  return `${s.upcList}\0${s.epcList}\0${s.startSerial ?? '1'}\0${serialContinuesAcrossUpcLines ? '1' : '0'}\0${rssi}`
}

// Cache HandheldServerClient per port to avoid duplicate event listeners
const clientCache = new Map<number, HandheldServerClient>()
function getClient(port: number): HandheldServerClient {
  if (!clientCache.has(port)) {
    clientCache.set(port, new HandheldServerClient(port))
  }
  return clientCache.get(port)!
}

export function HandheldTab({
  slots,
  setSlots,
  handheldDelay,
  setHandheldDelay,
  rssi,
}: HandheldTabProps) {
  const { settings } = useSettings()
  const serialContinuesAcrossUpcLines = settings.handheldSerialContinuesAcrossUpcLines
  const [log, setLog] = useState<string[]>([])
  const [sendingPorts, setSendingPorts] = useState<Set<number>>(new Set())
  const [runningPorts, setRunningPorts] = useState<Set<number>>(new Set())
  const [fullActivityLog, setFullActivityLog] = useState(() => getHandheldFullActivityLog())
  const logEndRef = useRef<HTMLDivElement>(null)
  const logScrollRef = useRef<HTMLDivElement>(null)
  const loopCancelRef = useRef<Set<number>>(new Set())
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const rssiRef = useRef(rssi)
  rssiRef.current = rssi
  const fullActivityLogRef = useRef(fullActivityLog)
  fullActivityLogRef.current = fullActivityLog
  const handheldDelayRef = useRef(handheldDelay)
  handheldDelayRef.current = handheldDelay
  const serialContinuesRef = useRef(serialContinuesAcrossUpcLines)
  serialContinuesRef.current = serialContinuesAcrossUpcLines
  const debouncedSlots = useDebouncedValue(slots, 200)
  const anySlotHasTags = useMemo(
    () => debouncedSlots.some((s) => countHandheldSlotTags(s) > 0),
    [debouncedSlots],
  )

  const addLog = (message: string, port?: number) => {
    if (!shouldAppendHandheldLogLine(message, fullActivityLogRef.current)) return
    const prefix = port !== undefined ? `[${port}] ` : ''
    setLog((prev) =>
      [...prev, `[${formatTime()}] ${prefix}${message}`].slice(-MAX_HANDHELD_LOG_LINES)
    )
  }

  useEffect(() => {
    const viewport = logScrollRef.current?.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport]',
    )
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
      return
    }
    logEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [log])

  const addSlot = () => {
    const maxPort = slots.length > 0 ? Math.max(...slots.map(s => s.port)) : DEFAULT_PORT
    const newPort = maxPort + 1
    setSlots([
      ...slots,
      {
        id: crypto.randomUUID(),
        port: newPort,
        upcList: '',
        epcList: '',
        startSerial: '1'
      }
    ])
  }

  const removeSlot = (id: string) => {
    if (slots.length <= 1) return
    const slot = slots.find(s => s.id === id)
    if (slot) {
      if (runningPorts.has(slot.port)) {
        getClient(slot.port).shutdown()
        setRunningPorts((prev) => {
          const next = new Set(prev)
          next.delete(slot.port)
          return next
        })
      }
      clearStatus(handheldKey(slot.port))
    }
    setSlots(slots.filter(s => s.id !== id))
  }

  const updateSlot = (id: string, updates: Partial<Omit<HandheldSlot, 'id'>>) => {
    setSlots(slots.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  const handleStartServer = async (port: number) => {
    const client = getClient(port)
    publishStatus(handheldKey(port), { status: 'connecting', port, label: `HH :${port}` })
    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error('Server start timed out')), 15_000)
        client.start(
          (msg) => {
            window.clearTimeout(timeoutId)
            addLog(msg, port)
            setRunningPorts((prev) => new Set([...prev, port]))
            publishStatus(handheldKey(port), { status: 'connected', port, label: `HH :${port}` })
            resolve()
          },
          (err) => {
            window.clearTimeout(timeoutId)
            addLog(`Error: ${err}`, port)
            publishStatus(handheldKey(port), { status: 'error', port, error: err })
            reject(new Error(err))
          },
        )
      })
    } catch {
      setRunningPorts((prev) => {
        const next = new Set(prev)
        next.delete(port)
        return next
      })
      clearStatus(handheldKey(port))
    }
  }

  const handleStopServer = (port: number) => {
    const client = getClient(port)
    client.shutdown()
    setRunningPorts(prev => {
      const next = new Set(prev)
      next.delete(port)
      return next
    })
    addLog(`Server stopped on port ${port}`, port)
    clearStatus(handheldKey(port))
  }

  const runSendWorkflow = async (
    slotId: string,
    opts?: { loop?: boolean }
  ) => {
    const slot = slotsRef.current.find((s) => s.id === slotId)
    if (!slot) return
    const port = slot.port
    loopCancelRef.current.delete(port)

    const client = getClient(port)
    const running = await client.isRunning()
    if (!running) {
      addLog('Error: Handheld server is not running. Click Start Server first.', port)
      return
    }

    const startedRepeat = opts?.loop === true
    const recipe = handheldRecipeFromSlot(slot, rssiRef.current, serialContinuesRef.current)
    const tagCount = countHandheldRecipeTags(recipe)
    if (tagCount === 0) {
      addLog('Error: No EPCs generated', port)
      return
    }

    if (startedRepeat) {
      addLog(`Loop send started on port ${port}. Use Stop send to end.`, port)
    } else {
      addLog(`Sending ${tagCount.toLocaleString()} EPC(s) to handheld on port ${port}...`, port)
    }

    setSendingPorts((prev) => new Set([...prev, port]))
    publishStatus(handheldKey(port), {
      status: 'sending',
      port,
      detail: startedRepeat ? 'loop send' : `sending ${tagCount.toLocaleString()} tag${tagCount === 1 ? '' : 's'}`,
    })

    const fatalFinish = (msg: string) =>
      loopCancelRef.current.has(port) ||
      /no handheld connected|cancelled by user|^stopped:/i.test(msg)

    let round = 0
    let cachedRecipe: ReturnType<typeof handheldRecipeFromSlot> | null = null
    let cachedParseKey = ''

    while (!loopCancelRef.current.has(port)) {

      const cur = slotsRef.current.find((s) => s.id === slotId)
      if (!cur) {
        addLog('Slot removed; stopping send.', port)
        break
      }

      const parseKey = handheldSlotParseKey(cur, rssiRef.current, serialContinuesRef.current)
      if (parseKey !== cachedParseKey) {
        cachedRecipe = handheldRecipeFromSlot(cur, rssiRef.current, serialContinuesRef.current)
        cachedParseKey = parseKey
      }
      const roundRecipe = cachedRecipe!
      const roundTagCount = countHandheldRecipeTags(roundRecipe)
      if (roundTagCount === 0) {
        addLog('Error: No EPCs (list empty); stopping.', port)
        break
      }

      if (!(await client.isRunning())) {
        addLog('Handheld server stopped; ending send.', port)
        break
      }

      round++
      if (startedRepeat) {
        addLog(`— Round ${round} (${roundTagCount.toLocaleString()} tag(s)) —`, port)
      }

      let completeMsg = ''
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (!settled) {
            settled = true
            resolve()
          }
        }
        client.sendRecipe(
          roundRecipe,
          parseInt(handheldDelayRef.current, 10) || 0,
          (progress) => {
            if (fullActivityLogRef.current) addLog(progress, port)
          },
          (complete) => {
            completeMsg = complete
            addLog(complete, port)
            finish()
          },
          fullActivityLogRef.current
        )
      })

      if (fatalFinish(completeMsg)) break
      if (!startedRepeat) break
    }

    if (startedRepeat && round > 0) {
      addLog(
        loopCancelRef.current.has(port) ? 'Loop send stopped.' : 'Loop send ended (no handheld / error).',
        port
      )
    }

    const userCancelled = loopCancelRef.current.has(port)
    loopCancelRef.current.delete(port)
    setSendingPorts((prev) => {
      const next = new Set(prev)
      next.delete(port)
      return next
    })
    publishStatus(handheldKey(port), { status: 'connected', port, detail: undefined })

    if (startedRepeat && userCancelled) {
      toast.info('Loop send stopped')
    }
  }

  const handleSendToSlot = async (
    slot: HandheldSlot,
    sendOpts?: { loop?: boolean }
  ) => {
    await runSendWorkflow(slot.id, sendOpts)
  }

  const handleSendAll = async () => {
    const slotsWithTags = slots.filter((s) => countHandheldSlotTags(s) > 0)
    if (slotsWithTags.length === 0) {
      addLog('Error: No slots have tags to send')
      return
    }

    const notRunning = slotsWithTags.filter(s => !runningPorts.has(s.port))
    if (notRunning.length > 0) {
      addLog(`Error: Start server on port(s) ${notRunning.map(s => s.port).join(', ')} first`)
      return
    }

    addLog(`Sending to ${slotsWithTags.length} handheld(s) in parallel...`)
    await Promise.all(slotsWithTags.map((slot) => handleSendToSlot(slot)))
  }

  const handleStopSend = (port: number) => {
    loopCancelRef.current.add(port)
    getClient(port).cancelSend()
    addLog('Stop requested.', port)
  }

  const handleStartAll = async () => {
    for (const slot of slots) {
      handleStartServer(slot.port)
      await new Promise(r => setTimeout(r, 200))
    }
  }

  const handleStopAll = () => {
    for (const slot of slots) {
      handleStopServer(slot.port)
    }
  }

  return (
    <div className="stagger-children flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className={cn(sectionCard, 'shrink-0 px-4 py-3 sm:px-5 sm:py-3.5')} data-tour="tour-handheld-toolbar">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 lg:flex-nowrap lg:justify-between lg:gap-4">
          <p className="min-w-0 flex-[1_1_220px] text-sm leading-snug text-muted-foreground lg:flex-1">
            Point VSBL Debug at <strong className="font-mono text-foreground">YOUR_PC_IP:PORT</strong> for each slot
            below.
          </p>
          <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap lg:justify-end">
            <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/25 px-3 py-1.5 sm:gap-3 sm:px-3.5 sm:py-2">
              <Label
                htmlFor="handheld-inter-tag-delay"
                className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground sm:text-[13px]"
              >
                Inter-tag delay
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="handheld-inter-tag-delay"
                  type="number"
                  min={0}
                  value={handheldDelay}
                  onChange={(e) => setHandheldDelay(e.target.value)}
                  className="h-9 w-[4.35rem] shrink-0 rounded-md border-border/50 bg-background/90 px-2.5 font-mono text-sm shadow-none tabular-nums sm:w-[4.75rem]"
                />
                <span className="shrink-0 select-none text-xs tabular-nums text-muted-foreground">ms</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/35 p-1 ring-1 ring-border/25">
              <Button
                variant="outline"
                size="sm"
                onClick={addSlot}
                className="gap-1.5 rounded-lg border-transparent bg-background/90 shadow-none hover:bg-background"
              >
                <Plus className="h-4 w-4" />
                Add handheld
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartAll}
                className="rounded-lg border-transparent bg-background/90 shadow-none hover:bg-background"
              >
                Start all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopAll}
                className="rounded-lg border-transparent bg-background/90 shadow-none hover:bg-background"
              >
                Stop all
              </Button>
              <SendButton
                ripple
                size="sm"
                label="Send all"
                onClick={handleSendAll}
                disabled={sendingPorts.size > 0 || !anySlotHasTags}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Handheld slots - scrollable grid when many */}
      <ScrollArea
        className="min-h-[200px] flex-1 rounded-xl border border-border/40 bg-muted/10 ring-1 ring-border/20"
        data-tour="tour-handheld-slots"
      >
        <div
          className="grid gap-4 p-1"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${slots.length === 1 ? '420px' : '380px'}, 1fr))` }}
        >
          {slots.map((slot) => (
            <HandheldSlotCard
              key={slot.id}
              slot={slot}
              isRunning={runningPorts.has(slot.port)}
              isSending={sendingPorts.has(slot.port)}
              onUpdate={(updates) => updateSlot(slot.id, updates)}
              onRemove={() => removeSlot(slot.id)}
              onStart={() => handleStartServer(slot.port)}
              onStop={() => handleStopServer(slot.port)}
              onSendOnce={() => handleSendToSlot(slot, { loop: false })}
              onLoopSend={() => handleSendToSlot(slot, { loop: true })}
              onStopSend={() => handleStopSend(slot.port)}
              canRemove={slots.length > 1}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Log Area */}
      <Card className={cn(sectionCard, 'max-h-[200px] min-h-[140px] shrink-0')} data-tour="tour-handheld-log">
        <CardHeader className="border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/40">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </span>
              Activity log
              {sendingPorts.size > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2 py-1 sm:px-2.5">
                <Switch
                  id="handheld-detail-logs"
                  checked={fullActivityLog}
                  onCheckedChange={(v) => {
                    setFullActivityLog(v)
                    setHandheldFullActivityLog(v)
                  }}
                />
                <Label
                  htmlFor="handheld-detail-logs"
                  className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground"
                  title="Off: only VSBL client connect/disconnect counts and errors. On: all send activity."
                >
                  Full activity log
                </Label>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
                <Button variant="ghost" size="sm" className="h-8 rounded-md px-2.5 text-xs" onClick={() => setLog([])}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="bg-muted/15 p-2">
          <ScrollArea ref={logScrollRef} className="h-[120px]">
            <div className="space-y-0.5 px-1 py-0.5 font-mono text-xs">
              {log.map((line, i) => (
                <div
                  key={i}
                  className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
                >
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

interface HandheldSlotCardProps {
  slot: HandheldSlot
  isRunning: boolean
  isSending: boolean
  onUpdate: (updates: Partial<Omit<HandheldSlot, 'id'>>) => void
  onRemove: () => void
  onStart: () => void
  onStop: () => void
  onSendOnce: () => void
  onLoopSend: () => void
  onStopSend: () => void
  canRemove: boolean
}

function HandheldSlotCard({
  slot,
  isRunning,
  isSending,
  onUpdate,
  onRemove,
  onStart,
  onStop,
  onSendOnce,
  onLoopSend,
  onStopSend,
  canRemove,
}: HandheldSlotCardProps) {
  const upcPresetRef = useRef<TagPresetMenuHandle>(null)
  const epcPresetRef = useRef<TagPresetMenuHandle>(null)
  const [inputMode, setInputMode] = useState<'upc' | 'epc'>('upc')
  const accent = handheldAccent(slot.port || slot.id)
  const debouncedSlot = useDebouncedValue(slot, 200)
  const hasTags = useMemo(() => countHandheldSlotTags(debouncedSlot) > 0, [debouncedSlot])

  // Send / loop guards mirror the button-disabled rules below so the keyboard
  // path can't fire when the slot isn't ready.
  const canSend = !isSending && isRunning && hasTags
  const canLoop = isRunning && hasTags
  const upcShortcuts = useTagListShortcuts({
    onSavePreset: () => upcPresetRef.current?.openSave(),
    onLoadPreset: () => upcPresetRef.current?.open(),
    onSend: canSend ? onSendOnce : undefined,
    onLoop: canLoop ? (isSending ? onStopSend : onLoopSend) : undefined,
  })
  const epcShortcuts = useTagListShortcuts({
    onSavePreset: () => epcPresetRef.current?.openSave(),
    onLoadPreset: () => epcPresetRef.current?.open(),
    onSend: canSend ? onSendOnce : undefined,
    onLoop: canLoop ? (isSending ? onStopSend : onLoopSend) : undefined,
  })

  return (
    <Card
      className={cn(sectionCard, 'relative flex min-h-0 flex-col overflow-hidden')}
      style={{ borderTopColor: accent.color, borderTopWidth: 2 }}
    >
      <CardHeader className="shrink-0 space-y-3 border-b border-border/40 bg-muted/10 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: accent.tint, color: accent.color, boxShadow: `inset 0 0 0 1px ${accent.ring}` }}
            >
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="truncate text-base font-semibold tracking-tight">
                  Port {slot.port}
                </CardTitle>
                {isRunning ? (
                  <Badge
                    variant="outline"
                    className="inline-flex shrink-0 items-center gap-1.5 border-success/40 bg-success/10 py-0 px-2 text-[10px] text-success"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current shadow-[0_0_6px_hsl(var(--success)/0.85)]" />
                    Listening
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-border/50 bg-background/60 py-0 px-2 text-[10px] font-normal text-muted-foreground"
                  >
                    Idle
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-0.5 text-[11px] leading-relaxed">
                VSBL Debug → this machine on{' '}
                <span className="font-mono text-foreground/85">:{slot.port}</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
            {inputMode === 'epc' ? (
              <>
                <InditexTempeGenerator
                  variant="compact"
                  onGenerated={(epcs) =>
                    onUpdate({
                      epcList: slot.epcList ? slot.epcList + '\n' + epcs : epcs,
                    })
                  }
                />
                <TagSchemeGenerator
                  variant="compact"
                  onGenerated={(epcs) =>
                    onUpdate({
                      epcList: slot.epcList ? slot.epcList + '\n' + epcs : epcs,
                    })
                  }
                />
                <TagPresetMenu
                  ref={epcPresetRef}
                  kind="epc"
                  variant="compact"
                  currentValue={slot.epcList}
                  onLoad={(content, mode) =>
                    onUpdate({
                      epcList: mode === 'append' && slot.epcList ? slot.epcList + '\n' + content : content,
                    })
                  }
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="EPC line format"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    <p className="font-mono text-[11px]">EPC[,TID[,userdata]]</p>
                    <p className="mt-1 text-muted-foreground">
                      TID and userdata are optional hex. Example:{' '}
                      <span className="font-mono">3034…,,DEADBEEF</span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <TagPresetMenu
                  ref={upcPresetRef}
                  kind="upc"
                  variant="compact"
                  currentValue={slot.upcList}
                  onLoad={(content, mode) =>
                    onUpdate({
                      upcList: mode === 'append' && slot.upcList ? slot.upcList + '\n' + content : content,
                    })
                  }
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="UPC line format"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    <p className="font-mono text-[11px]">UPC,Count,TID[,userdata]</p>
                    <p className="mt-1 text-muted-foreground">
                      TID and userdata are optional hex. Example:{' '}
                      <span className="font-mono">12345,5,,DEADBEEF</span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {canRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-destructive"
                onClick={onRemove}
                aria-label={`Remove port ${slot.port}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/70 p-1.5 shadow-sm ring-1 ring-border/20">
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-1.5">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Listen
            </span>
            <Input
              type="number"
              value={slot.port}
              onChange={(e) => onUpdate({ port: parseInt(e.target.value) || DEFAULT_PORT })}
              className="h-8 min-w-0 flex-1 rounded-md border-border/40 bg-muted/20 font-mono text-sm shadow-none"
              min={1024}
              max={65535}
              aria-label="Handheld listen port"
            />
          </div>
          <Button
            onClick={isRunning ? onStop : onStart}
            size="sm"
            variant={isRunning ? 'outline' : 'default'}
            className={cn(
              'h-8 shrink-0 gap-1.5 rounded-lg px-3',
              !isRunning && 'shadow-sm shadow-primary/20',
            )}
          >
            <Server className="h-3.5 w-3.5" />
            {isRunning ? 'Stop' : 'Start server'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3">
        <Tabs
          value={inputMode}
          onValueChange={(v) => setInputMode(v === 'epc' ? 'epc' : 'upc')}
          className="flex min-h-0 w-full flex-1 flex-col"
          data-tour="tour-handheld-input-modes"
        >
          <TabsList className="grid h-auto w-full shrink-0 grid-cols-2 rounded-xl bg-muted/45 p-1 ring-1 ring-border/35">
            <TabsTrigger
              value="upc"
              className="rounded-lg text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/50"
            >
              UPC → EPC
            </TabsTrigger>
            <TabsTrigger
              value="epc"
              className="rounded-lg text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/50"
            >
              Direct EPC
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upc" className="mt-3 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden">
            <ExpandableTagField
              dialogTitle={`UPC → EPC — port ${slot.port}`}
              dialogDescription="UPC,Count,TID[,userdata] (one per line) — CSV columns auto-detected on drop"
              value={slot.upcList}
              onChange={(e) => onUpdate({ upcList: e.target.value })}
              onFileImport={(content) =>
                onUpdate({ upcList: slot.upcList ? slot.upcList + '\n' + content : content })
              }
              kind="upc"
              onKeyDown={upcShortcuts}
              placeholder="00000000000000,5"
              compactClassName="min-h-[110px] resize-y bg-muted/10 font-mono text-xs"
              attachedFooter={
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={`start-serial-${slot.id}`}
                    className="shrink-0 text-[11px] font-medium text-muted-foreground"
                  >
                    Start serial
                  </label>
                  <Input
                    id={`start-serial-${slot.id}`}
                    type="number"
                    min={1}
                    max={999999999}
                    value={slot.startSerial ?? '1'}
                    onChange={(e) => onUpdate({ startSerial: e.target.value })}
                    className="h-7 w-24 rounded-md border-border/40 bg-background/90 font-mono text-xs shadow-none"
                    title="Starting SGTIN-96 serial; combined with serial mode in the toolbar"
                  />
                  <span className="hidden text-[10px] text-muted-foreground/75 sm:inline">
                    SGTIN start for UPC lines
                  </span>
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="epc" className="mt-3 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden">
            <ExpandableTagField
              dialogTitle={`Direct EPC — port ${slot.port}`}
              dialogDescription="EPC[,TID[,userdata]] (one per line) — CSV columns auto-detected on drop"
              value={slot.epcList}
              onChange={(e) => onUpdate({ epcList: e.target.value })}
              onFileImport={(content) =>
                onUpdate({ epcList: slot.epcList ? slot.epcList + '\n' + content : content })
              }
              kind="epc"
              onKeyDown={epcShortcuts}
              placeholder={'3034...\n3035...,CustomTID'}
              compactClassName="min-h-[110px] resize-y bg-muted/10 font-mono text-xs"
            />
          </TabsContent>
        </Tabs>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-stretch">
          <SendButton
            ripple
            size="sm"
            label="Send"
            onClick={onSendOnce}
            disabled={isSending || !isRunning}
            className="flex-1 sm:min-h-10"
          />
          <LoopSendButton
            ripple
            size="sm"
            active={isSending}
            onClick={isSending ? onStopSend : onLoopSend}
            disabled={!isRunning || (!isSending && !hasTags)}
            className="sm:min-h-10 sm:min-w-[7.5rem]"
            title={isSending ? 'Stop current send or loop' : 'Repeat full tag list until stopped'}
          />
        </div>
      </CardContent>
    </Card>
  )
}
