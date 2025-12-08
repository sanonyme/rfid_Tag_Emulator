import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { 
  Play, 
  Square, 
  Trash2, 
  Clock, 
  ScanLine, 
  Radio, 
  Smartphone,
  ArrowUp,
  ArrowDown,
  Workflow
} from 'lucide-react'
import { TCPEmulatorClient, HandheldServerClient, OCRClient, type TagData, EPCGenerator } from '@/lib/tcp-client'
import { toast } from 'sonner'
import { formatTime } from '@/lib/utils'

interface AutomationTabProps {
  emulator: TCPEmulatorClient
  handheldServer: HandheldServerClient
  ocrClient: OCRClient
  host: string
}

type ActionType = 'DELAY' | 'OCR' | 'FIXED_TAG' | 'HANDHELD_TAG'

export interface AutomationStep {
  id: string
  type: ActionType
  name: string
  params: {
    // Delay
    duration?: number
    // OCR
    message?: string
    // Fixed Tag
    epc?: string
    upc?: string
    count?: number
    startSerial?: number
    tid?: string
    uid?: string
    antenna?: number
    rssi?: string
    driver?: string
    // Handheld Tag
    epcList?: string
    upcList?: string
    deviceId?: string
  }
}

interface AutomationTabProps {
  emulator: TCPEmulatorClient
  handheldServer: HandheldServerClient
  ocrClient: OCRClient
  host: string
  steps: AutomationStep[]
  setSteps: (steps: AutomationStep[]) => void
}

export function AutomationTab({ emulator, handheldServer, ocrClient, host, steps, setSteps }: AutomationTabProps) {
  // No local state for steps, using props
  // const [steps, setSteps] = useState<AutomationStep[]>([]) 
  
  // Use a local currentStepIndex for display but don't reset it on unmount if we want to show last state?
  // Actually the prompt asked to persist the *section*, meaning the configuration.
  // Execution state (isRunning, currentStepIndex) usually resets, but let's keep it local for now.
  const [isRunning, setIsRunning] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null)
  const [loopCount, setLoopCount] = useState<string>('1') // '0' or 'Inf' for infinite
  const [log, setLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const addLog = (msg: string) => {
    setLog(prev => [...prev, `[${formatTime()}] ${msg}`])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const handleAddStep = (type: ActionType) => {
    const newStep: AutomationStep = {
      id: crypto.randomUUID(),
      type,
      name: type === 'DELAY' ? 'Wait' : 
            type === 'OCR' ? 'Send OCR' : 
            type === 'FIXED_TAG' ? 'Fixed Reader Scan' : 'Handheld Scan',
      params: {
        duration: 1000,
        message: '{"test":1}',
        epc: '', // Default to empty to show placeholder
        upc: '',
        count: 1,
        startSerial: 1,
        tid: '',
        uid: '0000',
        antenna: 1,
        rssi: '-45.0',
        driver: 'llrp',
        epcList: '',
        upcList: '',
        deviceId: ''
      }
    }
    setSteps([...steps, newStep])
    setSelectedStepId(newStep.id)
  }

  const handleUpdateStep = (id: string, updates: Partial<AutomationStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const handleUpdateParams = (id: string, updates: Partial<AutomationStep['params']>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, params: { ...s.params, ...updates } } : s))
  }

  const handleDeleteStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id))
    if (selectedStepId === id) setSelectedStepId(null)
  }

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newSteps = [...steps]
      ;[newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]
      setSteps(newSteps)
    } else if (direction === 'down' && index < steps.length - 1) {
      const newSteps = [...steps]
      ;[newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]
      setSteps(newSteps)
    }
  }

  const executeStep = async (step: AutomationStep, signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted')

    switch (step.type) {
      case 'DELAY':
        addLog(`Waiting ${step.params.duration}ms...`)
        await new Promise(resolve => setTimeout(resolve, step.params.duration))
        break

      case 'OCR':
        addLog(`Sending OCR message...`)
        if (!host) throw new Error('Host not configured')
        await new Promise<void>((resolve, reject) => {
          ocrClient.sendMessage(host, step.params.message || '', 
            (msg) => { addLog(`OCR Success: ${msg}`); resolve() },
            (err) => { addLog(`OCR Error: ${err}`); reject(new Error(err)) }
          )
        })
        break

      case 'FIXED_TAG':
        addLog(`Emulating Fixed Tag...`)
        let fixedTags: TagData[] = []

        // Parse UPC List
        if (step.params.upcList) {
            const lines = step.params.upcList.split('\n')
            let currentSerial = step.params.startSerial || 1
            for (const line of lines) {
                const [upc, countStr, customTid] = line.split(',')
                const count = parseInt(countStr?.trim() || '1')
                if (upc && count > 0) {
                    const epcs = EPCGenerator.generateFromUpc(
                        upc.trim(), 
                        count, 
                        currentSerial
                    )
                    // Increment serial for next batch to maintain uniqueness if desired, 
                    // or just let it reset? FixedTab increments it.
                    currentSerial += count
                    
                    fixedTags.push(...epcs.map(epc => ({
                        epc,
                        tid: customTid?.trim() || step.params.tid || epc,
                        uid: step.params.uid || '0000',
                        antenna: step.params.antenna || 1,
                        rssi: step.params.rssi || '-45.0'
                    })))
                }
            }
        }

        // Parse EPC List (EPC,Count)
        if (step.params.epcList) {
            const lines = step.params.epcList.split('\n')
            for (const line of lines) {
                const [epc, countStr, customTid] = line.split(',')
                const count = parseInt(countStr?.trim() || '1')
                if (epc && count > 0) {
                    for (let i = 0; i < count; i++) {
                        fixedTags.push({
                            epc: epc.trim(),
                            tid: customTid?.trim() || step.params.tid || epc.trim(),
                            uid: step.params.uid || '0000',
                            antenna: step.params.antenna || 1,
                            rssi: step.params.rssi || '-45.0'
                        })
                    }
                }
            }
        }

        // Fallback for legacy single fields (if any exist from previous version)
        if (fixedTags.length === 0 && (step.params.upc || step.params.epc)) {
             if (step.params.upc) {
                const epcs = EPCGenerator.generateFromUpc(
                    step.params.upc, 
                    step.params.count || 1, 
                    step.params.startSerial || 1
                )
                fixedTags = epcs.map(epc => ({
                    epc,
                    tid: step.params.tid || epc,
                    uid: step.params.uid || '0000',
                    antenna: step.params.antenna || 1,
                    rssi: step.params.rssi || '-45.0'
                }))
             } else if (step.params.epc) {
                fixedTags = [{
                    epc: step.params.epc,
                    tid: step.params.tid || step.params.epc,
                    uid: step.params.uid || '0000',
                    antenna: step.params.antenna || 1,
                    rssi: step.params.rssi || '-45.0'
                }]
             }
        }
        
        if (fixedTags.length === 0) throw new Error('No valid EPCs or UPCs specified')

        await emulator.sendTags(fixedTags, step.params.driver || 'llrp', 0, 
          (msg) => addLog(`Fixed: ${msg}`),
          (msg) => addLog(`Fixed Complete: ${msg}`)
        )
        break

      case 'HANDHELD_TAG':
        addLog(`Emulating Handheld Tags...`)
        const allHhTags: {epc: string, tid?: string}[] = []

        // Parse UPC List
        if (step.params.upcList) {
            const lines = step.params.upcList.split('\n')
            for (const line of lines) {
                const [upc, countStr, customTid] = line.split(',')
                const count = parseInt(countStr?.trim() || '1')
                if (upc && count > 0) {
                    const generated = EPCGenerator.generateFromUpc(upc.trim(), count)
                    allHhTags.push(...generated.map(epc => ({
                        epc,
                        tid: customTid?.trim() || step.params.tid || epc // Use line TID, step TID, or EPC
                    })))
                }
            }
        }

        // Add Direct EPCs
        if (step.params.epcList) {
            const lines = step.params.epcList.split('\n')
            for (const line of lines) {
                const [epc, countStr, customTid] = line.split(',')
                const count = parseInt(countStr?.trim() || '1')
                if (epc && count > 0) {
                    for (let i = 0; i < count; i++) {
                        allHhTags.push({
                            epc: epc.trim(),
                            tid: customTid?.trim() || step.params.tid || epc.trim()
                        })
                    }
                }
            }
        }
        
        if (allHhTags.length === 0) throw new Error('No EPCs specified')
        
        const isRunning = await handheldServer.isRunning()
        if (!isRunning) {
            addLog("Starting Handheld server...")
            handheldServer.start((msg) => addLog(msg), (err) => addLog(`HH Error: ${err}`))
            // Give it a moment to start
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        await handheldServer.sendEpcs(allHhTags, 0,
          (msg) => addLog(`HH: ${msg}`),
          (msg) => addLog(`HH Complete: ${msg}`)
        )
        break
    }
  }

  const handleRun = async () => {
    if (steps.length === 0) {
      toast.error('Add steps first')
      return
    }

    setIsRunning(true)
    setLog([])
    addLog('Starting automation...')
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const loops = loopCount === 'Inf' ? Infinity : parseInt(loopCount) || 1
    
    try {
      for (let i = 0; i < loops; i++) {
        if (signal.aborted) break
        if (loops > 1) addLog(`--- Loop ${i + 1}/${loops === Infinity ? '∞' : loops} ---`)
        
        for (let j = 0; j < steps.length; j++) {
            if (signal.aborted) break
            setCurrentStepIndex(j)
            try {
                await executeStep(steps[j], signal)
            } catch (error: any) {
                addLog(`Error at step ${j + 1}: ${error.message}`)
                if (error.message === 'Aborted') break
                // Continue or stop on error? Let's stop on error for safety
                throw error
            }
        }
      }
      addLog('Automation completed successfully')
    } catch (error: any) {
      if (error.message !== 'Aborted') {
        addLog(`Automation failed: ${error.message}`)
        toast.error('Automation failed')
      } else {
        addLog('Automation stopped by user')
      }
    } finally {
      setIsRunning(false)
      setCurrentStepIndex(null)
      abortControllerRef.current = null
    }
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      emulator.cancelSend()
      handheldServer.cancelSend()
    }
  }

  const selectedStep = steps.find(s => s.id === selectedStepId)

  return (
    <div className="h-full flex gap-4">
      {/* Left Sidebar - Steps List */}
      <Card className="w-1/3 flex flex-col bg-card/50 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            Sequence
          </CardTitle>
          <CardDescription>
            {steps.length} steps configured
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-2 min-h-0">
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  onClick={() => !isRunning && setSelectedStepId(step.id)}
                  className={`
                    p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 relative overflow-hidden
                    ${selectedStepId === step.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/50'}
                    ${currentStepIndex === index ? 'ring-2 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)] border-green-500/50' : ''}
                  `}
                >
                  {/* Progress Bar Background for Current Step */}
                  {currentStepIndex === index && (
                    <div className="absolute inset-0 bg-green-500/10 animate-pulse pointer-events-none" />
                  )}

                  <div className={`
                    flex flex-col items-center justify-center w-6 h-6 rounded-full text-xs font-mono transition-colors
                    ${currentStepIndex === index 
                      ? 'bg-green-500 text-white font-bold scale-110' 
                      : 'bg-muted text-muted-foreground'}
                  `}>
                    {currentStepIndex === index ? <Play className="w-3 h-3 fill-current" /> : index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                        {step.type === 'DELAY' && <Clock className="w-3 h-3 text-yellow-500" />}
                        {step.type === 'OCR' && <ScanLine className="w-3 h-3 text-pink-500" />}
                        {step.type === 'FIXED_TAG' && <Radio className="w-3 h-3 text-blue-500" />}
                        {step.type === 'HANDHELD_TAG' && <Smartphone className="w-3 h-3 text-green-500" />}
                        {step.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                        {step.type === 'DELAY' && `${step.params.duration}ms`}
                        {step.type === 'OCR' && `Length: ${(step.params.message || '').length}`}
                        {step.type === 'FIXED_TAG' && (step.params.upcList || step.params.epcList ? `${((step.params.epcList || '').split('\n').filter(Boolean).length) + ((step.params.upcList || '').split('\n').filter(Boolean).length)} lines` : (step.params.upc ? `UPC: ${step.params.upc}` : step.params.epc))}
                        {step.type === 'HANDHELD_TAG' && `${((step.params.epcList || '').split('\n').filter(Boolean).length) + ((step.params.upcList || '').split('\n').filter(Boolean).length)} lines`}
                    </div>
                  </div>

                  {!isRunning && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleMoveStep(index, 'up') }}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleMoveStep(index, 'down') }}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id) }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              
              {steps.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                  No steps added.<br/>Click a button below to start.
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => handleAddStep('DELAY')}>
              <Clock className="w-4 h-4 mr-2" /> Delay
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddStep('OCR')}>
              <ScanLine className="w-4 h-4 mr-2" /> OCR
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddStep('FIXED_TAG')}>
              <Radio className="w-4 h-4 mr-2" /> Fixed
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddStep('HANDHELD_TAG')}>
              <Smartphone className="w-4 h-4 mr-2" /> Handheld
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Middle - Configuration */}
      <Card className="w-1/3 flex flex-col bg-card/50 border-white/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Configuration</CardTitle>
          <CardDescription>Edit selected step parameters</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {selectedStep ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Step Name</Label>
                <Input 
                  value={selectedStep.name} 
                  onChange={(e) => handleUpdateStep(selectedStep.id, { name: e.target.value })} 
                />
              </div>

              {selectedStep.type === 'DELAY' && (
                <div className="space-y-2">
                  <Label>Duration (ms)</Label>
                  <Input 
                    type="number" 
                    value={selectedStep.params.duration}
                    onChange={(e) => handleUpdateParams(selectedStep.id, { duration: parseInt(e.target.value) })}
                  />
                </div>
              )}

              {selectedStep.type === 'OCR' && (
                <div className="space-y-2">
                  <Label>Message Payload</Label>
                  <Textarea 
                    value={selectedStep.params.message}
                    onChange={(e) => handleUpdateParams(selectedStep.id, { message: e.target.value })}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleUpdateParams(selectedStep.id, { message: '{"test":1}' })}
                  >
                    Insert Example JSON
                  </Button>
                </div>
              )}

              {selectedStep.type === 'FIXED_TAG' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>UPC List (Format: UPC,Count,TID)</Label>
                    <Textarea 
                      value={selectedStep.params.upcList}
                      onChange={(e) => handleUpdateParams(selectedStep.id, { upcList: e.target.value })}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="1234567890123, 5, CustomTID&#10;00000000000002, 3"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Start Serial (for UPCs)</Label>
                    <Input 
                        type="number"
                        min="1"
                        value={selectedStep.params.startSerial}
                        onChange={(e) => handleUpdateParams(selectedStep.id, { startSerial: parseInt(e.target.value) })}
                      />
                  </div>

                  <div className="space-y-2">
                    <Label>Direct EPC List (Format: EPC,Count,TID)</Label>
                    <Textarea 
                      value={selectedStep.params.epcList}
                      onChange={(e) => handleUpdateParams(selectedStep.id, { epcList: e.target.value })}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="3034..., 1, CustomTID&#10;3035..., 5"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Custom TID</Label>
                      <Input 
                        value={selectedStep.params.tid}
                        onChange={(e) => handleUpdateParams(selectedStep.id, { tid: e.target.value })}
                        className="font-mono"
                        placeholder="Default: EPC"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>UID</Label>
                      <Input 
                        value={selectedStep.params.uid}
                        onChange={(e) => handleUpdateParams(selectedStep.id, { uid: e.target.value })}
                        className="font-mono"
                        placeholder="Default: 0000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Antenna</Label>
                      <Input 
                        type="number"
                        value={selectedStep.params.antenna}
                        onChange={(e) => handleUpdateParams(selectedStep.id, { antenna: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>RSSI</Label>
                      <Input 
                        value={selectedStep.params.rssi}
                        onChange={(e) => handleUpdateParams(selectedStep.id, { rssi: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStep.type === 'HANDHELD_TAG' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>UPC List (Format: UPC,Count)</Label>
                    <Textarea 
                      value={selectedStep.params.upcList}
                      onChange={(e) => handleUpdateParams(selectedStep.id, { upcList: e.target.value })}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="1234567890123, 5&#10;00000000000002, 3"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Direct EPC List (One per line)</Label>
                    <Textarea 
                      value={selectedStep.params.epcList}
                      onChange={(e) => handleUpdateParams(selectedStep.id, { epcList: e.target.value })}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="3034..."
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a step to configure
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right - Control & Log */}
      <Card className="w-1/3 flex flex-col bg-card/50 border-white/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Execution</CardTitle>
          <CardDescription>Control automation playback</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-secondary/20">
            <div className="flex items-center gap-2">
              <Label className="w-24">Loop Count:</Label>
              <Select value={loopCount} onValueChange={setLoopCount}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Run Once</SelectItem>
                  <SelectItem value="5">Loop 5 times</SelectItem>
                  <SelectItem value="10">Loop 10 times</SelectItem>
                  <SelectItem value="Inf">Loop Indefinitely</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              {!isRunning ? (
                <Button onClick={handleRun} className="flex-1 bg-green-600 hover:bg-green-700">
                  <Play className="w-4 h-4 mr-2" /> Start
                </Button>
              ) : (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Square className="w-4 h-4 mr-2" /> Stop
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 border rounded-md bg-black/20 p-2 font-mono text-xs overflow-auto">
             <ScrollArea className="h-full">
                {log.length === 0 && <div className="text-muted-foreground p-2">Ready...</div>}
                {log.map((l, i) => (
                  <div key={i} className="py-0.5 px-1 hover:bg-white/5 rounded">{l}</div>
                ))}
                <div ref={logEndRef} />
             </ScrollArea>
          </div>
          
          <Button variant="outline" size="sm" onClick={() => setLog([])}>
            Clear Log
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

