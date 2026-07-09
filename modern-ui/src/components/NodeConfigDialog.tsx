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
import { toast } from 'sonner'
import { Clock, ScanLine, Radio, Smartphone, Terminal, ChevronsUpDown, Check, RefreshCw, Box, Workflow, Variable, Database, FileCode2, GitBranch, FileText, Globe, Server, Network } from 'lucide-react'
import { EdgeBlockNodeConfig, EdgeProcessNodeConfig } from './EdgeAutomationNodeConfig'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Switch } from './ui/switch'
import { UpcSerialModeToggle } from './UpcSerialModeToggle'
import { StandardVariablesReference, VariablePresetPicker } from './VariablePresetPicker'
import type { AutomationStep, ActionType, ConditionOp, LogLevel, HttpMethod, AutomationSequence } from '@/lib/automation-types'
import { CONDITION_OPS } from '@/lib/automation-types'
import { AleApiClient, type LogicalDevice } from '@/lib/ale-api'
import { Skeleton } from './ui/skeleton'

import { VENDOR_DRIVERS } from '@/lib/vendor-drivers'

interface NodeConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: AutomationStep | null
  onSave: (id: string, updates: Partial<AutomationStep>) => void
  onSaveParams: (id: string, updates: Partial<AutomationStep['params']>) => void
  host: string
  alePort: string
  customPort: string
  /** Fixed tab inter-tag delay — used when step tagDelay is empty */
  fixedTabDelay?: string
  /** All sequences (for the Call Sequence node's target picker) */
  sequences?: AutomationSequence[]
  /** Id of the sequence the current node belongs to (excluded from Call targets) */
  currentSequenceId?: string | null
}

const STEP_TYPE_STYLES: Record<ActionType, { border: string; bg: string; icon: string }> = {
  DELAY: { border: 'border-amber-400/40', bg: 'bg-amber-400/10', icon: 'text-amber-400' },
  OCR: { border: 'border-pink-400/40', bg: 'bg-pink-400/10', icon: 'text-pink-400' },
  FIXED_TAG: { border: 'border-blue-400/40', bg: 'bg-blue-400/10', icon: 'text-blue-400' },
  HANDHELD_TAG: { border: 'border-emerald-400/40', bg: 'bg-emerald-400/10', icon: 'text-emerald-400' },
  CUSTOM_MESSAGE: { border: 'border-violet-400/40', bg: 'bg-violet-400/10', icon: 'text-violet-400' },
  EDGE_BLOCK: { border: 'border-cyan-400/40', bg: 'bg-cyan-400/10', icon: 'text-cyan-400' },
  EDGE_PROCESS: { border: 'border-teal-400/40', bg: 'bg-teal-400/10', icon: 'text-teal-400' },
  SET_VARIABLE: { border: 'border-orange-400/40', bg: 'bg-orange-400/10', icon: 'text-orange-400' },
  DB_QUERY: { border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', icon: 'text-indigo-400' },
  DB_EXEC: { border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', icon: 'text-indigo-400' },
  RUN_SCRIPT: { border: 'border-lime-400/40', bg: 'bg-lime-400/10', icon: 'text-lime-400' },
  HTTP_REQUEST: { border: 'border-rose-400/40', bg: 'bg-rose-400/10', icon: 'text-rose-400' },
  CALL_SEQUENCE: { border: 'border-purple-400/40', bg: 'bg-purple-400/10', icon: 'text-purple-400' },
  CONDITION: { border: 'border-fuchsia-400/40', bg: 'bg-fuchsia-400/10', icon: 'text-fuchsia-400' },
  LOG: { border: 'border-sky-400/40', bg: 'bg-sky-400/10', icon: 'text-sky-400' },
}

export function NodeConfigDialog({ open, onOpenChange, step, onSave, onSaveParams, host, alePort, customPort, fixedTabDelay, sequences, currentSequenceId }: NodeConfigDialogProps) {
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
              {step.type === 'EDGE_BLOCK' && <Box className="h-3 w-3" />}
              {step.type === 'EDGE_PROCESS' && <Workflow className="h-3 w-3" />}
              {step.type === 'SET_VARIABLE' && <Variable className="h-3 w-3" />}
              {step.type === 'DB_QUERY' && <Database className="h-3 w-3" />}
              {step.type === 'DB_EXEC' && <Server className="h-3 w-3" />}
              {step.type === 'RUN_SCRIPT' && <FileCode2 className="h-3 w-3" />}
              {step.type === 'HTTP_REQUEST' && <Globe className="h-3 w-3" />}
              {step.type === 'CALL_SEQUENCE' && <Network className="h-3 w-3" />}
              {step.type === 'CONDITION' && <GitBranch className="h-3 w-3" />}
              {step.type === 'LOG' && <FileText className="h-3 w-3" />}
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
              <VariablePresetPicker
                value={step.params.message || ''}
                preferred={['host', 'epc', 'epcs', 'tagCount']}
                onInsert={(next) => onSaveParams(step.id, { message: next })}
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
              <VariablePresetPicker
                value={step.params.message || ''}
                preferred={['host', 'epc', 'epcs', 'lastOcrResponse']}
                onInsert={(next) => onSaveParams(step.id, { message: next })}
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
                <UpcSerialModeToggle
                  idPrefix={`automation-${step.id}-serial`}
                  continuesAcrossLines={step.params.serialContinuesAcrossUpcLines === true}
                  onContinuesAcrossLinesChange={(v) =>
                    onSaveParams(step.id, { serialContinuesAcrossUpcLines: v })
                  }
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
                  placeholder="3034... or pick a variable below"
                />
                <VariablePresetPicker
                  value={step.params.epcList || ''}
                  preferred={['epcs', 'epc']}
                  mode="replace"
                  onInsert={(next) => onSaveParams(step.id, { epcList: next })}
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
                  <Label className="text-xs">Inter-tag delay</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      step={50}
                      value={step.params.tagDelay ?? ''}
                      onChange={(e) => onSaveParams(step.id, { tagDelay: e.target.value })}
                      placeholder={fixedTabDelay?.trim() ? `Default: ${fixedTabDelay}` : '20'}
                      className="h-9 pe-12 font-mono text-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                      ms
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to use the Fixed tab inter-tag delay.
                  </p>
                </div>
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

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-xs">Randomize RSSI per tag</Label>
                      <Switch
                        checked={step.params.rssiRandomize ?? false}
                        onCheckedChange={(v) => onSaveParams(step.id, { rssiRandomize: v })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="rssi-rand-min" className="text-xs text-muted-foreground">Min</Label>
                        <Input
                          id="rssi-rand-min"
                          type="number"
                          step="0.5"
                          value={step.params.rssiRandMin ?? ''}
                          onChange={(e) => onSaveParams(step.id, { rssiRandMin: e.target.value })}
                          placeholder="-90"
                          disabled={!(step.params.rssiRandomize ?? false)}
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="rssi-rand-max" className="text-xs text-muted-foreground">Max</Label>
                        <Input
                          id="rssi-rand-max"
                          type="number"
                          step="0.5"
                          value={step.params.rssiRandMax ?? ''}
                          onChange={(e) => onSaveParams(step.id, { rssiRandMax: e.target.value })}
                          placeholder="-20"
                          disabled={!(step.params.rssiRandomize ?? false)}
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Leave Min/Max empty to use defaults (-90 to -20 dBm).
                    </p>
                  </div>
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
                <div className="space-y-2">
                  <Label className="text-xs">Start Serial</Label>
                  <Input
                    type="number"
                    min={1}
                    value={step.params.startSerial ?? 1}
                    onChange={(e) => onSaveParams(step.id, { startSerial: parseInt(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <UpcSerialModeToggle
                  idPrefix={`automation-hh-${step.id}-serial`}
                  continuesAcrossLines={step.params.serialContinuesAcrossUpcLines === true}
                  onContinuesAcrossLinesChange={(v) =>
                    onSaveParams(step.id, { serialContinuesAcrossUpcLines: v })
                  }
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
                  placeholder="3034... or pick a variable below"
                />
                <VariablePresetPicker
                  value={step.params.epcList || ''}
                  preferred={['epcs', 'epc']}
                  mode="replace"
                  onInsert={(next) => onSaveParams(step.id, { epcList: next })}
                />
              </div>
            </div>
          )}

          {step.type === 'EDGE_BLOCK' && (
            <EdgeBlockNodeConfig step={step} onSaveParams={onSaveParams} />
          )}

          {step.type === 'EDGE_PROCESS' && (
            <EdgeProcessNodeConfig step={step} onSaveParams={onSaveParams} />
          )}

          {step.type === 'SET_VARIABLE' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Variable name</Label>
              <Input
                value={step.params.varName || ''}
                onChange={(e) => onSaveParams(step.id, { varName: e.target.value })}
                className="h-10 font-mono"
                placeholder="sku"
              />
              <Label>Value</Label>
              <Textarea
                value={step.params.varValue || ''}
                onChange={(e) => onSaveParams(step.id, { varValue: e.target.value })}
                rows={3}
                className="font-mono text-sm"
                placeholder="literal or pick a variable below"
              />
              <VariablePresetPicker
                value={step.params.varValue || ''}
                preferred={['epcs', 'epc', 'tagCount', 'lastOcrResponse', 'host']}
                onInsert={(next) => onSaveParams(step.id, { varValue: next })}
              />
              <StandardVariablesReference />
            </div>
          )}

          {step.type === 'DB_QUERY' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Database (optional)</Label>
              <Input
                value={step.params.dbDatabase || ''}
                onChange={(e) => onSaveParams(step.id, { dbDatabase: e.target.value })}
                className="h-10 font-mono"
                placeholder="Leave empty for current connection default"
              />
              <Label>SQL</Label>
              <Textarea
                value={step.params.dbSql || ''}
                onChange={(e) => onSaveParams(step.id, { dbSql: e.target.value })}
                rows={6}
                className="font-mono text-sm"
                placeholder={"SELECT * FROM inventory WHERE epc IN ({{epcsSql}})"}
              />
              <VariablePresetPicker
                value={step.params.dbSql || ''}
                preferred={['epcsSql', 'epc', 'tagCount', 'host']}
                onInsert={(next) => onSaveParams(step.id, { dbSql: next })}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    onSaveParams(step.id, {
                      dbSql: "SELECT * FROM inventory WHERE epc IN ({{epcsSql}})",
                      dbSaveAs: 'dbResult',
                      dbSaveColumn: '',
                    })
                  }
                >
                  Preset: EPCs in SQL IN
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    onSaveParams(step.id, {
                      dbSql: "SELECT COUNT(*) AS cnt FROM inventory WHERE epc = '{{epc}}'",
                      dbSaveAs: 'rowCount',
                      dbSaveColumn: 'cnt',
                    })
                  }
                >
                  Preset: count by first EPC
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>Save as</Label>
                  <Input
                    value={step.params.dbSaveAs || ''}
                    onChange={(e) => onSaveParams(step.id, { dbSaveAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="rowCount"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Column</Label>
                  <Input
                    value={step.params.dbSaveColumn || ''}
                    onChange={(e) => onSaveParams(step.id, { dbSaveColumn: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="cnt"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Row #</Label>
                  <Input
                    type="number"
                    min={0}
                    value={step.params.dbSaveRowIndex ?? 0}
                    onChange={(e) => onSaveParams(step.id, { dbSaveRowIndex: parseInt(e.target.value) || 0 })}
                    className="h-9"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Requires an active MySQL connection in the Database tab.</p>
            </div>
          )}

          {step.type === 'RUN_SCRIPT' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={step.params.scriptInline !== false}
                  onCheckedChange={(v) => onSaveParams(step.id, { scriptInline: v })}
                />
                <Label className="text-xs">Inline script (otherwise path under user scripts folder)</Label>
              </div>
              {step.params.scriptInline !== false ? (
                <>
                  <Label>Script</Label>
                  <Textarea
                    value={step.params.scriptInlineText || ''}
                    onChange={(e) => onSaveParams(step.id, { scriptInlineText: e.target.value })}
                    rows={8}
                    className="font-mono text-xs"
                  />
                  <VariablePresetPicker
                    value={step.params.scriptInlineText || ''}
                    preferred={['epcs', 'epc', 'tagCount', 'host']}
                    onInsert={(next) => onSaveParams(step.id, { scriptInlineText: next })}
                  />
                </>
              ) : (
                <>
                  <Label>Script path</Label>
                  <Input
                    value={step.params.scriptPath || ''}
                    onChange={(e) => onSaveParams(step.id, { scriptPath: e.target.value })}
                    className="h-10 font-mono text-xs"
                    placeholder="…/userData/scripts/validate.ps1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const r = await window.electronAPI?.automationOpenScriptsFolder?.()
                      if (!r) {
                        toast.error('Desktop app required')
                        return
                      }
                      if (!r.ok) toast.error(r.error)
                      else toast.success(`Opened ${r.path}`)
                    }}
                  >
                    Open scripts folder
                  </Button>
                </>
              )}
              <Label>Args (space-separated)</Label>
              <Input
                value={step.params.scriptArgs || ''}
                onChange={(e) => onSaveParams(step.id, { scriptArgs: e.target.value })}
                className="h-9 font-mono text-xs"
              />
              <VariablePresetPicker
                value={step.params.scriptArgs || ''}
                preferred={['epc', 'tagCount', 'host']}
                compact
                onInsert={(next) => onSaveParams(step.id, { scriptArgs: next })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={step.params.scriptTimeoutMs ?? 30000}
                    onChange={(e) => onSaveParams(step.id, { scriptTimeoutMs: parseInt(e.target.value) || 30000 })}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Save stdout as</Label>
                  <Input
                    value={step.params.scriptSaveStdoutAs || ''}
                    onChange={(e) => onSaveParams(step.id, { scriptSaveStdoutAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={step.params.scriptFailOnNonZero !== false}
                  onCheckedChange={(v) => onSaveParams(step.id, { scriptFailOnNonZero: v })}
                />
                <Label className="text-xs">Fail on non-zero exit</Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Requires admin login. App variables are also available as PowerShell env vars (see list below).
              </p>
              <StandardVariablesReference showEnv />
            </div>
          )}

          {step.type === 'CONDITION' && (() => {
            const op: ConditionOp = step.params.condOp ?? 'eq'
            const opMeta = CONDITION_OPS.find((o) => o.value === op)
            const needsRight = opMeta?.needsRight !== false
            return (
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Evaluates an expression and routes the flow through its{' '}
                  <span className="font-semibold text-green-500">TRUE</span> or{' '}
                  <span className="font-semibold text-red-500">FALSE</span> output port.
                  Connect each port to the node that should run next.
                </p>
                <div className="space-y-2">
                  <Label>Left value</Label>
                  <Input
                    value={step.params.condLeft || ''}
                    onChange={(e) => onSaveParams(step.id, { condLeft: e.target.value })}
                    className="h-10 font-mono"
                    placeholder="{{tagCount}}"
                  />
                  <VariablePresetPicker
                    value={step.params.condLeft || ''}
                    preferred={['tagCount', 'epc', 'lastOcrResponse', 'dbResult', 'scriptOut']}
                    compact
                    onInsert={(next) => onSaveParams(step.id, { condLeft: next })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operator</Label>
                  <Select value={op} onValueChange={(v) => onSaveParams(step.id, { condOp: v as ConditionOp })}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {needsRight && (
                  <div className="space-y-2">
                    <Label>Right value</Label>
                    <Input
                      value={step.params.condRight || ''}
                      onChange={(e) => onSaveParams(step.id, { condRight: e.target.value })}
                      className="h-10 font-mono"
                      placeholder={op === 'matches' ? '^\\d+$ (regex)' : '0'}
                    />
                    <VariablePresetPicker
                      value={step.params.condRight || ''}
                      preferred={['tagCount', 'epc', 'host']}
                      compact
                      onInsert={(next) => onSaveParams(step.id, { condRight: next })}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label className="text-xs">Case-sensitive text compare</Label>
                  <Switch
                    checked={step.params.condCaseSensitive === true}
                    onCheckedChange={(v) => onSaveParams(step.id, { condCaseSensitive: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Numeric operators (&gt;, ≥, &lt;, ≤) compare as numbers. Equality compares as
                  numbers when both sides are numeric, otherwise as text. Unmatched values are
                  treated as an empty string.
                </p>
              </div>
            )
          })()}

          {step.type === 'LOG' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <Label>Message</Label>
              <Textarea
                value={step.params.logMessage || ''}
                onChange={(e) => onSaveParams(step.id, { logMessage: e.target.value })}
                rows={3}
                className="font-mono text-sm"
                placeholder="Sent {{tagCount}} tags to {{host}}"
              />
              <VariablePresetPicker
                value={step.params.logMessage || ''}
                preferred={['tagCount', 'epc', 'epcs', 'lastOcrResponse', 'host']}
                onInsert={(next) => onSaveParams(step.id, { logMessage: next })}
              />
              <div className="space-y-2">
                <Label>Level</Label>
                <Select
                  value={step.params.logLevel ?? 'info'}
                  onValueChange={(v) => onSaveParams(step.id, { logLevel: v as LogLevel })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {step.params.logLevel === 'error' && (
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">Abort the run when this node executes</Label>
                  <Switch
                    checked={step.params.logAbort === true}
                    onCheckedChange={(v) => onSaveParams(step.id, { logAbort: v })}
                  />
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Writes a line to the activity log. Handy for annotating branches or, at
                <span className="font-medium"> Error</span> level, stopping a run when a
                condition path is reached.
              </p>
            </div>
          )}

          {step.type === 'DB_EXEC' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Runs <span className="font-semibold">any</span> SQL statement — INSERT, UPDATE, DELETE,
                CREATE/ALTER/DROP, CALL, or SELECT. Captures the affected-row count and insert id.
              </p>
              <Label>Database (optional)</Label>
              <Input
                value={step.params.dbDatabase || ''}
                onChange={(e) => onSaveParams(step.id, { dbDatabase: e.target.value })}
                className="h-10 font-mono"
                placeholder="Leave empty for current connection default"
              />
              <Label>SQL statement</Label>
              <Textarea
                value={step.params.dbSql || ''}
                onChange={(e) => onSaveParams(step.id, { dbSql: e.target.value })}
                rows={6}
                className="font-mono text-sm"
                placeholder={"UPDATE inventory SET last_seen = NOW() WHERE epc = '{{epc}}'"}
              />
              <VariablePresetPicker
                value={step.params.dbSql || ''}
                preferred={['epc', 'epcsSql', 'tagCount', 'host']}
                onInsert={(next) => onSaveParams(step.id, { dbSql: next })}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    onSaveParams(step.id, {
                      dbSql: "UPDATE inventory SET last_seen = NOW() WHERE epc = '{{epc}}'",
                    })
                  }
                >
                  Preset: touch by first EPC
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    onSaveParams(step.id, {
                      dbSql: "DELETE FROM inventory WHERE epc IN ({{epcsSql}})",
                    })
                  }
                >
                  Preset: delete captured EPCs
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Save affected rows as</Label>
                  <Input
                    value={step.params.dbSaveAffectedAs || ''}
                    onChange={(e) => onSaveParams(step.id, { dbSaveAffectedAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="rowsAffected"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Save insert id as</Label>
                  <Input
                    value={step.params.dbSaveInsertIdAs || ''}
                    onChange={(e) => onSaveParams(step.id, { dbSaveInsertIdAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="newId"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Requires an active MySQL connection in the Database tab. One statement per node;
                the step fails (stopping the branch) if the SQL errors.
              </p>
            </div>
          )}

          {step.type === 'HTTP_REQUEST' && (
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Sends an HTTP request through the desktop app (no CORS limits) — the same engine the
                API tab uses. Capture the status, body, or a JSON field into variables.
              </p>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <div className="space-y-1">
                  <Label>Method</Label>
                  <Select
                    value={step.params.httpMethod || 'GET'}
                    onValueChange={(v) => onSaveParams(step.id, { httpMethod: v as HttpMethod })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as HttpMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>URL</Label>
                  <Input
                    value={step.params.httpUrl || ''}
                    onChange={(e) => onSaveParams(step.id, { httpUrl: e.target.value })}
                    className="h-10 font-mono text-sm"
                    placeholder="http://{{host}}:8081/…"
                  />
                </div>
              </div>
              <VariablePresetPicker
                value={step.params.httpUrl || ''}
                preferred={['host', 'alePort', 'epc']}
                compact
                onInsert={(next) => onSaveParams(step.id, { httpUrl: next })}
              />
              <Label>Headers (one per line — <code className="text-[10px]">Key: Value</code>)</Label>
              <Textarea
                value={step.params.httpHeaders || ''}
                onChange={(e) => onSaveParams(step.id, { httpHeaders: e.target.value })}
                rows={3}
                className="font-mono text-xs"
                placeholder={"Content-Type: application/json\nAuthorization: Bearer {{token}}"}
              />
              {step.params.httpMethod !== 'GET' && step.params.httpMethod !== 'HEAD' && (
                <>
                  <Label>Body</Label>
                  <Textarea
                    value={step.params.httpBody || ''}
                    onChange={(e) => onSaveParams(step.id, { httpBody: e.target.value })}
                    rows={5}
                    className="font-mono text-xs"
                    placeholder={'{"epc":"{{epc}}"}'}
                  />
                  <VariablePresetPicker
                    value={step.params.httpBody || ''}
                    preferred={['epc', 'epcs', 'tagCount', 'lastOcrResponse']}
                    onInsert={(next) => onSaveParams(step.id, { httpBody: next })}
                  />
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Save status as</Label>
                  <Input
                    value={step.params.httpSaveStatusAs || ''}
                    onChange={(e) => onSaveParams(step.id, { httpSaveStatusAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="httpStatus"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Save body as</Label>
                  <Input
                    value={step.params.httpSaveBodyAs || ''}
                    onChange={(e) => onSaveParams(step.id, { httpSaveBodyAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="httpBody"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>JSON path (optional)</Label>
                  <Input
                    value={step.params.httpJsonPath || ''}
                    onChange={(e) => onSaveParams(step.id, { httpJsonPath: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="data.items.0.epc"
                  />
                </div>
                <div className="space-y-1">
                  <Label>…save as</Label>
                  <Input
                    value={step.params.httpSaveJsonAs || ''}
                    onChange={(e) => onSaveParams(step.id, { httpSaveJsonAs: e.target.value })}
                    className="h-9 font-mono text-xs"
                    placeholder="firstEpc"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="space-y-1">
                  <Label>Timeout (ms)</Label>
                  <Input
                    type="number"
                    min={100}
                    value={step.params.httpTimeoutMs ?? 15000}
                    onChange={(e) => onSaveParams(step.id, { httpTimeoutMs: parseInt(e.target.value) || 15000 })}
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pb-1">
                  <Label className="text-xs">Fail on non-2xx</Label>
                  <Switch
                    checked={step.params.httpFailOnError !== false}
                    onCheckedChange={(v) => onSaveParams(step.id, { httpFailOnError: v })}
                  />
                </div>
              </div>
            </div>
          )}

          {step.type === 'CALL_SEQUENCE' && (() => {
            const targets = (sequences ?? []).filter((s) => s.id !== currentSequenceId)
            const selected = targets.find((s) => s.id === step.params.callSequenceId)
            return (
              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Runs another sequence as a sub-routine, then continues. Variables are{' '}
                  <span className="font-semibold">shared</span>, so values set here are visible to the
                  called sequence and vice-versa.
                </p>
                <Label>Sequence to call</Label>
                <Select
                  value={step.params.callSequenceId || ''}
                  onValueChange={(v) => {
                    const target = targets.find((s) => s.id === v)
                    onSaveParams(step.id, { callSequenceId: v })
                    // Auto-name the node after its target while the name is still generic.
                    if (target && (step.name === 'Call Sequence' || step.name.startsWith('Call '))) {
                      onSave(step.id, { name: `Call ${target.name}` })
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={targets.length ? 'Select a sequence…' : 'No other sequences available'} />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {s.steps.length} node{s.steps.length !== 1 ? 's' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {step.params.callSequenceId && !selected && (
                  <p className="text-[11px] text-amber-500">
                    The selected sequence no longer exists — pick another.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Recursive calls (a sequence calling itself, directly or in a cycle) are detected and
                  skipped; nesting is capped at 20 levels.
                </p>
              </div>
            )
          })()}
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
