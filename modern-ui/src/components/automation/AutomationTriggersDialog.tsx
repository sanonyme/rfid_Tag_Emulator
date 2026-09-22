import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  Zap,
  Globe,
  FolderSearch,
  Timer,
  Trash2,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AutomationSequence, AutomationTrigger, TriggerType } from '@/lib/automation-types'
import { cn } from '@/lib/utils'

interface AutomationTriggersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sequences: AutomationSequence[]
  triggers: AutomationTrigger[]
  onSaveTriggers: (triggers: AutomationTrigger[]) => void
}

export const TRIGGERS_STORAGE_KEY = 'rfid-automation-triggers'

export function loadSavedTriggers(): AutomationTrigger[] {
  try {
    const raw = localStorage.getItem(TRIGGERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSavedTriggers(triggers: AutomationTrigger[]): void {
  try {
    localStorage.setItem(TRIGGERS_STORAGE_KEY, JSON.stringify(triggers))
  } catch {
    /* noop */
  }
}

export function AutomationTriggersDialog({
  open,
  onOpenChange,
  sequences,
  triggers,
  onSaveTriggers,
}: AutomationTriggersDialogProps) {
  const [items, setItems] = useState<AutomationTrigger[]>(triggers)
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    setItems(triggers)
    if (triggers.length > 0 && !activeTab) {
      setActiveTab(triggers[0]?.id || null)
    }
  }, [triggers, open])

  const selectedTrigger = items.find((t) => t.id === activeTab) || items[0] || null

  const handleAddTrigger = (type: TriggerType) => {
    const newId = crypto.randomUUID()
    const firstSeqId = sequences[0]?.id || ''
    const newTrigger: AutomationTrigger = {
      id: newId,
      name:
        type === 'webhook'
          ? 'Inbound Webhook'
          : type === 'file_watcher'
            ? 'CSV Folder Watcher'
            : 'Scheduled Interval',
      type,
      enabled: false,
      targetSequenceId: firstSeqId,
      webhookPort: 8989,
      webhookPath: `/webhook/test-${Math.floor(Math.random() * 1000)}`,
      watcherPath: '',
      watcherPattern: '*.csv',
      intervalSeconds: 60,
    }
    const updated = [...items, newTrigger]
    setItems(updated)
    setActiveTab(newId)
    onSaveTriggers(updated)
    saveSavedTriggers(updated)
    toast.success(`Added ${newTrigger.name}`)
  }

  const handleDeleteTrigger = (id: string) => {
    const updated = items.filter((t) => t.id !== id)
    setItems(updated)
    onSaveTriggers(updated)
    saveSavedTriggers(updated)
    if (activeTab === id) {
      setActiveTab(updated[0]?.id || null)
    }
    toast.info('Trigger deleted')
  }

  const handleUpdateCurrent = (patch: Partial<AutomationTrigger>) => {
    if (!selectedTrigger) return
    const updated = items.map((t) => (t.id === selectedTrigger.id ? { ...t, ...patch } : t))
    setItems(updated)
    onSaveTriggers(updated)
    saveSavedTriggers(updated)
  }

  const handlePickWatcherFolder = async () => {
    if (!window.electronAPI?.localPickFolder) {
      toast.info('Folder picker is available in the Electron desktop build')
      return
    }
    const res = await window.electronAPI.localPickFolder()
    if (res.ok && res.path) {
      handleUpdateCurrent({ watcherPath: res.path })
    }
  }

  const handleCopyCurl = (trig: AutomationTrigger) => {
    const port = trig.webhookPort || 8989
    const path = trig.webhookPath || '/webhook/test'
    const cmd = `curl -X POST http://localhost:${port}${path} -H "Content-Type: application/json" -d '{"epc":"E280116060000204","scanCount":10}'`
    void navigator.clipboard.writeText(cmd)
    setCopied(trig.id)
    setTimeout(() => setCopied(null), 2000)
    toast.success('Copied curl command to clipboard')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <DialogTitle className="text-base font-semibold">Event Triggers</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Automatically start workflows via Inbound Webhooks, File Watchers, or Timer Intervals
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAddTrigger('webhook')}
              >
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                + Webhook
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAddTrigger('file_watcher')}
              >
                <FolderSearch className="w-3.5 h-3.5 text-emerald-500" />
                + Watcher
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleAddTrigger('interval')}
              >
                <Timer className="w-3.5 h-3.5 text-purple-500" />
                + Interval
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-[400px] max-h-[60vh] divide-x divide-border/40 overflow-hidden">
          {/* Left Sidebar: Triggers List */}
          <div className="w-64 bg-muted/20 flex flex-col shrink-0 overflow-y-auto p-2 space-y-1">
            {items.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground p-3">
                No active triggers.<br />Click a button above to add one.
              </div>
            ) : (
              items.map((trig) => {
                const isSelected = trig.id === selectedTrigger?.id
                return (
                  <div
                    key={trig.id}
                    onClick={() => setActiveTab(trig.id)}
                    className={cn(
                      'group flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-all border',
                      isSelected
                        ? 'bg-background border-primary/50 shadow-sm'
                        : 'border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {trig.type === 'webhook' ? (
                        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : trig.type === 'file_watcher' ? (
                        <FolderSearch className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Timer className="w-4 h-4 text-purple-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{trig.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {trig.enabled ? (
                            <span className="text-emerald-500 font-medium">Active</span>
                          ) : (
                            <span>Disabled</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive rounded transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTrigger(trig.id)
                      }}
                      title="Delete trigger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Right Configuration Panel */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {!selectedTrigger ? (
              <div className="py-16 text-center text-xs text-muted-foreground">
                Select or create a trigger to configure
              </div>
            ) : (
              <div className="space-y-4 max-w-lg">
                {/* Header info */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40">
                  <div>
                    <h4 className="text-sm font-semibold">{selectedTrigger.name}</h4>
                    <span className="text-xs text-muted-foreground uppercase font-mono">
                      Type: {selectedTrigger.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="trigger-enable" className="text-xs">
                      {selectedTrigger.enabled ? 'Enabled' : 'Disabled'}
                    </Label>
                    <Switch
                      id="trigger-enable"
                      checked={selectedTrigger.enabled}
                      onCheckedChange={(v) => handleUpdateCurrent({ enabled: v })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Trigger Name</Label>
                  <Input
                    value={selectedTrigger.name}
                    onChange={(e) => handleUpdateCurrent({ name: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Target Sequence to Run</Label>
                  <Select
                    value={selectedTrigger.targetSequenceId}
                    onValueChange={(val) => handleUpdateCurrent({ targetSequenceId: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select sequence" />
                    </SelectTrigger>
                    <SelectContent>
                      {sequences.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs font-mono">
                          {s.name} ({s.steps.length} nodes)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Webhook Configuration */}
                {selectedTrigger.type === 'webhook' && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-500">
                      <Globe className="w-4 h-4" />
                      <span>Local HTTP Webhook Configuration</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1 space-y-1">
                        <Label className="text-[11px]">Port</Label>
                        <Input
                          type="number"
                          value={selectedTrigger.webhookPort || 8989}
                          onChange={(e) =>
                            handleUpdateCurrent({ webhookPort: parseInt(e.target.value, 10) || 8989 })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[11px]">Path (e.g. /webhook/order)</Label>
                        <Input
                          value={selectedTrigger.webhookPath || '/webhook/test'}
                          onChange={(e) => handleUpdateCurrent({ webhookPath: e.target.value })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Test with cURL</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] gap-1"
                          onClick={() => handleCopyCurl(selectedTrigger)}
                        >
                          {copied === selectedTrigger.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Copy curl
                        </Button>
                      </div>
                      <div className="font-mono text-[11px] bg-background/80 p-2 rounded border border-border/40 select-all break-all leading-tight">
                        curl -X POST http://localhost:{selectedTrigger.webhookPort || 8989}
                        {selectedTrigger.webhookPath || '/webhook/test'} -H "Content-Type:
                        application/json" -d '{`{"epc":"E280116060000204"}`}'
                      </div>
                    </div>
                  </div>
                )}

                {/* File Watcher Configuration */}
                {selectedTrigger.type === 'file_watcher' && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500">
                      <FolderSearch className="w-4 h-4" />
                      <span>Folder Watcher Configuration</span>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px]">Folder to Watch</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={selectedTrigger.watcherPath || ''}
                          onChange={(e) => handleUpdateCurrent({ watcherPath: e.target.value })}
                          placeholder="e.g. C:/data/rfid_drops"
                          className="h-8 text-xs font-mono flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={handlePickWatcherFolder}
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Browse
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px]">Filename Pattern (e.g. *.csv or *.txt)</Label>
                      <Input
                        value={selectedTrigger.watcherPattern || '*.csv'}
                        onChange={(e) => handleUpdateCurrent({ watcherPattern: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Interval Configuration */}
                {selectedTrigger.type === 'interval' && (
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-purple-500">
                      <Timer className="w-4 h-4" />
                      <span>Scheduled Timer Interval</span>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px]">Interval in Seconds</Label>
                      <Input
                        type="number"
                        min={5}
                        max={86400}
                        value={selectedTrigger.intervalSeconds || 60}
                        onChange={(e) =>
                          handleUpdateCurrent({
                            intervalSeconds: Math.max(5, parseInt(e.target.value, 10) || 60),
                          })
                        }
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Will execute the sequence every {selectedTrigger.intervalSeconds || 60} seconds while Antigravity is running.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 border-t border-border/50 bg-muted/10 flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            {items.filter((t) => t.enabled).length} trigger(s) currently active
          </div>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
