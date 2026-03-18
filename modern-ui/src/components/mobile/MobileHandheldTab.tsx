import { useState, useRef, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { DropTextarea } from '../DropTextarea'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Smartphone, Zap, StopCircle, Server, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { HandheldServerClient, EPCGenerator } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'
import type { HandheldSlot } from '../HandheldTab'

const DEFAULT_PORT = 10472
const clientCache = new Map<number, HandheldServerClient>()
function getClient(port: number) {
  if (!clientCache.has(port)) clientCache.set(port, new HandheldServerClient(port))
  return clientCache.get(port)!
}

function parseTagsFromSlot(slot: HandheldSlot): { epc: string; tid?: string }[] {
  const all: { epc: string; tid?: string }[] = []
  if (slot.upcList.trim()) {
    for (const line of slot.upcList.trim().split('\n')) {
      const t = line.trim()
      if (!t) continue
      const [upc, countStr, customTid] = t.split(',')
      const count = parseInt(countStr?.trim() || '0')
      if (count > 0 && upc) {
        const epcs = EPCGenerator.generateFromUpc(upc.trim(), count)
        all.push(...epcs.map((epc) => ({ epc, tid: customTid?.trim() || epc })))
      }
    }
  }
  if (slot.epcList.trim()) {
    for (const line of slot.epcList.trim().split('\n')) {
      const t = line.trim()
      if (!t) continue
      const [epc, tid] = t.split(',')
      if (epc?.trim()) all.push({ epc: epc.trim(), tid: tid?.trim() || epc.trim() })
    }
  }
  return all
}

interface MobileHandheldTabProps {
  slots: HandheldSlot[]
  setSlots: (slots: HandheldSlot[]) => void
  delay: string
  setDelay: (d: string) => void
}

export function MobileHandheldTab({ slots, setSlots, delay }: MobileHandheldTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sendingPorts, setSendingPorts] = useState<Set<number>>(new Set())
  const [runningPorts, setRunningPorts] = useState<Set<number>>(new Set())
  const [logExpanded, setLogExpanded] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => setLog((p) => [...p, `[${formatTime()}] ${msg}`].slice(-100))
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    if (slots.length === 0) {
      setSlots([{ id: crypto.randomUUID(), port: DEFAULT_PORT, upcList: '', epcList: '' }])
    }
  }, [])

  const slot = slots[0] ?? { id: crypto.randomUUID(), port: DEFAULT_PORT, upcList: '', epcList: '' }

  const isRunning = runningPorts.has(slot.port)
  const isSending = sendingPorts.has(slot.port)
  const tags = parseTagsFromSlot(slot)

  const handleStart = () => {
    getClient(slot.port).start((m) => addLog(m), (e) => addLog(`Error: ${e}`))
    setRunningPorts((p) => new Set([...p, slot.port]))
  }
  const handleStop = () => {
    getClient(slot.port).shutdown()
    setRunningPorts((p) => {
      const n = new Set(p)
      n.delete(slot.port)
      return n
    })
    addLog(`Stopped port ${slot.port}`)
  }
  const handleSend = async () => {
    if (tags.length === 0) {
      addLog('Error: No tags')
      return
    }
    if (!isRunning) {
      addLog('Error: Start server first')
      return
    }
    addLog(`Sending ${tags.length} EPC(s)...`)
    setSendingPorts((p) => new Set([...p, slot.port]))
    await getClient(slot.port).sendEpcs(
      tags,
      parseInt(delay) || 100,
      (p) => addLog(p),
      (c) => {
        addLog(c)
        toast.success(`${tags.length} EPC(s) sent`)
        setSendingPorts((s) => {
          const n = new Set(s)
          n.delete(slot.port)
          return n
        })
      }
    )
  }
  const handleCancelSend = () => {
    getClient(slot.port).cancelSend()
    setSendingPorts((p) => {
      const n = new Set(p)
      n.delete(slot.port)
      return n
    })
  }

  const updateSlot = (updates: Partial<HandheldSlot>) => {
    if (slots.length === 0) {
      setSlots([{ ...slot, ...updates }])
    } else {
      setSlots(slots.map((s) => (s.id === slot.id ? { ...s, ...updates } : s)))
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <p className="text-sm text-muted-foreground">
        Connect VSBL Debug to <strong>YOUR_PC_IP:{slot.port}</strong>
      </p>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />
              Port {slot.port}
            </CardTitle>
            {isRunning && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Running</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="number"
              value={slot.port}
              onChange={(e) => updateSlot({ port: parseInt(e.target.value) || DEFAULT_PORT })}
              className="w-24 h-12 font-mono"
              min={1024}
              max={65535}
            />
            <Button
              onClick={isRunning ? handleStop : handleStart}
              variant={isRunning ? 'outline' : 'default'}
              className="flex-1 h-12"
            >
              <Server className="w-4 h-4 mr-2" />
              {isRunning ? 'Stop' : 'Start'} Server
            </Button>
          </div>

          <Tabs defaultValue="upc" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12">
              <TabsTrigger value="upc">UPC → EPC</TabsTrigger>
              <TabsTrigger value="epc">Direct EPC</TabsTrigger>
            </TabsList>
            <TabsContent value="upc" className="mt-3">
              <DropTextarea
                value={slot.upcList}
                onChange={(e) => updateSlot({ upcList: e.target.value })}
                onFileImport={(c) => updateSlot({ upcList: slot.upcList ? slot.upcList + '\n' + c : c })}
                placeholder="00000000000001,5"
                className="font-mono text-sm min-h-[100px]"
              />
            </TabsContent>
            <TabsContent value="epc" className="mt-3">
              <DropTextarea
                value={slot.epcList}
                onChange={(e) => updateSlot({ epcList: e.target.value })}
                onFileImport={(c) => updateSlot({ epcList: slot.epcList ? slot.epcList + '\n' + c : c })}
                placeholder="EPC or EPC,TID"
                className="font-mono text-sm min-h-[100px]"
              />
            </TabsContent>
          </Tabs>

          <div className="flex gap-2">
            <Button
              onClick={handleSend}
              disabled={isSending || !isRunning || tags.length === 0}
              className="flex-1 h-12"
            >
              <Zap className={`w-4 h-4 mr-2 ${isSending ? 'animate-pulse' : ''}`} />
              Send ({tags.length})
            </Button>
            <Button
              onClick={handleCancelSend}
              disabled={!isSending}
              variant="outline"
              className="h-12 px-4"
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <button
          type="button"
          className="w-full flex items-center justify-between p-4"
          onClick={() => setLogExpanded(!logExpanded)}
        >
          <span className="font-medium">Log</span>
          {logExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {logExpanded && (
          <CardContent className="pt-0">
            <div className="flex gap-2 mb-2">
              <Button size="sm" variant="ghost" onClick={() => setLog([])}>
                Clear
              </Button>
            </div>
            <div className="font-mono text-xs space-y-1 max-h-32 overflow-y-auto bg-muted/30 rounded-lg p-2">
              {log.map((line, i) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
