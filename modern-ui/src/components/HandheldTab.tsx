import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Smartphone, Zap, StopCircle, Server } from 'lucide-react'
import { HandheldServerClient, EPCGenerator } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'

import { TagImporter } from './TagImporter'

interface HandheldTabProps {
  handheldServer: HandheldServerClient
  deviceId: string
  setDeviceId: (deviceId: string) => void
  upcList: string
  setUpcList: (upcList: string) => void
  epcList: string
  setEpcList: (epcList: string) => void
  delay: string
  setDelay: (_delay: string) => void  // Prefixed with _ to indicate intentionally unused
}

export function HandheldTab({ 
  handheldServer, 
  deviceId,
  setDeviceId,
  upcList,
  setUpcList,
  epcList,
  setEpcList,
  delay, 
  setDelay: _setDelay 
}: HandheldTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const handleImportUpc = (content: string) => {
    setUpcList(content)
  }

  const handleExportUpc = () => {
    return upcList
  }

  const handleImportEpc = (content: string) => {
    setEpcList(content)
  }

  const handleExportEpc = () => {
    return epcList
  }

  const addLog = (message: string) => {
// ... existing code ...
    setLog(prev => [...prev, `[${formatTime()}] ${message}`])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const handleSubscribe = async () => {
    // Java EmulatorUI.java subscribeDevice() - lines 610-620
    // String deviceId = hhDeviceIdField.getText().trim();
    // if (!handheldServer.isRunning()) {
    //     handheldServer.start(this::hhLog, this::hhLog);
    // }
    // if (deviceId.isEmpty()) {
    //     hhLog("Subscribed");
    // } else {
    //     hhLog("Subscribed to device: " + deviceId);
    // }
    
    const running = await handheldServer.isRunning()
    if (!running) {
      handheldServer.start(addLog, addLog)
    }
    
    if (deviceId.trim()) {
      addLog(`Subscribed to device: ${deviceId}`)
    } else {
      addLog('Subscribed')
    }
    setSubscribed(true)
  }

  const handleGenerateAndSend = async () => {
    const allEpcs: string[] = []

    // Parse UPC,Count
    if (upcList.trim()) {
      const lines = upcList.trim().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [upc, countStr] = trimmed.split(',')
        const count = parseInt(countStr?.trim() || '0')
        if (count > 0 && upc) {
          const epcs = EPCGenerator.generateFromUpc(upc.trim(), count)
          allEpcs.push(...epcs)
        }
      }
    }

    // Parse EPC,Count
    if (epcList.trim()) {
      const lines = epcList.trim().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [epc, countStr] = trimmed.split(',')
        const count = parseInt(countStr?.trim() || '0')
        if (count > 0 && epc) {
          for (let i = 0; i < count; i++) {
            allEpcs.push(epc.trim())
          }
        }
      }
    }

    if (allEpcs.length === 0) {
      addLog('Error: No EPCs generated')
      return
    }

    // Check if server is running
    const running = await handheldServer.isRunning()
    console.log('HandheldTab: Before sendEpcs, isRunning =', running)
    if (!running) {
      addLog('Error: Handheld server is not running. Click Subscribe first.')
      return
    }

    addLog(`Sending ${allEpcs.length} EPC(s) to handheld...`)
    setSending(true)

    await handheldServer.sendEpcs(
      allEpcs,
      parseInt(delay),
      (progress) => addLog(progress),
      (complete) => {
        addLog(complete)
        setSending(false)
      }
    )
  }

  const handleStop = () => {
    handheldServer.cancelSend()
    addLog('Stop requested.')
    setSending(false)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        {/* Server Info */}
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-500 animate-pulse-slow" />
              Handheld Server
            </CardTitle>
            <CardDescription className="text-xs">
              Connect VSBL Debug to this PC:10472
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="deviceId" className="text-xs">Device ID (optional)</Label>
              <Input
                id="deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="Enter device ID"
                className="h-8"
              />
            </div>
            <Button
              onClick={handleSubscribe}
              className="w-full h-8"
              size="sm"
            >
              <Smartphone className="w-3 h-3 mr-1.5" />
              Subscribe
            </Button>
            {subscribed && (
              <Badge className="w-full justify-center text-xs py-0.5 bg-green-500/20 border-green-500/30 text-green-700 dark:text-green-400">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Server Running on Port 10472
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Send Controls</CardTitle>
            <CardDescription className="text-xs">
              Generate EPCs and send to handheld device
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <Button
              onClick={handleGenerateAndSend}
              disabled={sending}
              className="w-full h-9"
            >
              <Zap className={`w-3 h-3 mr-1.5 ${sending ? 'animate-spin' : ''}`} />
              Generate EPCs → HH
            </Button>
            <Button
              onClick={handleStop}
              disabled={!sending}
              variant="outline"
              size="lg"
              className="w-full"
            >
              <StopCircle className="w-3 h-3 mr-1.5" />
              Stop Emulating
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tag Input */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">UPC → EPC Generation</CardTitle>
              <TagImporter onImport={handleImportUpc} onExport={handleExportUpc} type="upc" />
            </div>
            <CardDescription className="text-xs">Format: UPC,Count (one per line)</CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <Textarea
              value={upcList}
              onChange={(e) => setUpcList(e.target.value)}
              placeholder="00000000000001,5&#10;00000000000002,3"
              className="font-mono text-xs min-h-[80px]"
            />
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card transition-all duration-300">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Direct EPC Input</CardTitle>
              <TagImporter onImport={handleImportEpc} onExport={handleExportEpc} type="epc" />
            </div>
            <CardDescription className="text-xs">Format: EPC,Count (one per line)</CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <Textarea
              value={epcList}
              onChange={(e) => setEpcList(e.target.value)}
              placeholder="303401234567890000000001,2"
              className="font-mono text-xs min-h-[80px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Log Area */}
      <Card className="flex-1 min-h-0 border-border/50 bg-card transition-all duration-300">
        <CardHeader className="pb-2 pt-3 border-b border-border/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm flex items-center gap-2">
              Handheld Log
              {sending && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </CardTitle>
            <Button
              onClick={() => setLog([])}
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-4rem)] pb-3 bg-muted/20">
          <ScrollArea className="h-full">
            <div className="font-mono text-xs space-y-0.5 p-2">
              {log.map((line, i) => (
                <div key={i} className="text-muted-foreground hover:text-foreground transition-colors duration-150 py-0.5 px-2 rounded hover:bg-accent/30 animate-fade-in">
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

