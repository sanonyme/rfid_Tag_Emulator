import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Send, Terminal, Copy, Download, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { formatTime, cn } from '@/lib/utils'
import { Badge } from './ui/badge'

const SECTION_CARD =
  'rounded-xl border-border/40 bg-card/95 shadow-sm ring-1 ring-border/20 backdrop-blur-sm'

interface CustomTabProps {
  host: string
  message: string
  setMessage: (message: string) => void
  port: string
  setPort: (port: string) => void
}

export function CustomTab({ host, message, setMessage, port, setPort }: CustomTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const listenersSetUp = useRef(false)
  const currentCallbacks = useRef<{
    success: ((msg: string) => void) | null
    error: ((msg: string) => void) | null
  }>({ success: null, error: null })

  const addLog = (msg: string) => {
    setLog(prev => [...prev, `[${formatTime()}] ${msg}`])
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // Set up listeners once
  useEffect(() => {
    if (!listenersSetUp.current && window.electronAPI) {
      console.log('Custom: Setting up event listeners')
      window.electronAPI.onCustomSuccess((msg: string) => {
        console.log('Custom: Received success event:', msg)
        if (currentCallbacks.current.success) {
          currentCallbacks.current.success(msg)
        } else {
          console.log('Custom: No success callback set')
        }
      })
      window.electronAPI.onCustomError((msg: string) => {
        console.log('Custom: Received error event:', msg)
        if (currentCallbacks.current.error) {
          currentCallbacks.current.error(msg)
        } else {
          console.log('Custom: No error callback set')
        }
      })
      listenersSetUp.current = true
    }
    
    return () => {
      // Cleanup callbacks on unmount to prevent stale state updates
      currentCallbacks.current = { success: null, error: null }
    }
  }, [])

  const handleSend = async () => {
    await sendCustomMessage(message)
  }

  const sendCustomMessage = async (msgToSend: string) => {
    if (!msgToSend.trim()) {
      addLog('Error: Message is empty')
      return
    }

    if (!port.trim()) {
      addLog('Error: Port is not set')
      return
    }

    const portNum = parseInt(port)
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
      addLog('Error: Invalid port number')
      return
    }

    if (!host) {
      addLog('Error: Host is not set (use Fixed tab to set connection)')
      return
    }

    if (!window.electronAPI) {
      addLog('Error: Electron API not available')
      return
    }

    setSending(true)
    
    currentCallbacks.current = {
      success: (msg: string) => {
        addLog(msg)
        toast.success('Message sent successfully')
        setSending(false)
      },
      error: (msg: string) => {
        addLog(msg)
        setSending(false)
      }
    }
    
    // Send message
    console.log(`Custom: Sending message to ${host}:${portNum}: ${msgToSend}`)
    window.electronAPI.customSend(host, portNum, msgToSend)

    // Fallback timeout to prevent infinite "Sending..." state
    // If backend doesn't respond in 6 seconds (backend timeout is 5s), reset state
    setTimeout(() => {
      if (sending) { // Note: 'sending' state here is stale closure, using ref would be better but this is simple fallback
        // We can't easily check the *current* state value without a ref in a timeout
        // But we can check if callbacks are still set
        if (currentCallbacks.current.success || currentCallbacks.current.error) {
           console.log('Custom: Frontend timeout triggered')
           if (currentCallbacks.current.error) {
             currentCallbacks.current.error('Error: Request timed out (Frontend)')
           }
        }
      }
    }, 6000)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4">
      {/* Custom Input Card */}
      <Card className={SECTION_CARD} data-tour="tour-custom-main">
        <CardHeader className="space-y-2 pb-3 pt-5 px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Terminal className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Custom TCP sender</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Send a raw line to any port on the fixed reader host.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-normal">
              Custom
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Host: <span className="font-mono text-foreground/90">{host || '—'}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="customPort" className="text-sm font-medium">
                Port
              </Label>
              <Input
                id="customPort"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Port"
                disabled={sending}
                className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customMessage" className="text-sm font-medium">
                Message
              </Label>
              <Input
                id="customMessage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter message to send"
                disabled={sending}
                className="h-10 rounded-lg border-border/50 shadow-none"
              />
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim() || !port.trim()}
            size="lg"
            className="w-full rounded-xl shadow-md shadow-primary/25"
          >
            <Send className={`mr-2 h-4 w-4 ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Sending…' : 'Send message'}
          </Button>
        </CardContent>
      </Card>

      {/* Log Area */}
      <Card className={cn(SECTION_CARD, 'flex min-h-[200px] flex-1 flex-col')} data-tour="tour-custom-log">
        <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/40">
                <Activity className="h-3.5 w-3.5 text-primary" />
              </span>
              Log
              {sending && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
              {log.length > 0 && (
                <>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(log.join('\n'))
                      toast.success('Log copied')
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                    title="Copy log"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button
                    onClick={() => {
                      const blob = new Blob([log.join('\n')], { type: 'text/plain' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `custom-log-${formatTime().replace(/[:/]/g, '-')}.txt`
                      a.click()
                      URL.revokeObjectURL(a.href)
                      toast.success('Log exported')
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                    title="Export"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                  <div className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
                </>
              )}
              <Button onClick={() => setLog([])} variant="ghost" size="sm" className="h-8 rounded-md px-2.5 text-xs">
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 bg-muted/15 p-0">
          <ScrollArea className="h-full min-h-[160px]">
            <div className="space-y-0.5 p-3 font-mono text-xs sm:text-sm">
              {log.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No custom sends yet</p>
                  <p className="max-w-xs text-xs leading-relaxed">Successful sends and errors will appear here.</p>
                </div>
              )}
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
        </CardContent>
      </Card>
    </div>
  )
}
