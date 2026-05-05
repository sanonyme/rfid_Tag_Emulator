import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ExpandableTagField } from './ExpandableTagField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Smartphone, Zap, StopCircle, Server, Plus, Trash2, Upload, Download } from 'lucide-react'
import { toast } from 'sonner'
import { HandheldServerClient, EPCGenerator } from '@/lib/tcp-client'
import { formatTime, cn } from '@/lib/utils'
import { publishStatus, clearStatus, handheldKey } from '@/lib/workspace-status'

const SECTION_CARD =
  'rounded-xl border-border/40 bg-card/95 shadow-sm ring-1 ring-border/20 backdrop-blur-sm'

export interface HandheldSlot {
  id: string
  port: number
  upcList: string
  epcList: string
  /** Starting serial value used by SGTIN-96 encoding of the UPC list. Defaults to "1". */
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

function parseTagsFromSlot(slot: HandheldSlot, rssi: string): { epc: string; tid?: string; rssi: string }[] {
  const allTags: { epc: string; tid?: string; rssi: string }[] = []

  if (slot.upcList.trim()) {
    const lines = slot.upcList.trim().split('\n')
    let serial = Math.max(1, parseInt(slot.startSerial || '1') || 1)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [upc, countStr, customTid] = trimmed.split(',')
      const count = parseInt(countStr?.trim() || '0')
      if (count > 0 && upc) {
        const epcs = EPCGenerator.generateFromUpc(upc.trim(), count, serial)
        serial += count
        allTags.push(...epcs.map(epc => ({
          epc,
          tid: customTid?.trim() || epc,
          rssi
        })))
      }
    }
  }

  if (slot.epcList.trim()) {
    const lines = slot.epcList.trim().split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split(',')
      const epc = parts[0]?.trim()
      const customTid = parts[1]?.trim()
      if (epc) {
        allTags.push({
          epc,
          tid: customTid || epc,
          rssi
        })
      }
    }
  }

  return allTags
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
  rssi
}: HandheldTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sendingPorts, setSendingPorts] = useState<Set<number>>(new Set())
  const [runningPorts, setRunningPorts] = useState<Set<number>>(new Set())
  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = (message: string, port?: number) => {
    const prefix = port !== undefined ? `[${port}] ` : ''
    setLog(prev => [...prev, `[${formatTime()}] ${prefix}${message}`])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      setRunningPorts(prev => {
        const next = new Set(prev)
        next.delete(slot.port)
        return next
      })
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
    client.start(
      (msg) => addLog(msg, port),
      (err) => {
        addLog(`Error: ${err}`, port)
        publishStatus(handheldKey(port), { status: 'error', port, error: err })
      },
    )
    setRunningPorts(prev => new Set([...prev, port]))
    publishStatus(handheldKey(port), { status: 'connected', port, label: `HH :${port}` })
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

  const handleSendToSlot = async (slot: HandheldSlot) => {
    const tags = parseTagsFromSlot(slot, rssi)
    if (tags.length === 0) {
      addLog('Error: No EPCs generated', slot.port)
      return
    }

    const client = getClient(slot.port)
    const running = await client.isRunning()
    if (!running) {
      addLog('Error: Handheld server is not running. Click Start Server first.', slot.port)
      return
    }

    addLog(`Sending ${tags.length} EPC(s) to handheld on port ${slot.port}...`, slot.port)
    setSendingPorts(prev => new Set([...prev, slot.port]))
    publishStatus(handheldKey(slot.port), {
      status: 'sending',
      port: slot.port,
      detail: `sending ${tags.length} tag${tags.length === 1 ? '' : 's'}`,
    })

    const tagCount = tags.length
    await client.sendEpcs(
      tags,
      parseInt(handheldDelay, 10) || 0,
      (progress) => addLog(progress, slot.port),
      (complete) => {
        addLog(complete, slot.port)
        toast.success(`${tagCount} EPC(s) sent successfully`)
        setSendingPorts(prev => {
          const next = new Set(prev)
          next.delete(slot.port)
          return next
        })
        publishStatus(handheldKey(slot.port), {
          status: 'connected',
          port: slot.port,
          detail: undefined,
        })
      }
    )
  }

  const handleSendAll = async () => {
    const slotsWithTags = slots.filter(s => parseTagsFromSlot(s, rssi).length > 0)
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
    await Promise.all(slotsWithTags.map(slot => handleSendToSlot(slot)))
  }

  const handleStopSend = (port: number) => {
    const client = getClient(port)
    client.cancelSend()
    addLog('Stop requested.', port)
    setSendingPorts(prev => {
      const next = new Set(prev)
      next.delete(port)
      return next
    })
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className={cn(SECTION_CARD, 'shrink-0 px-4 py-3.5 sm:px-5 sm:py-4')} data-tour="tour-handheld-toolbar">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Point VSBL Debug at <strong className="font-mono text-foreground">YOUR_PC_IP:PORT</strong> for each slot below.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/25 px-3.5 py-2 sm:px-4">
              <Label
                htmlFor="handheld-inter-tag-delay"
                className="shrink-0 text-xs font-medium text-muted-foreground sm:text-[13px]"
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
              <Button
                size="sm"
                onClick={handleSendAll}
                disabled={
                  sendingPorts.size > 0 || slots.every((s) => parseTagsFromSlot(s, rssi).length === 0)
                }
                className="gap-1.5 rounded-lg shadow-sm shadow-primary/25"
              >
                <Zap className={`h-4 w-4 ${sendingPorts.size > 0 ? 'animate-pulse' : ''}`} />
                Send all
              </Button>
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
              onSend={() => handleSendToSlot(slot)}
              onCancelSend={() => handleStopSend(slot.port)}
              canRemove={slots.length > 1}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Log Area */}
      <Card className={cn(SECTION_CARD, 'max-h-[200px] min-h-[140px] shrink-0')} data-tour="tour-handheld-log">
        <CardHeader className="border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
              <Button variant="ghost" size="sm" className="h-8 rounded-md px-2.5 text-xs" onClick={() => setLog([])}>
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="bg-muted/15 p-2">
          <ScrollArea className="h-[120px]">
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
  onSend: () => void
  onCancelSend: () => void
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
  onSend,
  onCancelSend,
  canRemove,
}: HandheldSlotCardProps) {
  const fileInputUpcRef = useRef<HTMLInputElement>(null)
  const fileInputEpcRef = useRef<HTMLInputElement>(null)

  const handleImportUpc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      if (content) onUpdate({ upcList: content })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportUpc = () => {
    const blob = new Blob([slot.upcList], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `upc_port${slot.port}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportEpc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      if (content) onUpdate({ epcList: content })
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportEpc = () => {
    const blob = new Blob([slot.epcList], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `epc_port${slot.port}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className={cn(SECTION_CARD, 'flex min-h-0 flex-col overflow-hidden')}>
      <CardHeader className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Smartphone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base font-semibold tracking-tight">Port {slot.port}</CardTitle>
            </div>
            {isRunning && (
              <Badge
                variant="outline"
                className="inline-flex shrink-0 items-center gap-1.5 border-emerald-500/40 bg-emerald-500/10 py-0 px-2 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current shadow-[0_0_6px_rgba(34,197,94,0.85)]" />
                Running
              </Badge>
            )}
          </div>
          {canRemove && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
        <CardDescription className="mt-1.5 text-xs leading-relaxed">
          VSBL Debug → this machine on port <span className="font-mono text-foreground/90">{slot.port}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
        {/* Port + Server row */}
        <div className="flex shrink-0 gap-2">
          <Input
            type="number"
            value={slot.port}
            onChange={(e) => onUpdate({ port: parseInt(e.target.value) || DEFAULT_PORT })}
            className="h-9 w-[4.5rem] rounded-lg border-border/50 font-mono text-sm shadow-none"
            min={1024}
            max={65535}
          />
          <Button
            onClick={isRunning ? onStop : onStart}
            size="sm"
            variant={isRunning ? 'outline' : 'default'}
            className={cn('flex-1 gap-1.5 rounded-lg', !isRunning && 'shadow-sm shadow-primary/20')}
          >
            <Server className="h-3.5 w-3.5" />
            {isRunning ? 'Stop server' : 'Start server'}
          </Button>
        </div>

        {/* UPC / EPC tabs - full width textareas */}
        <Tabs defaultValue="upc" className="w-full" data-tour="tour-handheld-input-modes">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-muted/40 p-1 ring-1 ring-border/30">
            <TabsTrigger value="upc" className="rounded-md text-xs data-[state=active]:shadow-sm">
              UPC → EPC
            </TabsTrigger>
            <TabsTrigger value="epc" className="rounded-md text-xs data-[state=active]:shadow-sm">
              Direct EPC
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upc" className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">UPC,Count,TID · one per line</span>
              <div className="flex shrink-0 gap-1">
                <input type="file" ref={fileInputUpcRef} onChange={handleImportUpc} className="hidden" accept=".txt,.csv" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-md text-xs"
                  onClick={() => fileInputUpcRef.current?.click()}
                >
                  <Upload className="h-3 w-3" /> Import
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md text-xs" onClick={handleExportUpc}>
                  <Download className="h-3 w-3" /> Export
                </Button>
              </div>
            </div>
            <ExpandableTagField
              dialogTitle={`UPC → EPC — port ${slot.port}`}
              dialogDescription="UPC,Count,TID (one per line)"
              value={slot.upcList}
              onChange={(e) => onUpdate({ upcList: e.target.value })}
              onFileImport={(content) =>
                onUpdate({ upcList: slot.upcList ? slot.upcList + '\n' + content : content })
              }
              placeholder={'00000000000001,5\n00000000000002,3,CustomTID'}
              compactClassName="min-h-[110px] resize-y rounded-lg border-border/50 bg-muted/10 font-mono text-xs"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor={`start-serial-${slot.id}`} className="shrink-0 text-xs text-muted-foreground">
                Start serial
              </label>
              <Input
                id={`start-serial-${slot.id}`}
                type="number"
                min={1}
                max={999999999}
                value={slot.startSerial ?? '1'}
                onChange={(e) => onUpdate({ startSerial: e.target.value })}
                className="h-8 w-28 rounded-lg font-mono text-xs shadow-none"
                title="Starting SGTIN-96 serial number for the UPC list; increments across lines"
              />
              <span className="truncate text-[10px] text-muted-foreground/80">
                SGTIN-96 serial; continues across lines
              </span>
            </div>
          </TabsContent>
          <TabsContent value="epc" className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">EPC or EPC,TID · one per line</span>
              <div className="flex shrink-0 gap-1">
                <input type="file" ref={fileInputEpcRef} onChange={handleImportEpc} className="hidden" accept=".txt,.csv" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-md text-xs"
                  onClick={() => fileInputEpcRef.current?.click()}
                >
                  <Upload className="h-3 w-3" /> Import
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md text-xs" onClick={handleExportEpc}>
                  <Download className="h-3 w-3" /> Export
                </Button>
              </div>
            </div>
            <ExpandableTagField
              dialogTitle={`Direct EPC — port ${slot.port}`}
              dialogDescription="EPC or EPC,TID (one per line)"
              value={slot.epcList}
              onChange={(e) => onUpdate({ epcList: e.target.value })}
              onFileImport={(content) =>
                onUpdate({ epcList: slot.epcList ? slot.epcList + '\n' + content : content })
              }
              placeholder={'3034...\n3035...,CustomTID'}
              compactClassName="min-h-[110px] resize-y rounded-lg border-border/50 bg-muted/10 font-mono text-xs"
            />
          </TabsContent>
        </Tabs>

        {/* Send row */}
        <div className="flex shrink-0 gap-2 pt-1">
          <Button
            onClick={onSend}
            disabled={isSending || !isRunning}
            size="sm"
            className={cn(
              'flex-1 gap-1.5 rounded-lg',
              !isSending && isRunning && 'shadow-sm shadow-primary/20',
            )}
          >
            <Zap className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} />
            Send to port {slot.port}
          </Button>
          <Button
            onClick={onCancelSend}
            disabled={!isSending}
            variant="outline"
            size="icon"
            title="Stop send"
            className="h-9 w-9 shrink-0 rounded-lg"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
