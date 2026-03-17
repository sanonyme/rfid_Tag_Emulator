import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Wifi, WifiOff, X, Clock } from 'lucide-react'
import { TCPEmulatorClient } from '@/lib/tcp-client'
import { cn } from '@/lib/utils'
import { playConnect, playDisconnect } from '@/lib/sounds'

const RECENT_HOSTS_KEY = 'recent-hosts'
const MAX_RECENT = 8

function loadRecentHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_HOSTS_KEY) || '[]')
  } catch { return [] }
}

function saveRecentHosts(hosts: string[]) {
  localStorage.setItem(RECENT_HOSTS_KEY, JSON.stringify(hosts))
}

function pushRecentHost(host: string): string[] {
  const list = loadRecentHosts().filter((h) => h !== host)
  list.unshift(host)
  const trimmed = list.slice(0, MAX_RECENT)
  saveRecentHosts(trimmed)
  return trimmed
}

interface ConnectionStatusProps {
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  connected: boolean
  setConnected: (connected: boolean) => void
}

export function ConnectionStatus({
  emulator,
  host,
  setHost,
  connected,
  setConnected
}: ConnectionStatusProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localHost, setLocalHost] = useState(host)
  const [recentHosts, setRecentHosts] = useState<string[]>(loadRecentHosts)
  const timeoutRef = useRef<NodeJS.Timeout>()
  const FIXED_PORT = 12352

  useEffect(() => {
    setLocalHost(host)
  }, [host])

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

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 300)
  }

  return (
    <div className="relative inline-flex items-center">
        <div
            className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300",
                connected 
                    ? "bg-green-500/10 text-green-500 hover:bg-green-500/20" 
                    : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
                isOpen && "ring-2 ring-primary"
            )}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
        </div>

        {isOpen && (
            <div 
                className="absolute left-0 top-[calc(100%+8px)] w-[270px] p-4 bg-popover border border-border rounded-xl shadow-lg z-50 animate-in slide-in-from-top-2"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="space-y-3">
                    <div className="space-y-1">
                        <h4 className="font-medium leading-none">Connection</h4>
                        <p className="text-xs text-muted-foreground">
                            Port is fixed to {FIXED_PORT}.
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
                            className="h-8"
                        />
                    </div>

                    <div className="flex gap-2">
                        {!connected ? (
                            <Button size="sm" className="w-full" onClick={handleConnect}>
                                Connect
                            </Button>
                        ) : (
                            <Button size="sm" variant="destructive" className="w-full" onClick={handleDisconnect}>
                                Disconnect
                            </Button>
                        )}
                    </div>

                    {recentHosts.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-border">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Clock className="w-3 h-3" /> Recent
                            </p>
                            <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                                {recentHosts.map((h) => (
                                    <div
                                        key={h}
                                        className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent cursor-pointer transition-colors"
                                    >
                                        <button
                                            className="flex-1 text-left text-xs font-mono text-foreground truncate"
                                            onClick={() => connectTo(h)}
                                        >
                                            {h}
                                        </button>
                                        <button
                                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
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








