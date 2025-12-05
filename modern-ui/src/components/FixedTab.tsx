import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Radio, Zap, StopCircle, Activity } from 'lucide-react'
import { TCPEmulatorClient, EPCGenerator, type TagData } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'

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
  setHost, 
  port, 
  setPort,
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

  const handleConnect = async () => {
    // Check if already connected
    const isConnected = await emulator.isConnected()
    if (isConnected) {
      addLog('Already connected')
      setConnected(true) // Ensure state is synced
      return
    }

    if (!host || !port) {
      addLog('Error: Host and port are required')
      return
    }

    addLog(`Connecting to ${host}:${port}...`)
    await emulator.connect(
      host,
      parseInt(port),
      (message) => {
        addLog(message)
        setConnected(true)
      },
      (error) => {
        addLog(error)
        setConnected(false)
      }
    )
  }

  const handleDisconnect = async () => {
    await emulator.disconnect((message) => {
      addLog(message)
      setConnected(false)
    })
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

    // Parse EPC,Count,TID
    if (epcList.trim()) {
      const lines = epcList.trim().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [epc, countStr, customTid] = trimmed.split(',')
        const count = parseInt(countStr?.trim() || '0')
        if (count > 0 && epc) {
          for (let i = 0; i < count; i++) {
            tags.push({
              epc: epc.trim(),
              tid: customTid?.trim() || epc.trim(),
              uid,
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
          for (const epc of epcs) {
            tags.push({
              epc,
              tid: customTid?.trim() || epc,
              uid,
              antenna: parseInt(antenna),
              rssi,
            })
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
        {/* Connection Settings */}
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary animate-pulse-slow" />
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                disabled={connected}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={connected}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleConnect}
                disabled={connected}
                className="flex-1"
              >
                Connect
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={!connected}
                variant="outline"
                className="flex-1"
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

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
            <div className="space-y-2">
              <Label htmlFor="uid">UID</Label>
              <Input
                id="uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
              />
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
                  value={startSerial}
                  onChange={(e) => setStartSerial(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card transition-all duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Direct EPC Input</CardTitle>
              <CardDescription>Format: EPC,Count,TID (optional TID)</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={epcList}
                onChange={(e) => setEpcList(e.target.value)}
                placeholder="3034..., 2&#10;3035..., 1, CustomTID"
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

