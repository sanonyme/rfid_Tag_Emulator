import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Wifi, WifiOff } from 'lucide-react'
import { TCPEmulatorClient } from '@/lib/tcp-client'
import { cn } from '@/lib/utils'

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
  const timeoutRef = useRef<NodeJS.Timeout>()
  const FIXED_PORT = 12352

  // Sync local host state with prop
  useEffect(() => {
    setLocalHost(host)
  }, [host])

  const handleConnect = async () => {
    if (!localHost) return
    setHost(localHost)
    
    try {
      await emulator.connect(
        localHost,
        FIXED_PORT,
        () => setConnected(true),
        () => setConnected(false)
      )
    } catch (err) {
      console.error(err)
      setConnected(false)
    }
  }

  const handleDisconnect = async () => {
    await emulator.disconnect(() => setConnected(false))
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 300) // Small delay to allow moving to the popover content
  }

  return (
    <div className="relative inline-flex items-center">
        {/* Trigger Button */}
        <div
            className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-300",
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

        {/* Hover Popover */}
        {isOpen && (
            <div 
                className="absolute left-0 top-[calc(100%+8px)] w-[250px] p-4 bg-popover border border-border rounded-xl shadow-lg z-50 animate-in slide-in-from-top-2"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Connection</h4>
                        <p className="text-sm text-muted-foreground">
                            Enter IP address to connect. Port is fixed to {FIXED_PORT}.
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="ip-address">IP Address</Label>
                        <Input
                            id="ip-address"
                            value={localHost}
                            onChange={(e) => setLocalHost(e.target.value)}
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
                </div>
            </div>
        )}
    </div>
  )
}






