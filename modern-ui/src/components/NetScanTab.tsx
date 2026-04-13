import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Radar, Play, Square, Monitor, Loader2, Copy, Check, Radio, Trash2, Send, Search, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { NetScanStartPayload, ReaderDiscoveryPayload } from '../types/electron'

// --- UDP Edge Discovery types and hook ---

interface EdgeDevice {
  ip: string
  port: number
  guid: string
  mac: string
  version: string
  lastPDUpdate: string
  errors: string
  name: string
  raw: string
  discoveredAt: number
}

interface RawUdpMessage {
  data: string
  from: string
  fromPort: number
  timestamp: number
}

function useUdpDiscovery(setHost: (h: string) => void) {
  const api = window.electronAPI
  const [listening, setListening] = useState(false)
  const [localPort, setLocalPort] = useState('7000')
  const [remotePort, setRemotePort] = useState('23')
  const [duration, setDuration] = useState('60')
  const [devices, setDevices] = useState<EdgeDevice[]>([])
  const [rawMessages, setRawMessages] = useState<RawUdpMessage[]>([])
  const [showRaw, setShowRaw] = useState(false)
  const [probeIp, setProbeIp] = useState('255.255.255.255')
  const [probeMessage, setProbeMessage] = useState('')
  const unsubRef = useRef<Array<() => void>>([])

  const clearListeners = useCallback(() => {
    unsubRef.current.forEach((u) => u())
    unsubRef.current = []
  }, [])

  useEffect(() => {
    return () => clearListeners()
  }, [clearListeners])

  const startDiscovery = useCallback(async () => {
    if (!api?.udpDiscoveryStart) return
    clearListeners()
    setDevices([])
    setRawMessages([])

    const port = parseInt(localPort, 10) || 7000
    const dur = (parseInt(duration, 10) || 60) * 1000

    const u1 = api.onUdpDiscoveryDevice?.((device) => {
      setDevices((prev) => {
        const key = device.mac || device.ip
        const exists = prev.findIndex((d) => (d.mac || d.ip) === key)
        if (exists >= 0) {
          const next = [...prev]
          next[exists] = device
          return next
        }
        return [...prev, device]
      })
    })
    const u2 = api.onUdpDiscoveryRaw?.((payload) => {
      setRawMessages((prev) => [...prev.slice(-199), payload])
    })
    const u3 = api.onUdpDiscoveryStopped?.(() => {
      setListening(false)
      clearListeners()
      toast.success('UDP discovery stopped')
    })
    const u4 = api.onUdpDiscoveryError?.((e) => {
      setListening(false)
      clearListeners()
      toast.error(`UDP error: ${e.message}`)
    })
    const u5 = api.onUdpDiscoveryStarted?.(() => {
      setListening(true)
      toast.success(`Listening on UDP port ${port}`)
    })
    unsubRef.current = [u1, u2, u3, u4, u5].filter(Boolean) as (() => void)[]

    const r = await api.udpDiscoveryStart(port, dur)
    if (!r.ok) {
      setListening(false)
      clearListeners()
      toast.error('error' in r ? r.error : 'Failed to start UDP discovery')
    }
  }, [api, localPort, duration, clearListeners])

  const stopDiscovery = useCallback(async () => {
    clearListeners()
    await api?.udpDiscoveryStop?.()
    setListening(false)
  }, [api, clearListeners])

  const sendProbe = useCallback(async () => {
    if (!api?.udpDiscoverySendProbe) return
    const rPort = parseInt(remotePort, 10) || 23
    const msg = probeMessage || ' '
    const r = await api.udpDiscoverySendProbe(probeIp.trim(), rPort, msg)
    if (r.ok) {
      toast.success(`Probe sent to ${probeIp}:${rPort}`)
    } else {
      toast.error('error' in r ? r.error : 'Failed to send probe')
    }
  }, [api, probeIp, remotePort, probeMessage])

  const clearDevices = useCallback(() => {
    setDevices([])
    setRawMessages([])
  }, [])

  return {
    listening,
    localPort,
    setLocalPort,
    remotePort,
    setRemotePort,
    duration,
    setDuration,
    devices,
    rawMessages,
    showRaw,
    setShowRaw,
    probeIp,
    setProbeIp,
    probeMessage,
    setProbeMessage,
    startDiscovery,
    stopDiscovery,
    sendProbe,
    clearDevices,
    setHost,
  }
}

type ReaderVendor = 'impinj' | 'seuic' | 'unknown'
type ReaderConfidence = 'low' | 'medium' | 'high'
type ReaderMode = 'cidr' | 'range' | 'allSubnets'

interface ReaderCandidate {
  ip: string
  vendor: ReaderVendor
  confidence: ReaderConfidence
  openPorts: number[]
  reason: string
  title?: string
  server?: string
  url?: string
}

function useReaderDiscovery(defaultCidr: string) {
  const api = window.electronAPI
  const [mode, setMode] = useState<ReaderMode>('cidr')
  const [cidr, setCidr] = useState(defaultCidr || '192.168.1.0/24')
  const [startIp, setStartIp] = useState('192.168.1.1')
  const [endIp, setEndIp] = useState('192.168.1.254')
  const [concurrency, setConcurrency] = useState('48')
  const [timeoutMs, setTimeoutMs] = useState('1200')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, found: 0 })
  const [results, setResults] = useState<ReaderCandidate[]>([])
  const unsubRef = useRef<Array<() => void>>([])

  useEffect(() => {
    if (defaultCidr && mode === 'cidr') setCidr(defaultCidr)
  }, [defaultCidr, mode])

  const clearListeners = useCallback(() => {
    unsubRef.current.forEach((u) => u())
    unsubRef.current = []
  }, [])

  useEffect(() => {
    return () => clearListeners()
  }, [clearListeners])

  const start = useCallback(async () => {
    if (!api?.readerDiscoveryStart || !api.onReaderDiscoveryHost) return
    clearListeners()
    setResults([])
    setProgress({ done: 0, total: 0, found: 0 })
    setScanning(true)

    const u1 = api.onReaderDiscoveryHost((payload) => {
      setProgress({ done: payload.done, total: payload.total, found: payload.found })
      if (!payload.reader) return
      setResults((prev) => {
        const next = prev.filter((x) => x.ip !== payload.reader!.ip)
        next.push(payload.reader!)
        return next.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
      })
    })
    const u2 = api.onReaderDiscoveryDone?.((payload) => {
      setScanning(false)
      setProgress((p) => ({ ...p, done: payload.total, total: payload.total, found: payload.found }))
      clearListeners()
      toast.success(`Reader discovery finished (${payload.found} found)`)
    })
    const u3 = api.onReaderDiscoveryError?.((payload) => {
      setScanning(false)
      clearListeners()
      toast.error(payload.message)
    })
    unsubRef.current = [u1, u2, u3].filter(Boolean) as (() => void)[]

    const payload: ReaderDiscoveryPayload =
      mode === 'cidr'
        ? {
            mode: 'cidr',
            cidr: cidr.trim(),
            concurrency: Math.min(80, Math.max(1, parseInt(concurrency, 10) || 48)),
            timeoutMs: Math.min(8000, Math.max(400, parseInt(timeoutMs, 10) || 1200)),
          }
        : mode === 'range'
          ? {
              mode: 'range',
              start: startIp.trim(),
              end: endIp.trim(),
              concurrency: Math.min(80, Math.max(1, parseInt(concurrency, 10) || 48)),
              timeoutMs: Math.min(8000, Math.max(400, parseInt(timeoutMs, 10) || 1200)),
            }
          : {
              mode: 'allSubnets',
              concurrency: Math.min(80, Math.max(1, parseInt(concurrency, 10) || 48)),
              timeoutMs: Math.min(8000, Math.max(400, parseInt(timeoutMs, 10) || 1200)),
            }

    const res = await api.readerDiscoveryStart(payload)
    if (!res.ok) {
      setScanning(false)
      clearListeners()
      toast.error('error' in res ? res.error : 'Failed to start reader discovery')
      return
    }
    setProgress({ done: 0, total: res.total, found: 0 })
  }, [api, cidr, clearListeners, concurrency, endIp, mode, startIp, timeoutMs])

  const stop = useCallback(async () => {
    clearListeners()
    await api?.readerDiscoveryCancel?.()
    setScanning(false)
  }, [api, clearListeners])

  return {
    mode,
    setMode,
    cidr,
    setCidr,
    startIp,
    setStartIp,
    endIp,
    setEndIp,
    concurrency,
    setConcurrency,
    timeoutMs,
    setTimeoutMs,
    scanning,
    progress,
    results,
    start,
    stop,
    clear: () => {
      setResults([])
      setProgress({ done: 0, total: 0, found: 0 })
    },
  }
}

interface NetIface {
  name: string
  address: string
  netmask: string
  cidr: number
  networkCidr: string
}

type ScanRow = { ip: string; alive: boolean; hostname?: string }

interface NetScanTabProps {
  host: string
  setHost: (h: string) => void
}

type ScanMode = 'cidr' | 'range' | 'allSubnets'

/** Usable host bounds for a network CIDR (matches backend enumerateCidr). */
function cidrHostBounds(networkCidr: string): { start: string; end: string } | null {
  const m = networkCidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/)
  if (!m) return null
  const prefix = parseInt(m[2]!, 10)
  if (prefix < 8 || prefix > 30) return null
  const p = m[1]!.split('.').map((x) => parseInt(x, 10))
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  const ipInt = (((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0)
  const mask = (~0 << (32 - prefix)) >>> 0
  const networkInt = ipInt & mask
  const hostBits = 32 - prefix
  const hostCount = (1 << hostBits) - 2
  if (hostCount < 1) return null
  const intTo = (n: number) =>
    `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
  return { start: intTo(networkInt + 1), end: intTo(networkInt + hostCount) }
}

export function NetScanTab({ host, setHost }: NetScanTabProps) {
  const api = window.electronAPI
  const hasApi = Boolean(api?.netScanGetInterfaces && api?.netScanStart)

  const [ifaces, setIfaces] = useState<NetIface[]>([])
  const [scanMode, setScanMode] = useState<ScanMode>('cidr')
  const [cidr, setCidr] = useState('192.168.1.0/24')
  const [rangeStart, setRangeStart] = useState('192.168.1.1')
  const [rangeEnd, setRangeEnd] = useState('192.168.1.254')
  const [concurrency, setConcurrency] = useState('40')
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [rows, setRows] = useState<ScanRow[]>([])
  const [aliveOnly, setAliveOnly] = useState(false)
  const [copied, setCopied] = useState(false)
  const unsubRef = useRef<Array<() => void>>([])

  const clearListeners = useCallback(() => {
    unsubRef.current.forEach((u) => u())
    unsubRef.current = []
  }, [])

  useEffect(() => {
    return () => clearListeners()
  }, [clearListeners])

  const loadInterfaces = useCallback(async () => {
    if (!api?.netScanGetInterfaces) return
    try {
      const r = await api.netScanGetInterfaces()
      if (r.ok && r.interfaces?.length) {
        setIfaces(r.interfaces)
        const first = r.interfaces[0]!
        setCidr(first.networkCidr)
        const b = cidrHostBounds(first.networkCidr)
        if (b) {
          setRangeStart(b.start)
          setRangeEnd(b.end)
        }
      }
    } catch {
      /* ignore */
    }
  }, [api])

  useEffect(() => {
    void loadInterfaces()
  }, [loadInterfaces])

  const stopScan = useCallback(async () => {
    clearListeners()
    await api?.netScanCancel?.()
    setScanning(false)
  }, [api, clearListeners])

  const startScan = useCallback(async () => {
    if (!api?.netScanStart || !api.onNetScanHost) return
    const conc = Math.min(64, Math.max(1, parseInt(concurrency, 10) || 40))
    clearListeners()
    setRows([])
    setProgress({ done: 0, total: 0 })
    setScanning(true)

    const u1 = api.onNetScanHost((payload) => {
      setProgress({ done: payload.done, total: payload.total })
      setRows((prev) => {
        const prevRow = prev.find((x) => x.ip === payload.ip)
        const next = prev.filter((x) => x.ip !== payload.ip)
        const hostname =
          payload.hostname != null && payload.hostname !== ''
            ? payload.hostname
            : prevRow?.hostname
        const alive =
          typeof payload.alive === 'boolean' ? payload.alive : (prevRow?.alive ?? false)
        next.push({
          ip: payload.ip,
          alive,
          hostname,
        })
        return next.sort((a, b) => {
          const pa = a.ip.split('.').map(Number)
          const pb = b.ip.split('.').map(Number)
          for (let i = 0; i < 4; i++) {
            if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0)
          }
          return 0
        })
      })
    })
    const u2 = api.onNetScanDone?.(() => {
      setScanning(false)
      clearListeners()
      toast.success('Scan finished')
    })
    const u3 = api.onNetScanError?.((e) => {
      setScanning(false)
      clearListeners()
      toast.error(e.message)
    })
    unsubRef.current = [u1, u2, u3].filter(Boolean) as (() => void)[]

    let payload: NetScanStartPayload
    if (scanMode === 'cidr') {
      payload = { mode: 'cidr', cidr: cidr.trim(), concurrency: conc }
    } else if (scanMode === 'range') {
      payload = {
        mode: 'range',
        start: rangeStart.trim(),
        end: rangeEnd.trim(),
        concurrency: conc,
      }
    } else {
      payload = { mode: 'allSubnets', concurrency: conc }
    }

    const r = await api.netScanStart(payload)
    if (!r.ok) {
      setScanning(false)
      clearListeners()
      toast.error('error' in r ? r.error : 'Failed to start')
      return
    }
    setProgress({ done: 0, total: r.total })
  }, [api, cidr, concurrency, clearListeners, rangeEnd, rangeStart, scanMode])

  const aliveRows = rows.filter((x) => x.alive)
  const displayRows = aliveOnly ? aliveRows : rows

  const copyAlive = useCallback(async () => {
    const text = aliveRows.map((r) => r.ip).join('\n')
    if (!text) {
      toast.message('No alive hosts yet')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Copied IPs')
    } catch {
      toast.error('Clipboard failed')
    }
  }, [aliveRows])

  const udp = useUdpDiscovery(setHost)
  const readers = useReaderDiscovery(cidr)
  const [lanMode, setLanMode] = useState<'pingScan' | 'udpDiscovery' | 'readerDiscovery'>('readerDiscovery')

  if (!hasApi) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6" data-tour="tour-netscan-root">
        <Monitor className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">LAN scan</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Network scanning runs in the desktop Electron app (ICMP ping). Use a packaged or dev desktop build.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-tour="tour-netscan-root">
      <Tabs value={lanMode} onValueChange={(v) => setLanMode(v as typeof lanMode)} className="flex h-full min-h-0 flex-col">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 h-auto p-1 shrink-0">
          <TabsTrigger value="udpDiscovery" className="text-xs gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            Edge Discovery (UDP)
          </TabsTrigger>
          <TabsTrigger value="readerDiscovery" className="text-xs gap-1.5">
            <Search className="w-3.5 h-3.5" />
            RFID Readers
          </TabsTrigger>
          <TabsTrigger value="pingScan" className="text-xs gap-1.5">
            <Radar className="w-3.5 h-3.5" />
            Ping Scan
          </TabsTrigger>
        </TabsList>

        {/* ── UDP Edge Discovery ── */}
        <TabsContent value="udpDiscovery" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
          <div className="rounded-xl border border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Edge Device Discovery</h2>
                <p className="text-xs text-muted-foreground max-w-3xl">
                  Listen for heartbeat broadcasts from Edge devices over UDP, then quickly set a discovered host.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 shrink-0">
            <div className="space-y-1.5 w-28">
              <Label className="text-xs text-muted-foreground">Local port</Label>
              <Input
                value={udp.localPort}
                onChange={(e) => udp.setLocalPort(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-sm h-9"
                placeholder="7000"
                disabled={udp.listening}
              />
            </div>
            <div className="space-y-1.5 w-28">
              <Label className="text-xs text-muted-foreground">Duration (s)</Label>
              <Input
                value={udp.duration}
                onChange={(e) => udp.setDuration(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-sm h-9"
                placeholder="60"
                disabled={udp.listening}
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-9"
              disabled={udp.listening}
              onClick={() => void udp.startDiscovery()}
            >
              <Play className="w-3.5 h-3.5" />
              Start listening
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9"
              disabled={!udp.listening}
              onClick={() => void udp.stopDiscovery()}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-9"
              disabled={udp.devices.length === 0 && udp.rawMessages.length === 0}
              onClick={udp.clearDevices}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>

          {/* Send probe */}
          <div className="flex flex-wrap items-end gap-3 shrink-0 rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="space-y-1.5 flex-1 min-w-[140px] max-w-[200px]">
              <Label className="text-xs text-muted-foreground">Target IP (or broadcast)</Label>
              <Input
                value={udp.probeIp}
                onChange={(e) => udp.setProbeIp(e.target.value)}
                className="font-mono text-sm h-9"
                placeholder="255.255.255.255"
                disabled={!udp.listening}
              />
            </div>
            <div className="space-y-1.5 w-24">
              <Label className="text-xs text-muted-foreground">Remote port</Label>
              <Input
                value={udp.remotePort}
                onChange={(e) => udp.setRemotePort(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-sm h-9"
                placeholder="23"
                disabled={!udp.listening}
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Probe message (optional)</Label>
              <Input
                value={udp.probeMessage}
                onChange={(e) => udp.setProbeMessage(e.target.value)}
                className="font-mono text-sm h-9"
                placeholder="discovery payload…"
                disabled={!udp.listening}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 h-9"
              disabled={!udp.listening}
              onClick={() => void udp.sendProbe()}
            >
              <Send className="w-3.5 h-3.5" />
              Send probe
            </Button>
          </div>

          {udp.listening && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>Listening on UDP port <span className="font-mono text-foreground">{udp.localPort}</span>…</span>
              <span className="text-emerald-600 font-medium">{udp.devices.length}</span> device(s) found
            </div>
          )}

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground">
              <span className="text-emerald-600 font-medium">{udp.devices.length}</span> device(s)
              {udp.rawMessages.length > 0 && (
                <> &middot; {udp.rawMessages.length} raw message(s)</>
              )}
            </span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={udp.showRaw}
                onChange={(e) => udp.setShowRaw(e.target.checked)}
                className="rounded border-border/50 accent-primary w-3.5 h-3.5"
              />
              Show raw data
            </label>
          </div>

          {/* Discovered devices table */}
          <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-background/40 overflow-hidden">
            <ScrollArea className="h-[min(100%,calc(100vh-420px))] max-h-[calc(100vh-380px)]">
              {!udp.showRaw ? (
                <div className="min-w-[600px]">
                  <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="w-36">IP Address</div>
                    <div className="w-14">Port</div>
                    <div className="w-36">MAC Address</div>
                    <div className="w-24">Version</div>
                    <div className="flex-1">GUID</div>
                    <div className="w-20 text-right pr-2">Action</div>
                  </div>
                  {udp.devices.length === 0 && !udp.listening && (
                    <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                      Start listening to discover edge devices on the network.
                    </p>
                  )}
                  {udp.devices.length === 0 && udp.listening && (
                    <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                      Waiting for heartbeat broadcasts…
                    </p>
                  )}
                  {udp.devices.map((d) => (
                    <div
                      key={d.mac || d.ip}
                      className="flex items-center gap-2 px-3 py-2 border-b border-border/20 font-mono text-sm bg-emerald-500/5"
                    >
                      <div className="w-36 truncate">{d.ip}</div>
                      <div className="w-14 truncate">{d.port || '—'}</div>
                      <div className="w-36 truncate text-xs">{d.mac || '—'}</div>
                      <div className="w-24 truncate text-xs">{d.version || '—'}</div>
                      <div className="flex-1 truncate text-xs text-muted-foreground">{d.guid || '—'}</div>
                      <div className="w-20 flex justify-end pr-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setHost(d.ip)
                            toast.success(`Host set to ${d.ip}`)
                          }}
                        >
                          Use
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 space-y-2 font-mono text-xs">
                  {udp.rawMessages.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No raw messages yet.</p>
                  )}
                  {udp.rawMessages.map((m, i) => (
                    <div key={i} className="rounded-lg border border-border/30 bg-muted/20 p-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{m.from}:{m.fromPort}</span>
                        <span>&middot;</span>
                        <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-all text-[11px] text-foreground/80 max-h-40 overflow-auto">
                        {m.data}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ── RFID Readers Discovery ── */}
        <TabsContent value="readerDiscovery" className="flex-1 min-h-0 flex flex-col gap-4 mt-3">
          <div className="rounded-xl border border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">RFID Reader Discovery</h2>
                <p className="text-xs text-muted-foreground max-w-3xl">
                  Vendor-aware scan for <span className="font-semibold text-foreground">Impinj</span> and{' '}
                  <span className="font-semibold text-foreground">SEUIC</span>. Uses a practical fingerprint approach:
                  LLRP ports (5084/5085) plus HTTP/HTTPS title/server keyword checks.
                </p>
              </div>
            </div>
          </div>

          <Tabs value={readers.mode} onValueChange={(v) => readers.setMode(v as ReaderMode)} className="w-full shrink-0">
            <TabsList className="grid w-full max-w-xl grid-cols-3 h-auto p-1">
              <TabsTrigger value="cidr" className="text-xs">CIDR</TabsTrigger>
              <TabsTrigger value="range" className="text-xs">IP range</TabsTrigger>
              <TabsTrigger value="allSubnets" className="text-xs">All subnets</TabsTrigger>
            </TabsList>
            <TabsContent value="cidr" className="mt-3 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Network (CIDR)</Label>
              <Input
                value={readers.cidr}
                onChange={(e) => readers.setCidr(e.target.value)}
                className="font-mono text-sm h-9 max-w-md"
                placeholder="192.168.1.0/24"
                disabled={readers.scanning}
              />
            </TabsContent>
            <TabsContent value="range" className="mt-3 space-y-2">
              <div className="flex flex-wrap items-end gap-3 max-w-2xl">
                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">Start IP</Label>
                  <Input
                    value={readers.startIp}
                    onChange={(e) => readers.setStartIp(e.target.value)}
                    className="font-mono text-sm h-9"
                    placeholder="192.168.1.1"
                    disabled={readers.scanning}
                  />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">End IP</Label>
                  <Input
                    value={readers.endIp}
                    onChange={(e) => readers.setEndIp(e.target.value)}
                    className="font-mono text-sm h-9"
                    placeholder="192.168.1.254"
                    disabled={readers.scanning}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="allSubnets" className="mt-3">
              <p className="text-xs text-muted-foreground max-w-xl">
                Scan every detected local IPv4 subnet and identify probable reader vendors by service fingerprints.
              </p>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-end gap-3 shrink-0">
            <div className="space-y-1.5 w-24">
              <Label className="text-xs text-muted-foreground">Parallel</Label>
              <Input
                value={readers.concurrency}
                onChange={(e) => readers.setConcurrency(e.target.value.replace(/\D/g, '') || '48')}
                className="font-mono text-sm h-9"
                disabled={readers.scanning}
              />
            </div>
            <div className="space-y-1.5 w-28">
              <Label className="text-xs text-muted-foreground">Timeout (ms)</Label>
              <Input
                value={readers.timeoutMs}
                onChange={(e) => readers.setTimeoutMs(e.target.value.replace(/\D/g, '') || '1200')}
                className="font-mono text-sm h-9"
                disabled={readers.scanning}
              />
            </div>
            <Button size="sm" className="gap-1.5 h-9" disabled={readers.scanning} onClick={() => void readers.start()}>
              <Search className="w-3.5 h-3.5" />
              Start discovery
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled={!readers.scanning} onClick={() => void readers.stop()}>
              <Square className="w-3.5 h-3.5" />
              Stop
            </Button>
            <Button variant="ghost" size="sm" className="h-9" disabled={readers.results.length === 0} onClick={readers.clear}>
              Clear results
            </Button>
          </div>

          {readers.progress.total > 0 && (
            <div className="space-y-1 shrink-0">
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span className="flex items-center gap-1">
                  {readers.scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-emerald-600" />}
                  Reader scan
                </span>
                <span>
                  {readers.progress.done} / {readers.progress.total} &middot; found {readers.progress.found}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${Math.min(100, Math.round((100 * readers.progress.done) / readers.progress.total))}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-background/40 overflow-hidden">
            <ScrollArea className="h-[min(100%,calc(100vh-360px))] max-h-[calc(100vh-320px)]">
              <div className="min-w-[760px]">
                <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <div className="w-36">IP</div>
                  <div className="w-20">Vendor</div>
                  <div className="w-24">Confidence</div>
                  <div className="w-28">Open ports</div>
                  <div className="w-40">Service hint</div>
                  <div className="flex-1">Reason</div>
                  <div className="w-24 text-right pr-2">Action</div>
                </div>
                {readers.results.length === 0 && !readers.scanning && (
                  <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                    Run reader discovery to detect Impinj/SEUIC readers on your LAN.
                  </p>
                )}
                {readers.results.map((r) => (
                  <div
                    key={r.ip}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 border-b border-border/20 font-mono text-sm',
                      r.vendor === 'impinj' ? 'bg-blue-500/5' : r.vendor === 'seuic' ? 'bg-amber-500/5' : 'bg-emerald-500/5',
                    )}
                  >
                    <div className="w-36 truncate">{r.ip}</div>
                    <div className="w-20 text-xs uppercase">{r.vendor}</div>
                    <div className="w-24 text-xs">{r.confidence}</div>
                    <div className="w-28 text-xs">{r.openPorts.join(', ') || '—'}</div>
                    <div className="w-40 text-xs truncate">{r.title || r.server || r.url || '—'}</div>
                    <div className="flex-1 text-xs text-muted-foreground truncate">{r.reason}</div>
                    <div className="w-24 flex justify-end pr-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => {
                          setHost(r.ip)
                          toast.success(`Host set to ${r.ip}`)
                        }}
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ── Ping Scan (existing) ── */}
        <TabsContent value="pingScan" className="flex-1 min-h-0 flex flex-col gap-4 mt-3">
      <div className="rounded-xl border border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5 p-4 shrink-0">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
            <Radar className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">LAN scan</h2>
            <p className="text-xs text-muted-foreground max-w-3xl">
              Ping sweep by CIDR, start-end IP range (Angry IP Scanner style), or all detected local IPv4 subnets.
              Uses OS <code className="text-[10px]">ping</code>; hosts that block ICMP may appear offline. Max 4094
              addresses per run.
            </p>
          </div>
        </div>
      </div>

      {ifaces.length > 0 && (
        <div className="space-y-1.5 shrink-0">
          <Label className="text-xs text-muted-foreground">
            Your subnets (tap to set CIDR or host range; ignored in “All subnets” mode)
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {ifaces.map((i) => {
              const bounds = cidrHostBounds(i.networkCidr)
              const rangeMatch =
                bounds != null &&
                rangeStart.trim() === bounds.start &&
                rangeEnd.trim() === bounds.end
              const chipActive =
                scanMode === 'cidr'
                  ? cidr === i.networkCidr
                  : scanMode === 'range'
                    ? rangeMatch
                    : false
              return (
                <Button
                  key={`${i.name}-${i.address}`}
                  type="button"
                  variant={chipActive ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-8 font-mono text-[11px]"
                  disabled={scanning || scanMode === 'allSubnets'}
                  onClick={() => {
                    if (scanMode === 'cidr') setCidr(i.networkCidr)
                    else if (scanMode === 'range' && bounds) {
                      setRangeStart(bounds.start)
                      setRangeEnd(bounds.end)
                    }
                  }}
                >
                  {i.name}: {i.networkCidr}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      <Tabs
        value={scanMode}
        onValueChange={(v) => setScanMode(v as ScanMode)}
        className="w-full shrink-0"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3 h-auto p-1">
          <TabsTrigger value="cidr" className="text-xs">
            CIDR
          </TabsTrigger>
          <TabsTrigger value="range" className="text-xs">
            IP range
          </TabsTrigger>
          <TabsTrigger value="allSubnets" className="text-xs">
            All subnets
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cidr" className="mt-3 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Network (CIDR)</Label>
          <Input
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            className="font-mono text-sm h-9 max-w-md"
            placeholder="192.168.1.0/24"
            disabled={scanning}
          />
        </TabsContent>
        <TabsContent value="range" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Inclusive IPv4 range (order does not matter), Angry IP–style.
          </p>
          <div className="flex flex-wrap items-end gap-3 max-w-2xl">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">Start IP</Label>
              <Input
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="font-mono text-sm h-9"
                placeholder="192.168.1.1"
                disabled={scanning}
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground">End IP</Label>
              <Input
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="font-mono text-sm h-9"
                placeholder="192.168.1.254"
                disabled={scanning}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="allSubnets" className="mt-3 space-y-1.5">
          <p className="text-xs text-muted-foreground max-w-xl">
            Merges every non-loopback IPv4 interface subnet into one deduplicated list. Fails if the combined set is
            empty or larger than 4094 addresses—use CIDR or a smaller range in that case.
          </p>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="space-y-1.5 w-24">
          <Label className="text-xs text-muted-foreground">Parallel</Label>
          <Input
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value.replace(/\D/g, '') || '40')}
            className="font-mono text-sm h-9"
            disabled={scanning}
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-9"
          disabled={scanning}
          onClick={() => void startScan()}
        >
          <Play className="w-3.5 h-3.5" />
          Start scan
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9"
          disabled={!scanning}
          onClick={() => void stopScan()}
        >
          <Square className="w-3.5 h-3.5" />
          Stop
        </Button>
        <Button variant="secondary" size="sm" className="h-9" onClick={() => void loadInterfaces()}>
          Refresh interfaces
        </Button>
      </div>

      {scanning && progress.total > 0 && (
        <div className="space-y-1 shrink-0">
          <div className="flex justify-between text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning…
            </span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${Math.min(100, Math.round((100 * progress.done) / progress.total))}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={aliveOnly}
            onChange={(e) => setAliveOnly(e.target.checked)}
            className="rounded border-border/50 accent-primary w-3.5 h-3.5"
          />
          Alive only
        </label>
        <span className="text-xs text-muted-foreground">
          <span className="text-emerald-600 font-medium">{aliveRows.length}</span> alive
          {rows.length > 0 && (
            <>
              {' '}
              / {rows.length} scanned
            </>
          )}
        </span>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void copyAlive()}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          Copy alive IPs
        </Button>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-border/50 bg-background/40 overflow-hidden">
        <ScrollArea className="h-[min(100%,calc(100vh-320px))] max-h-[calc(100vh-280px)]">
          <div className="min-w-[480px]">
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="w-36">IP</div>
              <div className="w-20">Status</div>
              <div className="flex-1">Hostname (PTR)</div>
              <div className="w-28 text-right pr-2">Reader host</div>
            </div>
            {displayRows.length === 0 && !scanning && (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">Run a scan to see results.</p>
            )}
            {displayRows.map((r) => (
              <div
                key={r.ip}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 border-b border-border/20 font-mono text-sm',
                  r.alive ? 'bg-emerald-500/5' : 'opacity-70',
                )}
              >
                <div className="w-36 truncate">{r.ip}</div>
                <div className="w-20">
                  {r.alive ? (
                    <span className="text-emerald-600 text-xs font-medium">Alive</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div className="flex-1 truncate text-xs text-muted-foreground">{r.hostname ?? '—'}</div>
                <div className="w-28 flex justify-end pr-2">
                  {r.alive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        setHost(r.ip)
                        toast.success(`Host set to ${r.ip}`)
                      }}
                    >
                      Use
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
        </TabsContent>
      </Tabs>

      {host && (
        <p className="text-xs text-muted-foreground shrink-0">
          Current reader host: <span className="font-mono text-foreground">{host}</span>
        </p>
      )}
    </div>
  )
}
