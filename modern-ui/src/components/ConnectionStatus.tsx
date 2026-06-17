import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Wifi, WifiOff, X, Clock, Star } from 'lucide-react'
import { TCPEmulatorClient } from '@/lib/tcp-client'
import { cn } from '@/lib/utils'
import { playConnect, playDisconnect } from '@/lib/sounds'
import { useTourInteractionOptional } from '@/contexts/TourInteractionContext'

const RECENT_HOSTS_KEY = 'recent-hosts'
const PINNED_HOSTS_KEY = 'pinned-hosts'
const MAX_RECENT = 8

function loadRecentHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_HOSTS_KEY) || '[]')
  } catch { return [] }
}

function saveRecentHosts(hosts: string[]) {
  localStorage.setItem(RECENT_HOSTS_KEY, JSON.stringify(hosts))
}

function loadPinnedHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PINNED_HOSTS_KEY) || '[]')
  } catch { return [] }
}

function savePinnedHosts(hosts: string[]) {
  localStorage.setItem(PINNED_HOSTS_KEY, JSON.stringify(hosts))
}

function pushRecentHost(host: string): string[] {
  const list = loadRecentHosts().filter((h) => h !== host)
  list.unshift(host)
  const trimmed = list.slice(0, MAX_RECENT)
  saveRecentHosts(trimmed)
  return trimmed
}

const ALE_PORT_PRESETS = ['80', '8080'] as const

interface ConnectionStatusProps {
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  alePort: string
  setAlePort: (port: string) => void
  connected: boolean
  setConnected: (connected: boolean) => void
}

export function ConnectionStatus({
  emulator,
  host,
  setHost,
  alePort,
  setAlePort,
  connected,
  setConnected
}: ConnectionStatusProps) {
  const tourIx = useTourInteractionOptional()
  const [isOpen, setIsOpen] = useState(false)
  const [localHost, setLocalHost] = useState(host)
  const [localAlePort, setLocalAlePort] = useState(alePort)
  const [recentHosts, setRecentHosts] = useState<string[]>(loadRecentHosts)
  const [pinnedHosts, setPinnedHosts] = useState<string[]>(loadPinnedHosts)
  const timeoutRef = useRef<NodeJS.Timeout>()
  const FIXED_PORT = 12352

  const isPinned = (h: string) => pinnedHosts.includes(h)

  const togglePin = (h: string) => {
    const next = isPinned(h) ? pinnedHosts.filter((x) => x !== h) : [...pinnedHosts, h]
    savePinnedHosts(next)
    setPinnedHosts(next)
  }

  // Hide pinned entries from the recent list so they don't appear twice.
  const recentVisible = recentHosts.filter((h) => !pinnedHosts.includes(h))

  useEffect(() => {
    setLocalHost(host)
  }, [host])

  useEffect(() => {
    setLocalAlePort(alePort)
  }, [alePort])

  const commitAlePort = (value: string) => {
    const trimmed = value.replace(/\D/g, '').slice(0, 5)
    setLocalAlePort(trimmed)
    setAlePort(trimmed)
  }

  const connectTo = async (targetHost: string) => {
    if (!targetHost) return
    setLocalHost(targetHost)
    setHost(targetHost)
    setRecentHosts(pushRecentHost(targetHost))

    try {
      await emulator.connect(
        targetHost,
        FIXED_PORT,
        () => { setConnected(true); playConnect() },
        () => { setConnected(false); playDisconnect() }
      )
    } catch (err) {
      console.error(err)
      setConnected(false)
      playDisconnect()
    }
  }

  const handleConnect = () => connectTo(localHost)

  const handleDisconnect = async () => {
    await emulator.disconnect(() => { setConnected(false); playDisconnect() })
  }

  const removeRecentHost = (h: string) => {
    const updated = recentHosts.filter((x) => x !== h)
    saveRecentHosts(updated)
    setRecentHosts(updated)
  }

  const openPopover = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
    tourIx?.setConnectionPopoverOpen(true)
  }

  const closePopover = () => {
    setIsOpen(false)
    tourIx?.setConnectionPopoverOpen(false)
  }

  const handleMouseEnter = openPopover

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(closePopover, 300)
  }

  return (
    <div className="relative inline-flex items-center" data-tour="tour-connection">
        <button
            type="button"
            aria-label={connected ? 'Connected — manage connection' : 'Disconnected — manage connection'}
            aria-expanded={isOpen}
            className={cn(
                "smooth-press w-10 h-10 rounded-full flex items-center justify-center cursor-pointer outline-none transition-all duration-300 ring-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                connected
                    ? "bg-success/10 text-success ring-success/20 hover:bg-success/20 focus-visible:ring-success"
                    : "bg-destructive/10 text-destructive ring-destructive/20 hover:bg-destructive/20 focus-visible:ring-destructive"
            )}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={() => (isOpen ? closePopover() : openPopover())}
            onKeyDown={(e) => { if (e.key === 'Escape') closePopover() }}
        >
            <span key={connected ? 'on' : 'off'} className="animate-scale-in inline-flex">
                {connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </span>
        </button>

        {isOpen && (
            <div 
                className="absolute left-0 top-[calc(100%+8px)] w-[270px] p-4 bg-popover border border-border/60 rounded-xl shadow-elev-lg z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="space-y-3">
                    <div className="space-y-1">
                        <h4 className="font-medium leading-none">Connection</h4>
                        <p className="text-xs text-muted-foreground">
                            Edge host for tag emulation and ALE API.
                        </p>
                    </div>
                    
                    <div className="space-y-1.5">
                        <Label htmlFor="ip-address" className="text-xs">IP Address</Label>
                        <Input
                            id="ip-address"
                            value={localHost}
                            onChange={(e) => setLocalHost(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConnect() }}
                            placeholder="192.168.1.100"
                            className="h-8 font-mono text-sm"
                        />
                        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/25 px-2.5 py-1.5">
                            <Label
                                htmlFor="ale-port"
                                className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                                ALE
                            </Label>
                            <Input
                                id="ale-port"
                                type="text"
                                inputMode="numeric"
                                value={localAlePort}
                                onChange={(e) => commitAlePort(e.target.value)}
                                placeholder="80"
                                className="h-6 w-11 shrink-0 border-0 bg-transparent px-0 text-center text-xs font-mono shadow-none focus-visible:ring-0"
                                title="Port for ALE API (often 80 or 8080)"
                            />
                            <div className="ml-auto flex gap-0.5">
                                {ALE_PORT_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        className={cn(
                                            'rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums transition-colors',
                                            localAlePort === preset
                                                ? 'bg-primary/15 text-primary'
                                                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                                        )}
                                        onClick={() => commitAlePort(preset)}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {!connected ? (
                            <Button ripple size="sm" className="w-full" onClick={handleConnect}>
                                Connect
                            </Button>
                        ) : (
                            <Button ripple size="sm" variant="destructive" className="w-full" onClick={handleDisconnect}>
                                Disconnect
                            </Button>
                        )}
                    </div>

                    {pinnedHosts.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-border">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Star className="w-3 h-3 fill-current" /> Pinned
                            </p>
                            <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                                {pinnedHosts.map((h) => (
                                    <div
                                        key={h}
                                        className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <button
                                            className="rounded text-amber-500 outline-none transition-colors hover:text-amber-600 focus-visible:ring-2 focus-visible:ring-ring/40"
                                            onClick={(e) => { e.stopPropagation(); togglePin(h) }}
                                            title="Unpin"
                                        >
                                            <Star className="w-3 h-3 fill-current" />
                                        </button>
                                        <button
                                            className="flex-1 rounded text-left text-xs font-mono text-foreground truncate outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                            onClick={() => connectTo(h)}
                                        >
                                            {h}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {recentVisible.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-border">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Clock className="w-3 h-3" /> Recent
                            </p>
                            <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                                {recentVisible.map((h) => (
                                    <div
                                        key={h}
                                        className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <button
                                            className="rounded opacity-40 outline-none transition-colors hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40"
                                            onClick={(e) => { e.stopPropagation(); togglePin(h) }}
                                            title="Pin to keep at top"
                                        >
                                            <Star className="w-3 h-3" />
                                        </button>
                                        <button
                                            className="flex-1 rounded text-left text-xs font-mono text-foreground truncate outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                            onClick={() => connectTo(h)}
                                        >
                                            {h}
                                        </button>
                                        <button
                                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded outline-none hover:bg-destructive/10 hover:text-destructive transition-all focus-visible:ring-2 focus-visible:ring-ring/40"
                                            onClick={(e) => { e.stopPropagation(); removeRecentHost(h) }}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  )
}








