import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Slider } from './ui/slider'
import { ScrollArea } from './ui/scroll-area'
import { Clock, ScanLine, Radio, Smartphone, Terminal, ChevronsUpDown, Check, RefreshCw } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { AutomationStep, ActionType } from '@/lib/automation-types'
import { AleApiClient, type LogicalDevice } from '@/lib/ale-api'
import { Skeleton } from './ui/skeleton'

const VENDOR_DRIVERS = [
  { code: 'llrp', name: 'All' },
  { code: 'arp', name: 'Alien' },
  { code: 'impinjetk', name: 'Impinj R700' },
  { code: 'octane', name: 'Impinj Others' },
  { code: 'seuic', name: 'SEUIC' },
]

interface NodeConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: AutomationStep | null
  onSave: (id: string, updates: Partial<AutomationStep>) => void
  onSaveParams: (id: string, updates: Partial<AutomationStep['params']>) => void
  host: string
  alePort: string
  customPort: string
}

const STEP_TYPE_STYLES: Record<ActionType, { border: string; bg: string; icon: string }> = {
  DELAY: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', icon: 'text-amber-400' },
  OCR: { border: 'border-pink-400/40', bg: 'bg-pink-400/10', icon: 'text-pink-400' },
  FIXED_TAG: { border: 'border-blue-400/40', bg: 'bg-blue-400/10', icon: 'text-blue-400' },
  HANDHELD_TAG: { border: 'border-emerald-400/40', bg: 'bg-emerald-400/10', icon: 'text-emerald-400' },
  CUSTOM_MESSAGE: { border: 'border-violet-400/40', bg: 'bg-violet-400/10', icon: 'text-violet-400' },
}

export function NodeConfigDialog({ open, onOpenChange, step, onSave, onSaveParams, host, alePort, customPort }: NodeConfigDialogProps) {
  const [logicalDevices, setLogicalDevices] = useState<LogicalDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [apiClient] = useState(() => new AleApiClient())

  const fetchLogicalDevices = async () => {
    if (!host) return
    setIsLoadingDevices(true)
    try {
      const devices = await apiClient.getLogicalDevices(host, alePort)
      setLogicalDevices(devices)
      if (devices.length > 0 && step?.type === 'FIXED_TAG' && !step.params.uid) {
        onSaveParams(step.id, { uid: devices[0].uid })
      }
    } catch (err) {
      console.error('Failed to fetch logical devices:', err)
    } finally {
      setIsLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (open && step?.type === 'FIXED_TAG' && host) {
      fetchLogicalDevices()
    }
  }, [open, step?.type, step?.id, host, alePort])

  if (!step) return null

  const style = STEP_TYPE_STYLES[step.type]
  const selectedUids = (step.params.uid || '').split(',').filter(Boolean)

  const toggleDevice = (deviceUid: string) => {
    const current = new Set(selectedUids)
    if (current.has(deviceUid)) current.delete(deviceUid)
    else current.add(deviceUid)
    onSaveParams(step.id, { uid: Array.from(current).join(',') })
  }
  const selectAllDevices = () => {
    onSaveParams(step.id, { uid: logicalDevices.map(d => d.uid).join(',') })
  }
  const deselectAllDevices = () => {
    onSaveParams(step.id, { uid: '' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${style.border} ${style.bg} ${style.icon}`}>
              {step.type === 'DELAY' && <Clock className="h-3 w-3" />}
              {step.type === 'OCR' && <ScanLine className="h-3 w-3" />}
              {step.type === 'FIXED_TAG' && <Radio className="h-3 w-3" />}
              {step.type === 'HANDHELD_TAG' && <Smartphone className="h-3 w-3" />}
              {step.type === 'CUSTOM_MESSAGE' && <Terminal className="h-3 w-3" />}
              {step.type}
            </span>
            {step.name}
          </DialogTitle>
          <DialogDescription>Configure this node's parameters</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Step Name</Label>
            <Input
              value={step.name}
              onChange={(e) => onSave(step.id, { name: e.target.value })}
              className="h-10"
            />
          </div>

          {step.type === 'DELAY' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Duration (ms)</Label>
              <Input
                type="number"
                value={step.params.duration}
                onChange={(e) => onSaveParams(step.id, { duration: parseInt(e.target.value) })}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Wait time before next step</p>
            </div>
          )}

          {step.type === 'OCR' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Message Payload</Label>
              <Textarea
                value={step.params.message}
                onChange={(e) => onSaveParams(step.id, { message: e.target.value })}
                rows={10}
                className="font-mono text-sm min-h-[180px]"
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => onSaveParams(step.id, { message: '{"test":1}' })}
              >
                Insert Example JSON
              </Button>
            </div>
          )}

          {step.type === 'CUSTOM_MESSAGE' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Port</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={step.params.port ?? customPort}
                onChange={(e) => onSaveParams(step.id, { port: e.target.value })}
                placeholder="12345"
                className="font-mono h-10"
              />
              <p className="text-xs text-muted-foreground">TCP port to send the message to</p>
              <Label>Message</Label>
              <Textarea
                value={step.params.message}
                onChange={(e) => onSaveParams(step.id, { message: e.target.value })}
                rows={10}
                className="font-mono text-sm min-h-[180px]"
                placeholder="Enter message to send (JSON, plain text, etc.)"
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => onSaveParams(step.id, { message: '{"test":1}' })}
              >
                Insert Example JSON
              </Button>
            </div>
          )}

          {step.type === 'FIXED_TAG' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>UPC List</Label>
                <p className="text-xs text-muted-foreground">Format: UPC,Count,TID (one per line)</p>
                <Textarea
                  value={step.params.upcList}
                  onChange={(e) => onSaveParams(step.id, { upcList: e.target.value })}
                  rows={5}
                  className="font-mono text-sm"
                  placeholder="1234567890123, 5, CustomTID"
                />
                <div className="space-y-2">
                  <Label className="text-xs">Start Serial</Label>
                  <Input
                    type="number"
                    min={1}
                    value={step.params.startSerial}
                    onChange={(e) => onSaveParams(step.id, { startSerial: parseInt(e.target.value) })}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>Direct EPC List</Label>
                <p className="text-xs text-muted-foreground">Format: EPC or EPC,TID (one per line)</p>
                <Textarea
                  value={step.params.epcList}
                  onChange={(e) => onSaveParams(step.id, { epcList: e.target.value })}
                  rows={5}
                  className="font-mono text-sm"
                  placeholder="3034..."
                />
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>Logical Device</Label>
                <p className="text-xs text-muted-foreground">Select device(s) to send tags to</p>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex-1 justify-between">
                        <span className="truncate">
                          {selectedUids.length === 0
                            ? 'Select Device(s)'
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
                        <DialogDescription>Select the devices to send tags to.</DialogDescription>
                      </DialogHeader>
                      <div className="flex gap-2 mb-2 shrink-0">
                        <Button size="sm" variant="secondary" onClick={selectAllDevices} className="flex-1">Select All</Button>
                        <Button size="sm" variant="ghost" onClick={deselectAllDevices} className="flex-1">Deselect All</Button>
                      </div>
                      <ScrollArea className="h-[60vh] min-h-[240px] pr-4">
                        <div className="space-y-2">
                          {isLoadingDevices ? (
                            <>
                              {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-center gap-3 p-2">
                                  <Skeleton className="h-4 w-4 rounded shrink-0" />
                                  <div className="flex-1 space-y-1">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-3 w-32" />
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : logicalDevices.length === 0 ? (
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
                                <div className={`w-4 h-4 border rounded flex items-center justify-center ${selectedUids.includes(device.uid) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
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
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>Advanced</Label>
                <div className="space-y-2">
                  <Label className="text-xs">Driver</Label>
                  <Select value={step.params.driver || 'llrp'} onValueChange={(v) => onSaveParams(step.id, { driver: v })}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {VENDOR_DRIVERS.map((d) => (
                        <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Custom TID</Label>
                  <Input
                    value={step.params.tid}
                    onChange={(e) => onSaveParams(step.id, { tid: e.target.value })}
                    className="font-mono h-9"
                    placeholder="Default: EPC"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Antennas</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((ant) => {
                      const current = (step.params.antenna || '1').toString().split(',').filter(Boolean)
                      const isSelected = current.includes(String(ant))
                      return (
                        <button
                          key={ant}
                          type="button"
                          onClick={() => {
                            const set = new Set(current)
                            if (set.has(String(ant))) set.delete(String(ant))
                            else set.add(String(ant))
                            const sorted = Array.from(set).sort((a, b) => Number(a) - Number(b))
                            onSaveParams(step.id, { antenna: sorted.join(',') || '1' })
                          }}
                          className={`flex-1 h-12 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 transition-all focus:outline-none select-none ${
                            isSelected ? 'border-green-500 bg-green-500/15' : 'border-border bg-muted/40'
                          }`}
                        >
                          <Radio className={`w-3.5 h-3.5 ${isSelected ? 'text-green-600' : 'text-muted-foreground'}`} />
                          <span className="text-xs font-semibold">{ant}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">RSSI</Label>
                    <span className="text-xs text-muted-foreground">{step.params.rssi || '-45.0'} dBm</span>
                  </div>
                  <Slider
                    value={[parseFloat(step.params.rssi || '-45') || -45]}
                    onValueChange={([val]) => onSaveParams(step.id, { rssi: val.toFixed(1) })}
                    min={-80}
                    max={0}
                    step={0.5}
                  />
                  <Input
                    value={step.params.rssi}
                    onChange={(e) => onSaveParams(step.id, { rssi: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {step.type === 'HANDHELD_TAG' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>UPC List</Label>
                <p className="text-xs text-muted-foreground">Format: UPC,Count (one per line)</p>
                <Textarea
                  value={step.params.upcList}
                  onChange={(e) => onSaveParams(step.id, { upcList: e.target.value })}
                  rows={5}
                  className="font-mono text-sm"
                />
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <Label>Direct EPC List</Label>
                <p className="text-xs text-muted-foreground">Format: EPC or EPC,TID (one per line)</p>
                <Textarea
                  value={step.params.epcList}
                  onChange={(e) => onSaveParams(step.id, { epcList: e.target.value })}
                  rows={5}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
