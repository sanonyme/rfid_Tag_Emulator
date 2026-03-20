import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Clock, Wifi, Globe, Link2 } from 'lucide-react'
import { TCPEmulatorClient } from '@/lib/tcp-client'
import { playConnect, playDisconnect } from '@/lib/sounds'

const RECENT_HOSTS_KEY = 'recent-hosts'
const MAX_RECENT = 8
const FIXED_PORT = 12352

function loadRecentHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_HOSTS_KEY) || '[]')
  } catch {
    return []
  }
}

function pushRecentHost(host: string): string[] {
  const list = loadRecentHosts().filter((h) => h !== host)
  list.unshift(host)
  const trimmed = list.slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_HOSTS_KEY, JSON.stringify(trimmed))
  return trimmed
}

interface MobileConnectionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  emulator: TCPEmulatorClient
  host: string
  setHost: (host: string) => void
  connected: boolean
  setConnected: (connected: boolean) => void
}

export function MobileConnectionSheet({
  open,
  onOpenChange,
  emulator,
  host,
  setHost,
  connected,
  setConnected,
}: MobileConnectionSheetProps) {
  const [localHost, setLocalHost] = useState(host)
  const [recentHosts, setRecentHosts] = useState<string[]>(loadRecentHosts)

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
        () => {
          setConnected(true)
          playConnect()
        },
        () => {
          setConnected(false)
          playDisconnect()
        }
      )
    } catch (err) {
      console.error(err)
      setConnected(false)
      playDisconnect()
    }
  }

  const handleConnect = () => connectTo(localHost)

  const handleDisconnect = async () => {
    await emulator.disconnect(() => {
      setConnected(false)
      playDisconnect()
    })
  }

  const removeRecentHost = (h: string) => {
    const updated = recentHosts.filter((x) => x !== h)
    localStorage.setItem(RECENT_HOSTS_KEY, JSON.stringify(updated))
    setRecentHosts(updated)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(400px,85vw)] rounded-2xl overflow-hidden border-border/80 shadow-xl shadow-black/20 backdrop-blur-xl bg-card/95 p-8 !px-12 !pb-10"
        onOpenAutoFocus={(e) => {
          // Prevent autofocus on the IP input (iOS would immediately open the keyboard).
          // User can tap the text field when they want the keyboard.
          e.preventDefault()
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none rounded-2xl" />
        <DialogHeader className="relative space-y-3 pb-1">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold tracking-tight">Connection</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Connect to RFID reader</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/80 text-xs font-mono text-muted-foreground w-fit">
            <Globe className="h-3.5 w-3.5" />
            Port {FIXED_PORT}
          </div>
        </DialogHeader>
        <div className="relative space-y-5 pt-1">
          <div className="space-y-2">
            <Label htmlFor="mobile-ip" className="text-sm font-medium text-foreground/90">
              IP Address
            </Label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                id="mobile-ip"
                value={localHost}
                onChange={(e) => setLocalHost(e.target.value)}
                placeholder="192.168.1.100"
                className="h-12 pl-10 text-base font-mono bg-background/60 border-border/80 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          </div>
          <div>
            {!connected ? (
              <Button
                className="w-full h-12 text-base font-medium gap-2 bg-primary hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md shadow-primary/20"
                onClick={handleConnect}
              >
                <Link2 className="h-4 w-4" />
                Connect
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="w-full h-12 text-base font-medium gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                onClick={handleDisconnect}
              >
                <X className="h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
          {recentHosts.length > 0 && (
            <div className="space-y-2.5 pt-4 border-t border-border/60">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" />
                Recent
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {recentHosts.map((h) => (
                  <div
                    key={h}
                    className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted border border-transparent hover:border-border/50 transition-all"
                  >
                    <button
                      className="flex-1 text-left text-sm font-mono truncate text-foreground/90 hover:text-foreground transition-colors"
                      onClick={() => connectTo(h)}
                    >
                      {h}
                    </button>
                    <button
                      className="p-1.5 rounded-lg opacity-50 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={() => removeRecentHost(h)}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
