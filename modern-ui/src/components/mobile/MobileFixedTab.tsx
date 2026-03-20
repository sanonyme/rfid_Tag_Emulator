import { useState, useRef, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { DropTextarea } from '../DropTextarea'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Slider } from '../ui/slider'
import { Zap, StopCircle, Activity, Radio, Copy, Download, ChevronDown, ChevronUp, RefreshCw, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { TCPEmulatorClient, EPCGenerator, type TagData } from '@/lib/tcp-client'
import { formatTime, scrollLogAnchorIntoView } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import { AleApiClient, type LogicalDevice } from '@/lib/ale-api'

interface MobileFixedTabProps {
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  port: string
  setPort: (port: string) => void
  alePort: string
  setAlePort: (port: string) => void
  connected: boolean
  setConnected: (connected: boolean) => void
  driver: string
  setDriver: (driver: string) => void
  uid: string
  setUid: (uid: string) => void
  antenna: string
  setAntenna: (antenna: string) => void
  rssi: string
  setRssi: (rssi: string) => void
  startSerial: string
  setStartSerial: (startSerial: string) => void
  upcList: string
  setUpcList: (upcList: string) => void
  epcList: string
  setEpcList: (epcList: string) => void
  delay: string
  setDelay: (delay: string) => void
}

const VENDOR_DRIVERS = [
  { code: 'llrp', name: 'All' },
  { code: 'arp', name: 'Alien' },
  { code: 'impinjetk', name: 'Impinj R700' },
  { code: 'octane', name: 'Impinj Others' },
  { code: 'seuic', name: 'SEUIC' },
]

export function MobileFixedTab(props: MobileFixedTabProps) {
  const {
    emulator,
    host,
    connected,
    setConnected,
    driver,
    setDriver,
    uid,
    setUid,
    antenna,
    setAntenna,
    rssi,
    setRssi,
    startSerial,
    setStartSerial,
    upcList,
    setUpcList,
    epcList,
    setEpcList,
    delay,
    setDelay,
    alePort,
    setAlePort,
  } = props

  const [log, setLog] = useState<string[]>([])
  const [logicalDevices, setLogicalDevices] = useState<LogicalDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [apiClient] = useState(() => new AleApiClient())
  const [sending, setSending] = useState(false)
  const [looping, setLooping] = useState(false)
  const loopingRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const [logExpanded, setLogExpanded] = useState(true)

  const totalInputRows = [
    ...upcList.trim().split('\n').filter((l) => l.trim()),
    ...epcList.trim().split('\n').filter((l) => l.trim()),
  ].filter(Boolean).length

  const addLog = (message: string) => {
    setLog((prev) => [...prev, `[${formatTime()}] ${message}`].slice(-200))
  }

  useEffect(() => {
    scrollLogAnchorIntoView(logEndRef.current, 'smooth')
  }, [log])

  useEffect(() => {
    const syncConnectionState = async () => {
      const isConnected = await emulator.isConnected()
      if (isConnected !== connected) setConnected(isConnected)
    }
    syncConnectionState()
  }, [emulator, connected, setConnected])

  const selectedUids = uid ? uid.split(',').filter(Boolean) : []

  const fetchLogicalDevices = async () => {
    if (!host) {
      addLog('Error: Host required to fetch devices')
      return
    }
    setIsLoadingDevices(true)
    addLog(`Fetching logical devices from ${host}:${alePort}...`)
    try {
      const devices = await apiClient.getLogicalDevices(host, alePort)
      setLogicalDevices(devices)
      addLog(`Fetched ${devices.length} logical devices`)
      if (devices.length > 0 && !uid) setUid(devices[0].uid)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch'
      addLog(`Error: ${msg}`)
      if (msg.includes('NetworkError') || msg.includes('fetch')) {
        addLog('Tip: Use same WiFi as PC. Access app at http://<PC-IP>:5174')
      }
    } finally {
      setIsLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (connected && host) fetchLogicalDevices()
  }, [connected])

  const toggleDevice = (deviceUid: string) => {
    const current = new Set(selectedUids)
    if (current.has(deviceUid)) current.delete(deviceUid)
    else current.add(deviceUid)
    setUid(Array.from(current).join(','))
  }

  const selectAll = () => setUid(logicalDevices.map((d) => d.uid).join(','))
  const deselectAll = () => setUid('')

  const handleSendTags = async (isLoop = false) => {
    const isConnected = await emulator.isConnected()
    if (!isConnected) {
      addLog('Error: Not connected')
      if (isLoop) {
        setLooping(false)
        loopingRef.current = false
      }
      return
    }

    const tags: TagData[] = []
    const selectedAntennas = antenna.split(',').filter(Boolean).map(Number)
    if (selectedAntennas.length === 0) selectedAntennas.push(1)

    const targetUids = selectedUids.length > 0 ? selectedUids : ['']

    if (epcList.trim()) {
      const lines = epcList.trim().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const parts = trimmed.split(',')
        const epc = parts[0]?.trim()
        const customTid = parts[1]?.trim()
        if (epc) {
          for (const targetUid of targetUids) {
            for (const ant of selectedAntennas) {
              tags.push({ epc, tid: customTid || epc, uid: targetUid, antenna: ant, rssi })
            }
          }
        }
      }
    }

    if (upcList.trim()) {
      const lines = upcList.trim().split('\n')
      let serial = parseInt(startSerial)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [upc, countStr, customTid] = trimmed.split(',')
        const count = parseInt(countStr?.trim() || '0')
        if (count > 0 && upc) {
          const epcs = EPCGenerator.generateFromUpc(upc.trim(), count, serial)
          for (const targetUid of targetUids) {
            for (const epc of epcs) {
              for (const ant of selectedAntennas) {
                tags.push({ epc, tid: customTid?.trim() || epc, uid: targetUid, antenna: ant, rssi })
              }
            }
          }
          serial += count
        }
      }
    }

    if (tags.length === 0) {
      addLog('Error: No valid EPCs')
      if (isLoop) {
        setLooping(false)
        loopingRef.current = false
      }
      return
    }

    addLog(`Sending ${tags.length} tag(s)...`)
    if (!isLoop) setSending(true)

    await emulator.sendTags(
      tags,
      driver,
      parseInt(delay),
      (p) => addLog(p),
      (complete) => {
        addLog(complete)
        if (isLoop && loopingRef.current) {
          handleSendTags(true)
        } else {
          setSending(false)
          if (!isLoop) toast.success(`${tags.length} tag(s) sent`)
          if (isLoop) {
            setLooping(false)
            loopingRef.current = false
          }
        }
      }
    )
  }

  const handleToggleLoop = () => {
    if (looping) {
      emulator.cancelSend()
      loopingRef.current = false
      setLooping(false)
      setSending(false)
      addLog('Stop requested.')
    } else {
      setLooping(true)
      loopingRef.current = true
      addLog('Loop started')
      handleSendTags(true)
    }
  }

  const handleStop = () => {
    emulator.cancelSend()
    loopingRef.current = false
    setLooping(false)
    setSending(false)
    addLog('Stop requested.')
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Tag Defaults */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tag Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Antennas</Label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((ant) => {
                const selected = antenna.split(',').filter(Boolean).includes(String(ant))
                return (
                  <button
                    key={ant}
                    type="button"
                    onClick={() => {
                      const current = new Set(antenna.split(',').filter(Boolean))
                      if (current.has(String(ant))) current.delete(String(ant))
                      else current.add(String(ant))
                      setAntenna(Array.from(current).sort((a, b) => Number(a) - Number(b)).join(',') || '1')
                    }}
                    className={`flex flex-col items-center justify-center h-14 rounded-xl border-2 transition-all ${
                      selected ? 'border-primary bg-primary/15' : 'border-border bg-muted/50'
                    }`}
                  >
                    <Radio className={`w-4 h-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-medium">{ant}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>RSSI</Label>
              <span className="text-xs text-muted-foreground">{rssi} dBm</span>
            </div>
            <Slider
              value={[parseFloat(rssi) || -45]}
              onValueChange={([v]) => setRssi(v.toFixed(1))}
              min={-80}
              max={0}
              step={0.5}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logical Device */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Logical Device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Device</Label>
              <span className="text-xs text-muted-foreground">ALE port:</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                value={alePort}
                onChange={(e) => setAlePort(e.target.value)}
                placeholder="80"
                className="h-10 w-16 font-mono"
              />
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-between h-12">
                    <span className="truncate">
                      {selectedUids.length === 0
                        ? 'Select Device(s)'
                        : selectedUids.length === 1
                          ? logicalDevices.find((d) => d.uid === selectedUids[0])?.name || selectedUids[0]
                          : `${selectedUids.length} Selected`}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[min(400px,90vw)] max-h-[70vh] flex flex-col rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>Select Logical Devices</DialogTitle>
                    <DialogDescription>Select devices to send tags to.</DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={selectAll} className="flex-1">
                      Select All
                    </Button>
                    <Button size="sm" variant="ghost" onClick={deselectAll} className="flex-1">
                      Deselect All
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 min-h-[200px]">
                    <div className="space-y-1 pr-2">
                      {logicalDevices.length === 0 ? (
                        <p className="text-center py-6 text-muted-foreground text-sm">
                          No devices. Tap refresh to fetch.
                        </p>
                      ) : (
                        logicalDevices.map((device) => (
                          <button
                            key={device.uid}
                            type="button"
                            onClick={() => toggleDevice(device.uid)}
                            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-muted text-left"
                          >
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                                selectedUids.includes(device.uid)
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-input'
                              }`}
                            >
                              {selectedUids.includes(device.uid) && <Check className="w-3 h-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{device.name}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate">{device.uid}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
              <Button
                size="icon"
                variant="outline"
                className="h-12 w-12 shrink-0"
                onClick={fetchLogicalDevices}
                disabled={isLoadingDevices || !host}
                title="Fetch devices"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingDevices ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Driver */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Driver</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Driver</Label>
            <Select value={driver} onValueChange={setDriver}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDOR_DRIVERS.map((d) => (
                  <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delay">Delay (ms)</Label>
            <Input id="delay" type="number" min="0" value={delay} onChange={(e) => setDelay(e.target.value)} className="h-12" />
          </div>
        </CardContent>
      </Card>

      {/* UPC / EPC Input */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">UPC → EPC</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DropTextarea
            value={upcList}
            onChange={(e) => setUpcList(e.target.value)}
            onFileImport={(c) => setUpcList(upcList ? upcList + '\n' + c : c)}
            placeholder="00000000000001,5"
            className="font-mono text-sm min-h-[80px]"
          />
          <div className="space-y-2">
            <Label>Start Serial</Label>
            <Input type="number" min="1" value={startSerial} onChange={(e) => setStartSerial(e.target.value)} className="h-12" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Direct EPC</CardTitle>
        </CardHeader>
        <CardContent>
          <DropTextarea
            value={epcList}
            onChange={(e) => setEpcList(e.target.value)}
            onFileImport={(c) => setEpcList(epcList ? epcList + '\n' + c : c)}
            placeholder="EPC or EPC,TID"
            className="font-mono text-sm min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Send Controls */}
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="h-14 text-base"
          onClick={() => handleSendTags(false)}
          disabled={!connected || sending || looping}
        >
          <Zap className="w-5 h-5 mr-2" />
          Send Tags
        </Button>
        <Button
          size="lg"
          variant={sending || looping ? 'destructive' : 'outline'}
          className="h-14 text-base"
          onClick={sending || looping ? handleStop : handleToggleLoop}
          disabled={!connected || (!sending && !looping && totalInputRows === 0)}
        >
          {sending || looping ? (
            <>
              <StopCircle className="w-5 h-5 mr-2" />
              Stop
            </>
          ) : (
            <>
              <Activity className="w-5 h-5 mr-2" />
              Loop Send
            </>
          )}
        </Button>
      </div>

      {/* Log */}
      <Card className="border-border/50">
        <button
          type="button"
          className="w-full flex items-center justify-between p-4"
          onClick={() => setLogExpanded(!logExpanded)}
        >
          <span className="font-medium flex items-center gap-2">
            Log
            {(sending || looping) && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </span>
          {logExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {logExpanded && (
          <CardContent className="pt-0">
            <div className="flex gap-2 mb-2">
              {log.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(log.join('\n')); toast.success('Copied') }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { const b = new Blob([log.join('\n')]); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `log-${Date.now()}.txt`; a.click(); toast.success('Exported') }}>
                    <Download className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLog([])}>Clear</Button>
            </div>
            <div className="font-mono text-xs space-y-1 max-h-40 overflow-y-auto bg-muted/30 rounded-lg p-2">
              {log.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No activity yet</p>
              ) : (
                log.map((line, i) => (
                  <div key={i} className="text-muted-foreground">{line}</div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
