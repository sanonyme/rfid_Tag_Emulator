import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { DropTextarea } from './DropTextarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { ScrollArea } from './ui/scroll-area'
import { Zap, StopCircle, Activity, RefreshCw, Radio, Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { TCPEmulatorClient, EPCGenerator, type TagData } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'
import { AleApiClient, type LogicalDevice } from '@/lib/ale-api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Check, ChevronsUpDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Switch } from './ui/switch'
import { useSettings } from '@/lib/settings-context'

interface FixedTabProps {
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

export function FixedTab({ 
  emulator, 
  host, 
  // setHost, 
  // port, 
  // setPort,
  alePort,
  setAlePort,
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
  setDelay 
}: FixedTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [looping, setLooping] = useState(false)
  const loopingRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const [rssiRandomize, setRssiRandomize] = useState(false)
  const [rssiRandMin, setRssiRandMin] = useState('')
  const [rssiRandMax, setRssiRandMax] = useState('')

  // API State
  const [logicalDevices, setLogicalDevices] = useState<LogicalDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [apiClient] = useState(() => new AleApiClient())

  const { settings } = useSettings()
  const maxLogLinesRef = useRef(settings.maxLogLines)
  maxLogLinesRef.current = settings.maxLogLines

  const addLog = (message: string) => {
    setLog(prev => {
      const next = [...prev, `[${formatTime()}] ${message}`]
      const max = maxLogLinesRef.current
      if (max > 0 && next.length > max) {
        return next.slice(-max)
      }
      return next
    })
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const handleCopyLog = () => {
    if (log.length === 0) return
    navigator.clipboard.writeText(log.join('\n'))
    toast.success('Log copied to clipboard')
  }

  const handleExportLog = () => {
    if (log.length === 0) return
    const blob = new Blob([log.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `emulator-log-${formatTime().replace(/[:/]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Log exported')
  }

  // Sync connection state when component mounts (e.g., after switching tabs)
  useEffect(() => {
    const syncConnectionState = async () => {
      const isConnected = await emulator.isConnected()
      if (isConnected !== connected) {
        setConnected(isConnected)
      }
    }
    syncConnectionState()
  }, [])

  const fetchLogicalDevices = async () => {
    if (!host) {
        addLog('Error: Host is required to fetch logical devices')
        return
    }
    
    setIsLoadingDevices(true)
    addLog(`Fetching logical devices from ${host}:${alePort}...`)
    
    try {
        const devices = await apiClient.getLogicalDevices(host, alePort)
        setLogicalDevices(devices)
        addLog(`Successfully fetched ${devices.length} logical devices`)
        
        // Auto-select first device if none selected
        if (devices.length > 0 && !uid) {
            setUid(devices[0].uid)
        }
    } catch (error: any) {
        addLog(`Error fetching devices: ${error.message}`)
    } finally {
        setIsLoadingDevices(false)
    }
  }

  // Auto-fetch devices when connected
  useEffect(() => {
    if (connected && host) {
      fetchLogicalDevices()
    }
  }, [connected])

  const selectedUids = uid ? uid.split(',').filter(Boolean) : []
  const selectedAntennaCount = antenna.split(',').filter(Boolean).length || 1
  const totalInputRows =
    upcList.split('\n').filter((line) => line.trim()).length +
    epcList.split('\n').filter((line) => line.trim()).length

  const toggleDevice = (deviceUid: string) => {
    const current = new Set(selectedUids)
    if (current.has(deviceUid)) {
        current.delete(deviceUid)
    } else {
        current.add(deviceUid)
    }
    setUid(Array.from(current).join(','))
  }

  const selectAll = () => {
    setUid(logicalDevices.map(d => d.uid).join(','))
  }

  const deselectAll = () => {
    setUid('')
  }

  const handleSendTags = async (isLooping = false) => {
    const isConnected = await emulator.isConnected()
    if (!isConnected) {
      addLog('Error: Not connected to server')
      if (isLooping) {
        setLooping(false)
        loopingRef.current = false
      }
      return
    }

    const tags: TagData[] = []
    const selectedAntennas = antenna.split(',').filter(Boolean).map(Number)
    if (selectedAntennas.length === 0) selectedAntennas.push(1)

    const baseRssiNumber = (() => {
      const n = parseFloat(rssi)
      return Number.isFinite(n) ? n : -45
    })()
    const defaultRandomMin = -90
    const defaultRandomMax = -20

    const parseMaybeNumber = (s: string) => {
      if (!s.trim()) return null
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }

    let effectiveMin = baseRssiNumber
    let effectiveMax = baseRssiNumber
    if (rssiRandomize) {
      const minN = parseMaybeNumber(rssiRandMin)
      const maxN = parseMaybeNumber(rssiRandMax)
      effectiveMin = minN ?? defaultRandomMin
      effectiveMax = maxN ?? defaultRandomMax
      if (effectiveMin > effectiveMax) {
        ;[effectiveMin, effectiveMax] = [effectiveMax, effectiveMin]
      }
    }

    const getTagRssi = () => {
      if (!rssiRandomize) return rssi
      const val = effectiveMin === effectiveMax
        ? effectiveMin
        : effectiveMin + Math.random() * (effectiveMax - effectiveMin)
      return val.toFixed(1)
    }

    // Parse EPC or EPC,TID (one EPC per line, TID optional)
    if (epcList.trim()) {
      const lines = epcList.trim().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const parts = trimmed.split(',')
        const epc = parts[0]?.trim()
        const customTid = parts[1]?.trim()
        if (epc) {
          const targetUids = selectedUids.length > 0 ? selectedUids : ['']
          for (const targetUid of targetUids) {
            for (const ant of selectedAntennas) {
              tags.push({
                epc,
                tid: customTid || epc,
                uid: targetUid,
                antenna: ant,
                rssi: getTagRssi(),
              })
            }
          }
        }
      }
    }

    // Parse UPC,Count,TID and generate EPCs
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
          
          const targetUids = selectedUids.length > 0 ? selectedUids : ['']

          for (const targetUid of targetUids) {
              for (const epc of epcs) {
                for (const ant of selectedAntennas) {
                  tags.push({
                    epc,
                    tid: customTid?.trim() || epc,
                    uid: targetUid,
                    antenna: ant,
                    rssi: getTagRssi(),
                  })
                }
              }
          }
          serial += count
        }
      }
    }

    if (tags.length === 0) {
      addLog('Error: No valid EPCs found')
      if (isLooping) {
        setLooping(false)
        loopingRef.current = false
      }
      return
    }
    
    if (selectedUids.length === 0) {
        addLog('Warning: No logical devices selected. Sending without UID.')
    } else {
        addLog(`Sending to ${selectedUids.length} device(s)`)
    }

    const tagCount = tags.length
    addLog(`Sending ${tagCount} tag(s) with driver: ${driver} on antenna(s): ${selectedAntennas.join(', ')}`)
    if (!isLooping) {
      setSending(true)
    }

    await emulator.sendTags(
      tags,
      driver,
      parseInt(delay),
      (progress) => addLog(progress),
      (complete) => {
        addLog(complete)
        if (isLooping && loopingRef.current) {
          handleSendTags(true)
        } else {
          setSending(false)
          if (!isLooping) toast.success(`${tagCount} tag(s) sent successfully`)
          if (isLooping) {
            setLooping(false)
            loopingRef.current = false
          }
        }
      }
    )
  }

  const handleToggleLoop = () => {
    if (looping) {
      handleStop()
    } else {
      setLooping(true)
      loopingRef.current = true
      addLog('Loop send started - will continuously send tags')
      handleSendTags(true)
    }
  }

  const handleStop = () => {
    emulator.cancelSend()
    loopingRef.current = false
    setLooping(false)
    addLog('Stop requested.')
    setSending(false)
  }

  return (
    <div className="grid grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-6 h-full overflow-hidden">
      {/* Left Sidebar - Configuration */}
      <div className="space-y-4 overflow-y-auto pr-2">
        
        {/* Tag Defaults */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Tag Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Antennas</Label>
                <span className="text-[11px] text-muted-foreground">
                  {selectedAntennaCount} selected
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((ant) => {
                  const selected = antenna.split(',').filter(Boolean).includes(String(ant))
                  return (
                    <button
                      key={ant}
                      type="button"
                      onClick={() => {
                        const current = new Set(antenna.split(',').filter(Boolean))
                        if (current.has(String(ant))) {
                          current.delete(String(ant))
                        } else {
                          current.add(String(ant))
                        }
                        const sorted = Array.from(current).sort((a, b) => Number(a) - Number(b))
                        setAntenna(sorted.join(',') || '1')
                      }}
                      className={`
                        relative flex-1 h-14 rounded-lg border-2 transition-all duration-200
                        flex flex-col items-center justify-center gap-0.5
                        ${selected
                          ? 'border-green-500 bg-green-500/15 text-green-600 dark:text-green-400 ring-1 ring-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.16)]'
                          : 'border-border bg-muted/40 text-muted-foreground hover:border-green-300 hover:bg-green-500/5 dark:hover:border-green-700 dark:hover:bg-green-500/10'}
                      `}
                    >
                      <Radio className={`w-4 h-4 ${selected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/60'}`} />
                      <span className="text-xs font-semibold">{ant}</span>
                      {selected && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="rssi">RSSI</Label>
                <span className="text-xs text-muted-foreground">{rssi} dBm</span>
              </div>
              <Slider
                value={[parseFloat(rssi) || -45]}
                onValueChange={([val]) => setRssi(val.toFixed(1))}
                min={-80}
                max={0}
                step={0.5}
                className="py-1"
              />
              <Input
                id="rssi"
                value={rssi}
                onChange={(e) => setRssi(e.target.value)}
                className="h-8 text-xs font-mono"
              />

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Randomize RSSI per tag</Label>
                  <Switch checked={rssiRandomize} onCheckedChange={setRssiRandomize} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rssi-min" className="text-xs text-muted-foreground">Min</Label>
                    <Input
                      id="rssi-min"
                      type="number"
                      step="0.5"
                      value={rssiRandMin}
                      onChange={(e) => setRssiRandMin(e.target.value)}
                      placeholder="-90"
                      disabled={!rssiRandomize}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rssi-max" className="text-xs text-muted-foreground">Max</Label>
                    <Input
                      id="rssi-max"
                      type="number"
                      step="0.5"
                      value={rssiRandMax}
                      onChange={(e) => setRssiRandMax(e.target.value)}
                      placeholder="-20"
                      disabled={!rssiRandomize}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave Min/Max empty to use defaults (-90 to -20 dBm).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Driver Settings */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Driver Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logical Device Selection */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="logical-device">Logical Device</Label>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Label htmlFor="ale-port" className="text-xs text-muted-foreground whitespace-nowrap">ALE port:</Label>
                        <Input
                            id="ale-port"
                            type="text"
                            value={alePort}
                            onChange={(e) => setAlePort(e.target.value)}
                            placeholder="80"
                            className="h-7 w-16 text-xs font-mono"
                            title="Port for ALE API. Some Edge servers use 80, 8080, or 8081."
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="flex-1 justify-between">
                                <span className="truncate">
                                    {selectedUids.length === 0 
                                        ? "Select Device(s)" 
                                        : selectedUids.length === 1
                                            ? logicalDevices.find(d => d.uid === selectedUids[0])?.name || selectedUids[0]
                                            : `${selectedUids.length} Devices Selected`}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[85vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Select Logical Devices</DialogTitle>
                                <DialogDescription>
                                    Select the devices to send tags to.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex gap-2 mb-2 shrink-0">
                                <Button size="sm" variant="secondary" onClick={selectAll} className="flex-1">Select All</Button>
                                <Button size="sm" variant="ghost" onClick={deselectAll} className="flex-1">Deselect All</Button>
                            </div>
                            <ScrollArea className="h-[60vh] min-h-[240px] pr-4">
                                <div className="space-y-2">
                                    {logicalDevices.length === 0 ? (
                                        <div className="text-center py-4 text-muted-foreground">
                                            No devices found. Click refresh to fetch.
                                        </div>
                                    ) : (
                                        logicalDevices.map((device) => (
                                            <div
                                                key={device.uid}
                                                className="flex items-center space-x-2 p-2 rounded hover:bg-accent cursor-pointer"
                                                onClick={() => toggleDevice(device.uid)}
                                            >
                                                <div className={`
                                                    w-4 h-4 border rounded flex items-center justify-center
                                                    ${selectedUids.includes(device.uid) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}
                                                `}>
                                                    {selectedUids.includes(device.uid) && <Check className="h-3 w-3" />}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">{device.name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{device.uid}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                    <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={fetchLogicalDevices}
                        disabled={isLoadingDevices || !host}
                        title="Fetch Logical Devices"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver">Driver</Label>
              <Select value={driver} onValueChange={setDriver}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_DRIVERS.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delay">Delay (ms)</Label>
              <Input
                id="delay"
                type="number"
                min="0"
                step="50"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side - Tag Management & Log */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Tag Input */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">UPC → EPC Generation</CardTitle>
              <CardDescription>Format: UPC,Count,TID (optional TID)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DropTextarea
                value={upcList}
                onChange={(e) => setUpcList(e.target.value)}
                onFileImport={(content) => setUpcList(upcList ? upcList + '\n' + content : content)}
                placeholder="00000000000001,5&#10;00000000000002,3,CustomTID"
                className="font-mono text-sm min-h-[120px]"
              />
              <div className="space-y-2">
                <Label htmlFor="startSerial">Starting Serial</Label>
                <Input
                  id="startSerial"
                  type="number"
                  min="1"
                  max="999999999"
                  value={startSerial}
                  onChange={(e) => setStartSerial(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Direct EPC Input</CardTitle>
              <CardDescription>Format: EPC or EPC,TID (one per line, TID optional)</CardDescription>
            </CardHeader>
            <CardContent>
              <DropTextarea
                value={epcList}
                onChange={(e) => setEpcList(e.target.value)}
                onFileImport={(content) => setEpcList(epcList ? epcList + '\n' + content : content)}
                placeholder="3034...&#10;3035...,CustomTID"
                className="font-mono text-sm min-h-[120px]"
              />
            </CardContent>
          </Card>
        </div>

        {/* Send Controls */}
        <Card className="border-border/50 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Send Controls</p>
                <p className="text-xs text-muted-foreground">
                  {totalInputRows} populated input row{totalInputRows === 1 ? '' : 's'} ready for processing
                </p>
              </div>
              <div className="flex gap-3 justify-center">
          <Button
            onClick={() => handleSendTags(false)}
            disabled={!connected || sending || looping}
            size="lg"
            className="min-w-[140px]"
          >
            <Zap className="w-4 h-4 mr-2" />
            Send Tags
          </Button>
          <Button
            onClick={sending || looping ? handleStop : handleToggleLoop}
            disabled={!connected || (!sending && !looping && totalInputRows === 0)}
            variant={sending || looping ? "destructive" : "default"}
            size="lg"
            className="min-w-[140px]"
          >
            {sending || looping ? (
              <>
                <StopCircle className="w-4 h-4 mr-2 animate-spin" />
                Stop
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Loop Send
              </>
            )}
          </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Area */}
        <Card className="flex-1 min-h-[200px] border-border/50 bg-card flex flex-col overflow-hidden">
          <CardHeader className="py-2 border-b border-border/50 shrink-0">
            <div className="flex justify-between items-center gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>Emulator Log</span>
                {(sending || looping) && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-0.5">
                {log.length > 0 && (
                  <>
                    <Button
                      onClick={handleCopyLog}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title="Copy log"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={handleExportLog}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      title="Export to file"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => setLog([])}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  title="Clear Log"
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 bg-muted/20">
            {log.length === 0 ? (
              <div className="h-full min-h-[180px] flex items-center justify-center text-center px-6">
                <div className="space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium">No activity yet</p>
                  <p className="text-xs text-muted-foreground">
                    Send a tag batch to see live emulator events and progress here.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="font-mono text-sm space-y-1 p-2">
                  {log.map((line, i) => (
                    <div
                      key={i}
                      className={`text-muted-foreground hover:text-foreground transition-colors duration-150 py-1 px-2 rounded hover:bg-accent/30 ${i === log.length - 1 ? 'animate-log-new' : ''}`}
                    >
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
