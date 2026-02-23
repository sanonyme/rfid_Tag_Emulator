import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Smartphone, Zap, StopCircle, Server, Plus, Trash2, Upload, Download } from 'lucide-react'
import { HandheldServerClient, EPCGenerator } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'

export interface HandheldSlot {
  id: string
  port: number
  upcList: string
  epcList: string
}

interface HandheldTabProps {
  slots: HandheldSlot[]
  setSlots: (slots: HandheldSlot[]) => void
  delay: string
  setDelay: (_delay: string) => void
}

const DEFAULT_PORT = 10472

function parseTagsFromSlot(slot: HandheldSlot): { epc: string; tid?: string }[] {
  const allTags: { epc: string; tid?: string }[] = []

  if (slot.upcList.trim()) {
    const lines = slot.upcList.trim().split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [upc, countStr, customTid] = trimmed.split(',')
      const count = parseInt(countStr?.trim() || '0')
      if (count > 0 && upc) {
        const epcs = EPCGenerator.generateFromUpc(upc.trim(), count)
        allTags.push(...epcs.map(epc => ({
          epc,
          tid: customTid?.trim() || epc
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
          tid: customTid || epc
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
  delay,
  setDelay: _setDelay
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
        epcList: ''
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
    }
    setSlots(slots.filter(s => s.id !== id))
  }

  const updateSlot = (id: string, updates: Partial<Omit<HandheldSlot, 'id'>>) => {
    setSlots(slots.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  const handleStartServer = async (port: number) => {
    const client = getClient(port)
    client.start(
      (msg) => addLog(msg, port),
      (err) => addLog(`Error: ${err}`, port)
    )
    setRunningPorts(prev => new Set([...prev, port]))
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
  }

  const handleSendToSlot = async (slot: HandheldSlot) => {
    const tags = parseTagsFromSlot(slot)
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

    await client.sendEpcs(
      tags,
      parseInt(delay) || 100,
      (progress) => addLog(progress, slot.port),
      (complete) => {
        addLog(complete, slot.port)
        setSendingPorts(prev => {
          const next = new Set(prev)
          next.delete(slot.port)
          return next
        })
      }
    )
  }

  const handleSendAll = async () => {
    const slotsWithTags = slots.filter(s => parseTagsFromSlot(s).length > 0)
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
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <p className="text-sm text-muted-foreground">
          Configure VSBL Debug on each device to connect to <strong className="text-foreground">YOUR_PC_IP:PORT</strong>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={addSlot} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Handheld
          </Button>
          <Button variant="outline" size="sm" onClick={handleStartAll}>
            Start All
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopAll}>
            Stop All
          </Button>
          <Button
            size="sm"
            onClick={handleSendAll}
            disabled={sendingPorts.size > 0 || slots.every(s => parseTagsFromSlot(s).length === 0)}
            className="gap-1.5"
          >
            <Zap className={`w-4 h-4 ${sendingPorts.size > 0 ? 'animate-pulse' : ''}`} />
            Send All
          </Button>
        </div>
      </div>

      {/* Handheld slots - responsive grid */}
      <div
        className="grid gap-4 overflow-auto min-h-0"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${slots.length === 1 ? '420px' : '380px'}, 1fr))` }}
      >
        {slots.map((slot) => (
          <HandheldSlotCard
            key={slot.id}
            slot={slot}
            delay={delay}
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

      {/* Log Area */}
      <Card className="shrink-0 min-h-[140px] max-h-[180px] border-border/50 bg-card transition-all duration-300">
        <CardHeader className="py-2 px-4 border-b border-border/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Activity Log
              {sendingPorts.size > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLog([])}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 bg-muted/20">
          <ScrollArea className="h-[100px]">
            <div className="font-mono text-xs space-y-0.5 px-2 py-1">
              {log.map((line, i) => (
                <div key={i} className="text-muted-foreground hover:text-foreground transition-colors py-0.5 px-2 rounded hover:bg-accent/30">
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
  delay: string
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
  canRemove
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
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-300 overflow-hidden flex flex-col min-h-0">
      <CardHeader className="pb-3 pt-4 px-4 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 text-primary shrink-0" />
            <CardTitle className="text-base font-semibold truncate">
              Port {slot.port}
            </CardTitle>
            {isRunning && (
              <Badge variant="outline" className="text-xs py-0 bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400 shrink-0">
                ● Running
              </Badge>
            )}
          </div>
          {canRemove && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove}>
              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
        <CardDescription className="text-xs mt-1">
          Connect VSBL Debug to this PC:{slot.port}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pb-4 px-4 flex-1 min-h-0">
        {/* Port + Server row */}
        <div className="flex gap-2 shrink-0">
          <Input
            type="number"
            value={slot.port}
            onChange={(e) => onUpdate({ port: parseInt(e.target.value) || DEFAULT_PORT })}
            className="w-20 font-mono"
            min={1024}
            max={65535}
          />
          <Button
            onClick={isRunning ? onStop : onStart}
            size="sm"
            variant={isRunning ? 'outline' : 'default'}
            className="flex-1 gap-1.5"
          >
            <Server className="w-3.5 h-3.5" />
            {isRunning ? 'Stop Server' : 'Start Server'}
          </Button>
        </div>

        {/* UPC / EPC tabs - full width textareas */}
        <Tabs defaultValue="upc" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upc" className="text-xs">UPC → EPC</TabsTrigger>
            <TabsTrigger value="epc" className="text-xs">Direct EPC</TabsTrigger>
          </TabsList>
          <TabsContent value="upc" className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-muted-foreground">UPC,Count,TID (one per line)</span>
              <div className="flex gap-1 shrink-0">
                <input type="file" ref={fileInputUpcRef} onChange={handleImportUpc} className="hidden" accept=".txt,.csv" />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputUpcRef.current?.click()}>
                  <Upload className="w-3 h-3" /> Import
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleExportUpc}>
                  <Download className="w-3 h-3" /> Export
                </Button>
              </div>
            </div>
            <Textarea
              value={slot.upcList}
              onChange={(e) => onUpdate({ upcList: e.target.value })}
              placeholder={'00000000000001,5\n00000000000002,3,CustomTID'}
              className="font-mono text-xs min-h-[110px] resize-y"
            />
          </TabsContent>
          <TabsContent value="epc" className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-muted-foreground">EPC or EPC,TID (one per line)</span>
              <div className="flex gap-1 shrink-0">
                <input type="file" ref={fileInputEpcRef} onChange={handleImportEpc} className="hidden" accept=".txt,.csv" />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputEpcRef.current?.click()}>
                  <Upload className="w-3 h-3" /> Import
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleExportEpc}>
                  <Download className="w-3 h-3" /> Export
                </Button>
              </div>
            </div>
            <Textarea
              value={slot.epcList}
              onChange={(e) => onUpdate({ epcList: e.target.value })}
              placeholder={'3034...\n3035...,CustomTID'}
              className="font-mono text-xs min-h-[110px] resize-y"
            />
          </TabsContent>
        </Tabs>

        {/* Send row */}
        <div className="flex gap-2 shrink-0 pt-1">
          <Button
            onClick={onSend}
            disabled={isSending || !isRunning}
            size="sm"
            className="flex-1 gap-1.5"
          >
            <Zap className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
            Send to Port {slot.port}
          </Button>
          <Button
            onClick={onCancelSend}
            disabled={!isSending}
            variant="outline"
            size="sm"
            title="Stop send"
          >
            <StopCircle className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
