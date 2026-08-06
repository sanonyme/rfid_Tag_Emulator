import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ExpandableTagField } from './ExpandableTagField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { ScrollArea } from './ui/scroll-area'
import {
  Activity,
  RefreshCw,
  Radio,
  Copy,
  Download,
  Check,
  ChevronsUpDown,
  Layers,
  Gauge,
  SlidersHorizontal,
  Hash,
  FileCode2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { TCPEmulatorClient, expandUpcListToEpcs, parseEpcListLine, type TagData } from '@/lib/tcp-client'
import { formatTime, cn } from '@/lib/utils'
import { prefersReducedMotion } from '@/lib/motion'
import { sectionCard, actionGroup, actionBtnMuted } from '@/lib/ui-tokens'
import { SendButton, LoopSendButton } from './SendControls'
import { TagPresetMenu, type TagPresetMenuHandle } from './TagPresetMenu'
import { TagSchemeGenerator } from './TagSchemeGenerator'
import { TagListSummary } from './TagListSummary'
import { DefinedItemsPicker } from './DefinedItemsPicker'
import { useTagListShortcuts } from '@/lib/tag-list-shortcuts'
import { AleApiClient, type LogicalDevice } from '@/lib/ale-api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Switch } from './ui/switch'
import { Badge } from './ui/badge'
import { useSettings } from '@/lib/settings-context'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface FixedTabProps {
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  port: string
  setPort: (port: string) => void
  alePort: string
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
  /** When true, Fixed tab listens for Send Tags keyboard shortcut (Ctrl+Enter). */
  fixedTabActive?: boolean
  /** Pop-out window: stacked layout on narrow widths, no page-level log scroll. */
  isPopout?: boolean
}
import { VENDOR_DRIVERS } from '@/lib/vendor-drivers'
import { getBoolPref, setBoolPref } from '@/lib/bool-pref'

export function FixedTab({ 
  emulator, 
  host, 
  // setHost, 
  // port, 
  // setPort,
  alePort,
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
  fixedTabActive = false,
  isPopout = false,
}: FixedTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [looping, setLooping] = useState(false)
  const loopingRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const sendTagsHotkeyRef = useRef<(isLooping?: boolean) => Promise<void>>(async () => {})
  const loopHotkeyRef = useRef<() => void>(() => {})
  const upcPresetRef = useRef<TagPresetMenuHandle>(null)
  const epcPresetRef = useRef<TagPresetMenuHandle>(null)
  const rssiSliderWheelRef = useRef<HTMLDivElement>(null)
  const rssiRef = useRef(rssi)
  rssiRef.current = rssi

  const [rssiRandomize, setRssiRandomize] = useState(false)
  const [rssiRandMin, setRssiRandMin] = useState('')
  const [rssiRandMax, setRssiRandMax] = useState('')

  // API State
  const [logicalDevices, setLogicalDevices] = useState<LogicalDevice[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [apiClient] = useState(() => new AleApiClient())

  const { settings } = useSettings()
  const serialContinuesAcrossUpcLines = settings.fixedSerialContinuesAcrossUpcLines
  const maxLogLinesRef = useRef(settings.maxLogLines)
  maxLogLinesRef.current = settings.maxLogLines
  const [fullActivityLog, setFullActivityLog] = useState(() =>
    getBoolPref('rfid-emulator-fixed-detail-logs'),
  )
  const fullActivityLogRef = useRef(fullActivityLog)
  fullActivityLogRef.current = fullActivityLog

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
    const end = logEndRef.current
    if (!end) return
    let el: HTMLElement | null = end.parentElement
    while (el) {
      const oy = getComputedStyle(el).overflowY
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        el.scrollHeight > el.clientHeight
      ) {
        el.scrollTop = el.scrollHeight
        return
      }
      el = el.parentElement
    }
  }, [log])

  useEffect(() => {
    const el = rssiSliderWheelRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const step = e.shiftKey ? 2 : 0.5
      const delta = e.deltaY > 0 ? -step : step
      const base = parseFloat(rssiRef.current)
      const b = Number.isFinite(base) ? base : -45
      const next = Math.min(0, Math.max(-80, Math.round((b + delta) * 2) / 2))
      setRssi(next.toFixed(1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setRssi])

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
  const reducedMotion = prefersReducedMotion()
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
        [effectiveMin, effectiveMax] = [effectiveMax, effectiveMin]
      }
    }

    const getTagRssi = () => {
      if (!rssiRandomize) return rssi
      const val = effectiveMin === effectiveMax
        ? effectiveMin
        : effectiveMin + Math.random() * (effectiveMax - effectiveMin)
      return val.toFixed(1)
    }

    // Parse EPC[,TID[,userdata]] (one EPC per line; TID / userdata optional)
    if (epcList.trim()) {
      const lines = epcList.trim().split('\n')
      for (const line of lines) {
        const parsed = parseEpcListLine(line)
        if (!parsed) continue
        const targetUids = selectedUids.length > 0 ? selectedUids : ['']
        for (const targetUid of targetUids) {
          for (const ant of selectedAntennas) {
            tags.push({
              epc: parsed.epc,
              tid: parsed.tid || parsed.epc,
              uid: targetUid,
              antenna: ant,
              rssi: getTagRssi(),
              userdata: parsed.userdata,
            })
          }
        }
      }
    }

    // Parse UPC,Count,TID[,userdata] and generate EPCs
    if (upcList.trim()) {
      const expanded = expandUpcListToEpcs(upcList, startSerial, serialContinuesAcrossUpcLines)
      const targetUids = selectedUids.length > 0 ? selectedUids : ['']
      for (const { epc, customTid, userdata } of expanded) {
        for (const targetUid of targetUids) {
          for (const ant of selectedAntennas) {
            tags.push({
              epc,
              tid: customTid || epc,
              uid: targetUid,
              antenna: ant,
              rssi: getTagRssi(),
              userdata,
            })
          }
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
        addLog('Warning: No logical devices selected. Sending without UID (use this to check for serials idk).')
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
      (progress) => {
        if (fullActivityLogRef.current) addLog(progress)
      },
      (complete) => {
        addLog(complete)
        if (isLooping && loopingRef.current) {
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

  sendTagsHotkeyRef.current = handleSendTags
  loopHotkeyRef.current = handleToggleLoop

  useEffect(() => {
    if (!fixedTabActive) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return
      if (e.repeat) return
      if (e.altKey) return
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-command-palette]')) return
      const dialogEl = target.closest('[role="dialog"]')
      if (dialogEl && !dialogEl.hasAttribute('data-tag-expand-dialog')) return
      e.preventDefault()
      if (e.shiftKey) {
        loopHotkeyRef.current()
      } else {
        void sendTagsHotkeyRef.current(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fixedTabActive])

  // Per-textarea shortcut handlers (Ctrl+S save preset, Ctrl+L load preset).
  // Send / Loop are handled by the global listener above so they fire even
  // when the cursor is outside the tag fields.
  const upcShortcuts = useTagListShortcuts({
    onSavePreset: () => upcPresetRef.current?.openSave(),
    onLoadPreset: () => upcPresetRef.current?.open(),
  })
  const epcShortcuts = useTagListShortcuts({
    onSavePreset: () => epcPresetRef.current?.openSave(),
    onLoadPreset: () => epcPresetRef.current?.open(),
  })

  const applyDefinedItems = useCallback(
    (content: string, mode: 'replace' | 'append') => {
      setUpcList(mode === 'append' && upcList ? upcList + '\n' + content : content)
    },
    [upcList, setUpcList],
  )

  const sendTagsShortcutLabel =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? '⌘ Enter'
      : 'Ctrl+Enter'

  return (
    <div
      className={cn(
        'h-full min-h-0 overflow-hidden gap-4',
        isPopout
          ? 'flex flex-col lg:grid lg:grid-cols-[minmax(260px,36%)_1fr] lg:gap-5'
          : 'grid grid-cols-[320px_1fr] xl:grid-cols-[348px_1fr] gap-5',
      )}
    >
      {/* Left Sidebar - Configuration */}
      <div
        className={cn(
          'stagger-children space-y-4 overflow-y-auto pr-1 min-h-0',
          isPopout && 'max-h-[42vh] shrink-0 lg:max-h-none lg:shrink',
        )}
      >
        {/* Tag Defaults */}
        <Card className={sectionCard} data-tour="tour-fixed-tag-defaults">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <CardTitle className="text-base font-semibold tracking-tight">Tag defaults</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Antennas &amp; RSSI applied to simulated reads
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5 pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Antennas</Label>
                <Badge variant="secondary" className="tabular-nums font-normal text-muted-foreground">
                  {selectedAntennaCount} active
                </Badge>
              </div>
              <div className="flex gap-1.5 rounded-xl bg-muted/40 p-1.5 ring-1 ring-border/30">
                {[1, 2, 3, 4].map((ant) => {
                  const selected = antenna.split(',').filter(Boolean).includes(String(ant))
                  return (
                    <motion.button
                      key={ant}
                      type="button"
                      whileTap={reducedMotion ? undefined : { scale: 0.9 }}
                      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 28 }}
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
                      className={cn(
                        'relative flex flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg py-2.5 transition-[background,color,box-shadow] duration-300 ease-out',
                        selected
                          ? 'text-emerald-700 shadow-sm ring-1 ring-emerald-500/35 dark:text-emerald-300'
                          : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                      )}
                    >
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            key="bg"
                            aria-hidden
                            initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
                            className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-gradient-to-b from-emerald-500/20 to-emerald-600/10"
                          />
                        )}
                      </AnimatePresence>
                      <motion.span
                        animate={selected && !reducedMotion ? { rotate: [0, -12, 12, 0] } : { rotate: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      >
                        <Radio className={cn('h-4 w-4 transition-colors duration-300', selected ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-50')} />
                      </motion.span>
                      <span className="text-xs font-semibold tabular-nums">{ant}</span>
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            key="dot"
                            initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={reducedMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 22 }}
                            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.85)]"
                          />
                        )}
                      </AnimatePresence>
                    </motion.button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border/35 bg-muted/15 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="rssi" className="text-sm font-medium">
                    RSSI
                  </Label>
                </div>
                <Badge variant="outline" className="font-mono text-xs tabular-nums">
                  {rssi} dBm
                </Badge>
              </div>
              <div
                ref={rssiSliderWheelRef}
                className="rounded-lg px-0.5 py-2"
                title="Drag or scroll wheel to adjust (−80…0 dBm). Hold Shift for ±2 dBm steps."
              >
                <Slider
                  value={[parseFloat(rssi) || -45]}
                  onValueChange={([val]) => setRssi(val.toFixed(1))}
                  min={-80}
                  max={0}
                  step={0.5}
                />
              </div>
              <Input
                id="rssi"
                value={rssi}
                onChange={(e) => setRssi(e.target.value)}
                className="h-9 rounded-lg border-border/50 bg-background/80 text-xs font-mono"
              />

              <div className="space-y-3 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal leading-snug">Randomize RSSI per tag</Label>
                  <Switch checked={rssiRandomize} onCheckedChange={setRssiRandomize} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rssi-min" className="text-[11px] text-muted-foreground">
                      Min
                    </Label>
                    <Input
                      id="rssi-min"
                      type="number"
                      step="0.5"
                      value={rssiRandMin}
                      onChange={(e) => setRssiRandMin(e.target.value)}
                      placeholder="-90"
                      disabled={!rssiRandomize}
                      className="h-8 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rssi-max" className="text-[11px] text-muted-foreground">
                      Max
                    </Label>
                    <Input
                      id="rssi-max"
                      type="number"
                      step="0.5"
                      value={rssiRandMax}
                      onChange={(e) => setRssiRandMax(e.target.value)}
                      placeholder="-20"
                      disabled={!rssiRandomize}
                      className="h-8 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Leave Min/Max empty for defaults (−90 to −20 dBm).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Driver Settings */}
        <Card className={sectionCard} data-tour="tour-fixed-driver">
          <CardHeader className="pb-3 pt-5 px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <CardTitle className="text-base font-semibold tracking-tight">Driver &amp; device</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Protocol, timing, and ALE logical targets
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5 pt-0">
            {/* Logical Device Selection */}
            <div className="space-y-2">
              <Label htmlFor="logical-device" className="text-sm font-medium">
                Logical device
              </Label>
              <div className={cn(actionGroup, 'gap-1.5 p-1.5')}>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        actionBtnMuted,
                        'h-10 flex-1 justify-between px-3 font-normal text-foreground',
                      )}
                    >
                      <span className="truncate text-left text-sm">
                        {selectedUids.length === 0
                          ? 'Choose devices…'
                          : selectedUids.length === 1
                            ? logicalDevices.find((d) => d.uid === selectedUids[0])?.name || selectedUids[0]
                            : `${selectedUids.length} devices`}
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
                            <div className={cn(actionGroup, 'mb-2 shrink-0')}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={selectAll}
                                  className={cn(actionBtnMuted, 'h-9 flex-1')}
                                >
                                  Select all
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={deselectAll}
                                  className={cn(actionBtnMuted, 'h-9 flex-1')}
                                >
                                  Clear
                                </Button>
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
                                              className={cn(
                                                'flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2.5 transition-colors',
                                                selectedUids.includes(device.uid)
                                                  ? 'border-primary/25 bg-primary/5'
                                                  : 'hover:bg-muted/60',
                                              )}
                                              onClick={() => toggleDevice(device.uid)}
                                            >
                                              <div
                                                className={cn(
                                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                  selectedUids.includes(device.uid)
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-input bg-background',
                                                )}
                                              >
                                                {selectedUids.includes(device.uid) && <Check className="h-3 w-3" />}
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{device.name}</p>
                                                <p className="truncate font-mono text-xs text-muted-foreground">{device.uid}</p>
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
                      title="Refresh logical devices"
                      className={cn(actionBtnMuted, 'h-10 w-10 shrink-0')}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="driver" className="text-sm font-medium">
                  Driver
                </Label>
                <Select value={driver} onValueChange={setDriver}>
                  <SelectTrigger id="driver" className="h-10 rounded-lg border-border/60 bg-background/80 shadow-none">
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
                <Label htmlFor="delay" className="text-sm font-medium">
                  Inter-tag delay
                </Label>
                <div className="relative">
                  <Input
                    id="delay"
                    type="number"
                    min="0"
                    step="50"
                    value={delay}
                    onChange={(e) => setDelay(e.target.value)}
                    className="h-10 rounded-lg border-border/60 bg-background/80 pe-12 font-mono text-sm shadow-none"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    ms
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side - Tag Management & Log */}
      <div className={cn('flex flex-col gap-4 min-h-0', isPopout && 'flex-1')}>
        {/* Tag Input */}
        <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-2" data-tour="tour-fixed-tags">
          <Card className={sectionCard}>
            <CardHeader className="space-y-3 pb-3 pt-5 px-5">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
                      <Hash className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold tracking-tight">UPC → EPC</CardTitle>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <TagListSummary value={upcList} kind="upc" />
                    <TagPresetMenu
                      ref={upcPresetRef}
                      kind="upc"
                      variant="compact"
                      currentValue={upcList}
                      onLoad={(content, mode) =>
                        setUpcList(mode === 'append' && upcList ? upcList + '\n' + content : content)
                      }
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="UPC line format"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        <p className="font-mono text-[11px]">UPC,Count,TID[,userdata]</p>
                        <p className="mt-1 text-muted-foreground">
                          TID and userdata are optional hex. Example: <span className="font-mono">12345,5,,DEADBEEF</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <CardDescription className="text-xs leading-relaxed text-pretty">
                  Generate SGTIN-style EPCs from product lines
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5 pt-0">
              <ExpandableTagField
                dialogTitle="UPC → EPC generation"
                dialogDescription="Format: UPC,Count,TID[,userdata] (TID and userdata optional hex) — CSV columns auto-detected on drop"
                value={upcList}
                onChange={(e) => setUpcList(e.target.value)}
                onFileImport={(content) => setUpcList(upcList ? upcList + '\n' + content : content)}
                kind="upc"
                onKeyDown={upcShortcuts}
                placeholder="00000000000000,5"
                compactClassName="min-h-[120px] rounded-lg border-border/50 bg-muted/10 font-mono text-sm"
                cornerActions={
                  <DefinedItemsPicker
                    host={host}
                    connected={connected}
                    trigger="icon"
                    onApply={applyDefinedItems}
                  />
                }
              />
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="startSerial" className="text-sm font-medium">
                    Starting serial
                  </Label>
                  <Input
                    id="startSerial"
                    type="number"
                    min="1"
                    max="999999999"
                    value={startSerial}
                    onChange={(e) => setStartSerial(e.target.value)}
                    className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCard}>
            <CardHeader className="space-y-3 pb-3 pt-5 px-5">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                      <FileCode2 className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold tracking-tight">Direct EPC</CardTitle>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <TagListSummary value={epcList} kind="epc" />
                    <TagSchemeGenerator
                      variant="compact"
                      onGenerated={(epcs) => setEpcList(epcList ? epcList + '\n' + epcs : epcs)}
                    />
                    <TagPresetMenu
                      ref={epcPresetRef}
                      kind="epc"
                      variant="compact"
                      currentValue={epcList}
                      onLoad={(content, mode) =>
                        setEpcList(mode === 'append' && epcList ? epcList + '\n' + content : content)
                      }
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="EPC line format"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        <p className="font-mono text-[11px]">EPC[,TID[,userdata]]</p>
                        <p className="mt-1 text-muted-foreground">
                          TID and userdata are optional hex. Example: <span className="font-mono">3034…,,DEADBEEF</span>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <CardDescription className="text-xs leading-relaxed text-pretty">
                  Paste raw hex EPCs with optional TID and userdata per line
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5 pt-0">
              <ExpandableTagField
                dialogTitle="Direct EPC input"
                dialogDescription="Format: EPC[,TID[,userdata]] (one per line; TID and userdata optional hex) — CSV columns auto-detected on drop"
                value={epcList}
                onChange={(e) => setEpcList(e.target.value)}
                onFileImport={(content) => setEpcList(epcList ? epcList + '\n' + content : content)}
                kind="epc"
                onKeyDown={epcShortcuts}
                placeholder="3034...&#10;3035...,CustomTID,DEADBEEF"
                compactClassName="min-h-[120px] rounded-lg border-border/50 bg-muted/10 font-mono text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* Send Controls */}
        <Card
          className={cn(
            sectionCard,
            'shrink-0 overflow-hidden bg-gradient-to-br from-card via-card to-primary/[0.04]',
          )}
          data-tour="tour-fixed-send"
        >
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tracking-tight">Send to reader</p>
                  {!connected && (
                    <Badge variant="outline" className="text-[10px] font-normal text-amber-600 dark:text-amber-500">
                      Connect from the bar first
                    </Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{totalInputRows}</span> input line
                  {totalInputRows === 1 ? '' : 's'} · driver <span className="font-mono text-foreground/90">{driver}</span>
                </p>
              </div>
              <div className={cn(actionGroup, 'w-full gap-1.5 p-1.5 sm:w-auto')}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex min-w-0 flex-1">
                      <SendButton
                        ripple
                        onClick={() => handleSendTags(false)}
                        disabled={!connected || sending || looping}
                        label="Send Tags"
                        shortcut={sendTagsShortcutLabel}
                        className="w-full min-w-0 flex-wrap justify-center gap-x-2 gap-y-1 px-4 py-2.5 sm:min-w-[10.75rem]"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <span className="text-muted-foreground">
                      Shortcut works while typing in tag fields and in the expanded editor. It is ignored in the command palette and other dialogs (settings, device picker, etc.).
                    </span>
                  </TooltipContent>
                </Tooltip>
                <LoopSendButton
                  active={sending || looping}
                  onClick={sending || looping ? handleStop : handleToggleLoop}
                  disabled={!connected || (!sending && !looping && totalInputRows === 0)}
                  ripple
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Area */}
        <Card className={cn(sectionCard, 'flex min-h-[200px] flex-1 flex-col overflow-hidden')} data-tour="tour-fixed-log">
          <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 py-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/40">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                </span>
                <span>Emulator log</span>
                {(sending || looping) && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
              </CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2 py-1 sm:px-2.5">
                  <Switch
                    id="fixed-detail-logs"
                    checked={fullActivityLog}
                    onCheckedChange={(v) => {
                      setFullActivityLog(v)
                      setBoolPref('rfid-emulator-fixed-detail-logs', v)
                    }}
                  />
                  <Label
                    htmlFor="fixed-detail-logs"
                    className="cursor-pointer whitespace-nowrap text-xs font-medium text-muted-foreground"
                    title="Off: summary lines only. On: include every per-tag send line."
                  >
                    Full activity log
                  </Label>
                </div>
                <div className={actionGroup}>
                {log.length > 0 && (
                  <>
                    <Button
                      onClick={handleCopyLog}
                      variant="ghost"
                      size="sm"
                      className={cn(actionBtnMuted, 'h-8 gap-1.5 px-2.5 text-xs')}
                      title="Copy log"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Copy</span>
                    </Button>
                    <Button
                      onClick={handleExportLog}
                      variant="ghost"
                      size="sm"
                      className={cn(actionBtnMuted, 'h-8 gap-1.5 px-2.5 text-xs')}
                      title="Export to file"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                    <div className="mx-0.5 hidden h-4 w-px self-center bg-border/80 sm:block" />
                  </>
                )}
                <Button
                  onClick={() => setLog([])}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    actionBtnMuted,
                    'h-8 px-2.5 text-xs',
                    log.length > 0 && 'hover:bg-destructive/10 hover:text-destructive',
                  )}
                  title="Clear log"
                >
                  Clear
                </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 bg-muted/15 p-0">
            {log.length === 0 ? (
              <div className="flex h-full min-h-[180px] items-center justify-center px-6 text-center">
                <div className="max-w-[220px] space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Radio className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">Waiting for activity</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Runs, device fetches, and tag sends will stream here in real time.
                  </p>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full min-h-[140px]">
                <div className="space-y-0.5 p-3 font-mono text-xs sm:text-sm">
                  {log.map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent/35 hover:text-foreground',
                        i === log.length - 1 && 'animate-log-new',
                      )}
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
