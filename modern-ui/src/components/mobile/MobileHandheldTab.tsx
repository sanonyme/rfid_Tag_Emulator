import { useState, useRef, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ExpandableTagField } from '../ExpandableTagField'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Smartphone, Zap, StopCircle, Server, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { HandheldServerClient, expandUpcListToEpcs } from '@/lib/tcp-client'
import { useSettings } from '@/lib/settings-context'
import { formatTime, cn } from '@/lib/utils'
import type { HandheldSlot } from '../HandheldTab'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import {
  getHandheldFullActivityLog,
  setHandheldFullActivityLog,
  shouldAppendHandheldLogLine,
} from '@/lib/handheld-log-settings'

const DEFAULT_PORT = 10472
const MAX_LOG = 400
const clientCache = new Map<number, HandheldServerClient>()
function getClient(port: number) {
  if (!clientCache.has(port)) clientCache.set(port, new HandheldServerClient(port))
  return clientCache.get(port)!
}

function parseTagsFromSlot(
  slot: HandheldSlot,
  rssi: string,
  serialContinuesAcrossUpcLines: boolean,
): { epc: string; tid?: string; rssi: string }[] {
  const all: { epc: string; tid?: string; rssi: string }[] = []
  if (slot.upcList.trim()) {
    const expanded = expandUpcListToEpcs(
      slot.upcList,
      slot.startSerial ?? '1',
      serialContinuesAcrossUpcLines,
    )
    all.push(...expanded.map(({ epc, customTid }) => ({ epc, tid: customTid || epc, rssi })))
  }
  if (slot.epcList.trim()) {
    for (const line of slot.epcList.trim().split('\n')) {
      const t = line.trim()
      if (!t) continue
      const [epc, tid] = t.split(',')
      if (epc?.trim()) all.push({ epc: epc.trim(), tid: tid?.trim() || epc.trim(), rssi })
    }
  }
  return all
}

function handheldSlotParseKey(
  s: HandheldSlot,
  rssi: string,
  serialContinuesAcrossUpcLines: boolean,
): string {
  return `${s.upcList}\0${s.epcList}\0${s.startSerial ?? '1'}\0${serialContinuesAcrossUpcLines ? '1' : '0'}\0${rssi}`
}

interface MobileHandheldTabProps {
  slots: HandheldSlot[]
  setSlots: (slots: HandheldSlot[]) => void
  handheldDelay: string
  setHandheldDelay: (d: string) => void
  rssi: string
}

export function MobileHandheldTab({
  slots,
  setSlots,
  handheldDelay,
  setHandheldDelay,
  rssi,
}: MobileHandheldTabProps) {
  const { settings } = useSettings()
  const serialContinuesAcrossUpcLines = settings.handheldSerialContinuesAcrossUpcLines
  const [log, setLog] = useState<string[]>([])
  const [fullActivityLog, setFullActivityLog] = useState(() => getHandheldFullActivityLog())
  const [sendingPorts, setSendingPorts] = useState<Set<number>>(new Set())
  const [runningPorts, setRunningPorts] = useState<Set<number>>(new Set())
  const [logExpanded, setLogExpanded] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)
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

  const addLog = (msg: string) => {
    if (!shouldAppendHandheldLogLine(msg, fullActivityLogRef.current)) return
    setLog((p) => [...p, `[${formatTime()}] ${msg}`].slice(-MAX_LOG))
  }
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    if (slots.length === 0) {
      setSlots([{ id: crypto.randomUUID(), port: DEFAULT_PORT, upcList: '', epcList: '', startSerial: '1' }])
    }
  }, [])

  const slot = slots[0] ?? { id: crypto.randomUUID(), port: DEFAULT_PORT, upcList: '', epcList: '', startSerial: '1' }

  const isRunning = runningPorts.has(slot.port)
  const isSending = sendingPorts.has(slot.port)
  const tags = parseTagsFromSlot(slot, rssi, serialContinuesAcrossUpcLines)

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
  const runMobileSend = async (loop: boolean) => {
    const curSlot = slotsRef.current[0] ?? slot
    const port = curSlot.port
    const slotId = curSlot.id

    if (!parseTagsFromSlot(curSlot, rssiRef.current, serialContinuesRef.current).length) {
      addLog('Error: No tags')
      return
    }
    if (!runningPorts.has(port)) {
      addLog('Error: Start server first')
      return
    }

    loopCancelRef.current.delete(port)
    const client = getClient(port)
    const startedRepeat = loop

    if (startedRepeat) {
      addLog('Loop send started. Use Stop to end.')
    }

    setSendingPorts((p) => new Set([...p, port]))

    const fatalFinish = (msg: string) =>
      loopCancelRef.current.has(port) ||
      /no handheld connected|cancelled by user|^stopped:/i.test(msg)

    let round = 0
    let cachedRoundTags: ReturnType<typeof parseTagsFromSlot> | null = null
    let cachedParseKey = ''

    while (true) {
      if (loopCancelRef.current.has(port)) break

      const s =
        slotsRef.current.find((x) => x.id === slotId) ??
        slotsRef.current[0] ??
        curSlot
      if (!s) {
        addLog('No slot; stopping.')
        break
      }

      const parseKey = handheldSlotParseKey(s, rssiRef.current, serialContinuesRef.current)
      if (parseKey !== cachedParseKey) {
        cachedRoundTags = parseTagsFromSlot(s, rssiRef.current, serialContinuesRef.current)
        cachedParseKey = parseKey
      }
      const roundTags = cachedRoundTags!
      if (!roundTags.length) {
        addLog('Error: No tags; stopping.')
        break
      }

      if (!(await client.isRunning())) {
        addLog('Handheld server not running; ending send.')
        break
      }

      round++
      if (startedRepeat) addLog(`— Round ${round} (${roundTags.length} tag(s)) —`)

      let completeMsg = ''
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = () => {
          if (!settled) {
            settled = true
            resolve()
          }
        }
        client.sendEpcs(
          roundTags,
          parseInt(handheldDelayRef.current, 10) || 0,
          (p) => {
            if (fullActivityLogRef.current) addLog(p)
          },
          (c) => {
            completeMsg = c
            addLog(c)
            finish()
          },
          fullActivityLogRef.current
        )
      })

      if (fatalFinish(completeMsg)) break
      if (!startedRepeat) break
    }

    if (startedRepeat && round > 0) {
      addLog(loopCancelRef.current.has(port) ? 'Loop send stopped.' : 'Loop send ended.')
    }

    const userCancelled = loopCancelRef.current.has(port)
    loopCancelRef.current.delete(port)
    setSendingPorts((s) => {
      const n = new Set(s)
      n.delete(port)
      return n
    })

    if (startedRepeat && userCancelled) {
      toast.info('Loop send stopped')
    }
  }

  const handleSendOnce = () => runMobileSend(false)
  const handleLoopSend = () => runMobileSend(true)
  const handleCancelSend = () => {
    const p = slotsRef.current[0]?.port ?? slot.port
    loopCancelRef.current.add(p)
    getClient(p).cancelSend()
    addLog('Stop requested.')
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
        Connect VSBL Debug to <strong>YOUR_PC_IP:{slot.port}</strong>. RSSI uses the same value as the Fixed tab ({rssi} dBm).
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor="m-handheld-delay" className="text-xs text-muted-foreground shrink-0">
          Inter-tag delay (ms)
        </label>
        <Input
          id="m-handheld-delay"
          type="number"
          min={0}
          className="h-10 w-28 font-mono text-sm"
          value={handheldDelay}
          onChange={(e) => setHandheldDelay(e.target.value)}
        />
      </div>

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
            <TabsContent value="upc" className="mt-3 space-y-2">
              <ExpandableTagField
                dialogTitle={`UPC → EPC — port ${slot.port}`}
                dialogDescription="One line per UPC,Count,TID"
                value={slot.upcList}
                onChange={(e) => updateSlot({ upcList: e.target.value })}
                onFileImport={(c) => updateSlot({ upcList: slot.upcList ? slot.upcList + '\n' + c : c })}
                placeholder="00000000000001,5"
                compactClassName="font-mono text-sm min-h-[100px]"
              />
              <div className="flex items-center gap-2">
                <label htmlFor={`m-start-serial-${slot.id}`} className="text-xs text-muted-foreground shrink-0">
                  Start Serial
                </label>
                <Input
                  id={`m-start-serial-${slot.id}`}
                  type="number"
                  min={1}
                  max={999999999}
                  value={slot.startSerial ?? '1'}
                  onChange={(e) => updateSlot({ startSerial: e.target.value })}
                  className="h-10 w-32 font-mono text-sm"
                />
              </div>
            </TabsContent>
            <TabsContent value="epc" className="mt-3">
              <ExpandableTagField
                dialogTitle={`Direct EPC — port ${slot.port}`}
                dialogDescription="EPC or EPC,TID (one per line)"
                value={slot.epcList}
                onChange={(e) => updateSlot({ epcList: e.target.value })}
                onFileImport={(c) => updateSlot({ epcList: slot.epcList ? slot.epcList + '\n' + c : c })}
                placeholder="EPC or EPC,TID"
                compactClassName="font-mono text-sm min-h-[100px]"
              />
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSendOnce}
              disabled={isSending || !isRunning || tags.length === 0}
              className="h-12 w-full gap-2"
            >
              <Zap className="h-4 w-4 shrink-0" />
              Send ({tags.length})
            </Button>
            <Button
              onClick={isSending ? handleCancelSend : handleLoopSend}
              disabled={!isRunning || (!isSending && tags.length === 0)}
              variant={isSending ? 'destructive' : 'outline'}
              className={cn('h-12 w-full gap-2', !isSending && 'bg-background')}
            >
              {isSending ? (
                <>
                  <StopCircle className="h-4 w-4 shrink-0 animate-spin" />
                  Stop
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 shrink-0" />
                  Loop Send
                </>
              )}
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Log</span>
            <div
              className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              <Switch
                id="m-log-detail"
                checked={fullActivityLog}
                onCheckedChange={(v) => {
                  setFullActivityLog(v)
                  setHandheldFullActivityLog(v)
                }}
              />
              <Label
                htmlFor="m-log-detail"
                className="cursor-pointer text-xs text-muted-foreground"
                title="Off: connections & errors only. On: full send activity."
              >
                Full activity log
              </Label>
            </div>
          </div>
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
