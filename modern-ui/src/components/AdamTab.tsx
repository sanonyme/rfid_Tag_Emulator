import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Wifi, WifiOff, Power, Activity, ArrowLeftRight } from 'lucide-react'
import { formatTime } from '@/lib/utils'

interface AdamTabProps {
  host: string
  setHost: (host: string) => void
}

export function AdamTab({ host, setHost }: AdamTabProps) {
  const [port, setPort] = useState('502')
  const [isConnected, setIsConnected] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [diValues, setDiValues] = useState<boolean[]>(Array(8).fill(false))
  const [diInvert, setDiInvert] = useState<boolean[]>(Array(8).fill(false))
  const [doValues, setDoValues] = useState<boolean[]>(Array(8).fill(false))
  const [diInvertRegister, setDiInvertRegister] = useState('100')
  const logEndRef = useRef<HTMLDivElement>(null)
  
  // Polling interval for reading DIs
  const pollInterval = useRef<NodeJS.Timeout | null>(null)

  const addLog = (msg: string) => {
    setLog(prev => [...prev, `[${formatTime()}] ${msg}`])
  }

  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (log.length > 0) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [log])

  useEffect(() => {
    if (!window.electronAPI) return

    // Set up listeners
    window.electronAPI.onAdamConnected((msg) => {
      setIsConnected(true)
      addLog(msg)
      // Start polling DIs
      startPolling()
    })

    window.electronAPI.onAdamDisconnected((msg) => {
      setIsConnected(false)
      addLog(msg)
      stopPolling()
    })

    window.electronAPI.onAdamError((msg) => {
      addLog(`Error: ${msg}`)
      if (msg.includes('closed') || msg.includes('timeout')) {
        setIsConnected(false)
        stopPolling()
      }
    })

    window.electronAPI.onAdamDataDI((data) => {
      setDiValues(prev => {
        const newValues = [...prev]
        data.values.forEach((val, idx) => {
          if (data.start + idx < newValues.length) {
            newValues[data.start + idx] = val
          }
        })
        return newValues
      })
    })

    window.electronAPI.onAdamWriteSuccess((msg) => {
      addLog(msg)
    })

    return () => {
      stopPolling()
      // Cleanup listeners if possible, but electronAPI doesn't expose removeListener easily
      // In a real app we'd want to cleanup
    }
  }, [])

  const startPolling = () => {
    if (pollInterval.current) clearInterval(pollInterval.current)
    pollInterval.current = setInterval(() => {
      if (window.electronAPI) {
        window.electronAPI.adamReadDIs(0, 8)
      }
    }, 1000)
  }

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current)
      pollInterval.current = null
    }
  }

  const handleConnect = () => {
    if (!host) {
      addLog('Error: Host not set')
      return
    }
    const portNum = parseInt(port)
    if (isNaN(portNum)) {
      addLog('Error: Invalid port')
      return
    }

    if (isConnected) {
      window.electronAPI?.adamDisconnect()
    } else {
      addLog(`Connecting to ${host}:${portNum}...`)
      window.electronAPI?.adamConnect(host, portNum)
    }
  }

  const toggleDO = (index: number) => {
    if (!isConnected) return
    const newValue = !doValues[index]
    const newDoValues = [...doValues]
    newDoValues[index] = newValue
    setDoValues(newDoValues)
    
    window.electronAPI?.adamSetDO(index, newValue)
  }

  const handleDIInvertToggle = (index: number) => {
    const nextInvert = [...diInvert]
    nextInvert[index] = !nextInvert[index]
    setDiInvert(nextInvert)
    if (isConnected && window.electronAPI) {
      const mask = nextInvert.reduce((acc, v, i) => acc | (v ? 1 << i : 0), 0)
      const reg = parseInt(diInvertRegister, 10) || 100
      window.electronAPI.adamSetDIInvert(mask, reg)
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection Card */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              ADAM Connection
            </CardTitle>
            <CardDescription>Connect to ADAM-6000 series module</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div className="space-y-2 flex-1">
                <Label>Host IP</Label>
                <Input 
                  value={host} 
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="Host IP"
                  disabled={isConnected}
                />
              </div>
              <div className="space-y-2 w-24">
                <Label>Port</Label>
                <Input 
                  value={port} 
                  onChange={(e) => setPort(e.target.value)} 
                  disabled={isConnected}
                />
              </div>
              <Button 
                onClick={handleConnect}
                variant={isConnected ? "destructive" : "default"}
                className="w-32"
              >
                {isConnected ? (
                  <><WifiOff className="w-4 h-4 mr-2" /> Disconnect</>
                ) : (
                  <><Wifi className="w-4 h-4 mr-2" /> Connect</>
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-muted-foreground">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* DI Status Card */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-500" />
                  Digital Inputs (DI)
                </CardTitle>
                <CardDescription>
                  Real-time status. Invert writes to device so Advantech matches.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Invert reg:</Label>
                <Input
                  type="number"
                  value={diInvertRegister}
                  onChange={(e) => setDiInvertRegister(e.target.value)}
                  className="w-16 h-7 text-xs"
                  placeholder="100"
                  title="Modbus holding register for DI invert. If you get 'Illegal Address', try 0, 16, 50, 64, or 200. Or configure via ADAM web UI."
                />
                <span className="text-[10px] text-muted-foreground" title="Try different values if you get an error">
                  Try: 0,16,50,64,200
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {diValues.map((val, i) => {
                const displayedVal = diInvert[i] ? !val : val
                return (
                  <div key={`di-${i}`} className="flex flex-col items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/30">
                    <span className="text-xs font-mono text-muted-foreground">DI {i}</span>
                    <div
                      className={`w-8 h-8 rounded-full transition-colors duration-200 ${displayedVal ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-slate-600'}`}
                      role="img"
                      aria-label={displayedVal ? 'ON' : 'OFF'}
                    />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">{displayedVal ? 'ON' : 'OFF'}</span>
                    <Button
                      variant={diInvert[i] ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-7 text-xs gap-1 mt-1"
                      onClick={() => handleDIInvertToggle(i)}
                      disabled={!isConnected}
                      title="Invert DI on device (writes to Modbus config register)"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      {diInvert[i] ? 'Inverted' : 'Invert'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DO Control Card */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="w-5 h-5 text-orange-500" />
            Digital Outputs (DO) Control
          </CardTitle>
          <CardDescription>Click to toggle outputs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
            {doValues.map((val, i) => (
              <Button
                key={i}
                variant={val ? "default" : "outline"}
                className={`h-20 flex flex-col gap-2 transition-all duration-200 ${val ? 'bg-orange-600 hover:bg-orange-700 border-orange-600' : 'hover:border-orange-500/50'}`}
                onClick={() => toggleDO(i)}
                disabled={!isConnected}
              >
                <Power className={`w-6 h-6 ${val ? 'text-white' : 'text-muted-foreground'}`} />
                <div className="flex flex-col items-center">
                  <span className="text-xs font-mono">DO {i}</span>
                  <span className="text-[10px] font-bold">{val ? 'ON' : 'OFF'}</span>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Log Area */}
      <Card className="flex-1 min-h-[200px] flex flex-col border-border/50 bg-card">
        <CardHeader className="py-2 border-b border-border/50 shrink-0">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm">Log</CardTitle>
            <Button onClick={() => setLog([])} variant="ghost" size="sm">Clear</Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 bg-muted/20 p-0 relative min-h-0">
          <ScrollArea className="absolute inset-0 p-4">
            <div className="font-mono text-sm space-y-1">
              {log.map((line, i) => (
                <div key={i} className="text-muted-foreground">{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
