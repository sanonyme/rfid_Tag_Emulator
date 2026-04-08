import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Radar, Play, Square, Monitor, Loader2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { NetScanStartPayload } from '../types/electron'

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
    <div className="flex h-full min-h-0 flex-col gap-4" data-tour="tour-netscan-root">
      <div className="flex flex-wrap items-start gap-4 shrink-0">
        <div className="flex items-center gap-2 text-primary">
          <Radar className="w-8 h-8" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">LAN scan</h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Ping sweep by CIDR, by start–end IP (like Angry IP Scanner), or across all detected local IPv4 subnets.
              Uses the OS <code className="text-[10px]">ping</code> command. Hosts that block ICMP may appear offline.
              Max 4094 addresses per run.
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
      {host && (
        <p className="text-xs text-muted-foreground shrink-0">
          Current reader host: <span className="font-mono text-foreground">{host}</span>
        </p>
      )}
    </div>
  )
}
