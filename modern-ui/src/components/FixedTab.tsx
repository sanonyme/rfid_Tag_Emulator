import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Zap, StopCircle, Activity, RefreshCw } from 'lucide-react'
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

interface FixedTabProps {
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  port: string
  setPort: (port: string) => void
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

  // API State
  const [logicalDevices, setLogicalDevices] = useState<LogicalDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [apiClient] = useState(() => new AleApiClient())

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${formatTime()}] ${message}`])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

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
    addLog(`Fetching logical devices from ${host}:8080...`)
    
    try {
        const devices = await apiClient.getLogicalDevices(host, '8080')
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

  const selectedUids = uid ? uid.split(',').filter(Boolean) : []

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

  // Auto-fetch devices when connected
  useEffect(() => {
    if (connected && host) {
      fetchLogicalDevices()
    }
  }, [connected])

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
            tags.push({
              epc,
              tid: customTid || epc,
              uid: targetUid,
              antenna: parseInt(antenna),
              rssi,
            })
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
                tags.push({
                  epc,
                  tid: customTid?.trim() || epc,
                  uid: targetUid, // Use specific device UID
                  antenna: parseInt(antenna),
                  rssi,
                })
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

    addLog(`Sending ${tags.length} tag(s) with driver: ${driver}`)
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
          // Continue looping
          handleSendTags(true)
        } else {
          setSending(false)
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
    <div className="grid grid-cols-[320px_1fr] gap-6 h-full">
      {/* Left Sidebar - Configuration */}
      <div className="space-y-4 overflow-y-auto pr-2">
        
        {/* Tag Defaults */}
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Tag Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="antenna">Antenna</Label>
                <Input
                  id="antenna"
                  type="number"
                  min="1"
                  max="4"
                  value={antenna}
                  onChange={(e) => setAntenna(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rssi">RSSI</Label>
                <Input
                  id="rssi"
                  value={rssi}
                  onChange={(e) => setRssi(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Driver Settings */}
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500 animate-pulse-slow" />
              Driver Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logical Device Selection */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="logical-device">Logical Device</Label>
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
              <select
                id="driver"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {VENDOR_DRIVERS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
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
          <Card className="border-border/50 bg-card transition-all duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">UPC → EPC Generation</CardTitle>
              <CardDescription>Format: UPC,Count,TID (optional TID)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={upcList}
                onChange={(e) => setUpcList(e.target.value)}
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

          <Card className="border-border/50 bg-card transition-all duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Direct EPC Input</CardTitle>
              <CardDescription>Format: EPC or EPC,TID (one per line, TID optional)</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={epcList}
                onChange={(e) => setEpcList(e.target.value)}
                placeholder="3034...&#10;3035...,CustomTID"
                className="font-mono text-sm min-h-[120px]"
              />
            </CardContent>
          </Card>
        </div>

        {/* Send Controls */}
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
            onClick={handleToggleLoop}
            disabled={!connected || sending}
            variant={looping ? "destructive" : "default"}
            size="lg"
            className="min-w-[120px]"
          >
            {looping ? (
              <>
                <StopCircle className="w-4 h-4 mr-2 animate-spin" />
                Stop Loop
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Loop Send
              </>
            )}
          </Button>
          <Button
            onClick={handleStop}
            disabled={!sending && !looping}
            variant="outline"
            size="lg"
            className="min-w-[140px]"
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>

        {/* Log Area */}
        <Card className="flex-1 min-h-0 border-border/50 bg-card transition-all duration-300">
          <CardHeader className="py-2 border-b border-border/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>Emulator Log</span>
                {(sending || looping) && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
              </CardTitle>
              <Button
                onClick={() => setLog([])}
                variant="ghost"
                size="sm"
                title="Clear Log"
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-5rem)] bg-muted/20">
            <ScrollArea className="h-full">
              <div className="font-mono text-sm space-y-1 p-2">
                {log.map((line, i) => (
                  <div 
                    key={i} 
                    className="text-muted-foreground hover:text-foreground transition-colors duration-150 py-0.5 px-2 rounded hover:bg-accent/30 animate-fade-in"
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
    </div>
  )
}
