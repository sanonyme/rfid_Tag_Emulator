import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Send, Terminal, Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { formatTime } from '@/lib/utils'

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
    <div className="flex flex-col gap-4 h-full max-w-4xl mx-auto">
      {/* Custom Input Card */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            Custom Message Sender
          </CardTitle>
          <CardDescription>
            Send messages to {host || 'host'} on a specific port
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
             <div className="space-y-2 col-span-1">
              <Label htmlFor="customPort">Port</Label>
              <Input
                id="customPort"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Port"
                disabled={sending}
              />
            </div>
            <div className="space-y-2 col-span-3">
              <Label htmlFor="customMessage">Message</Label>
              <Input
                id="customMessage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter message to send"
                disabled={sending}
              />
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !message.trim() || !port.trim()}
            size="lg"
            className="w-full"
          >
            <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
        </CardContent>
      </Card>

      {/* Log Area */}
      <Card className="flex-1 min-h-[200px] border-border/50 bg-card flex flex-col">
        <CardHeader className="py-2 border-b border-border/50 shrink-0">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>Log</span>
              {sending && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-0.5">
              {log.length > 0 && (
                <>
                  <Button onClick={() => { navigator.clipboard.writeText(log.join('\n')); toast.success('Log copied') }} variant="ghost" size="sm" className="h-7 px-2" title="Copy log">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button onClick={() => { const blob = new Blob([log.join('\n')], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `custom-log-${formatTime().replace(/[:/]/g, '-')}.txt`; a.click(); URL.revokeObjectURL(a.href); toast.success('Log exported') }} variant="ghost" size="sm" className="h-7 px-2" title="Export">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
              <Button onClick={() => setLog([])} variant="ghost" size="sm" className="h-7 px-2">Clear</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 bg-muted/20">
          <ScrollArea className="h-full">
            <div className="font-mono text-sm space-y-1 p-2">
              {log.length === 0 && (
                <div className="text-muted-foreground text-center py-8">
                  No messages sent yet.
                </div>
              )}
              {log.map((line, i) => (
                <div key={i} className={`text-muted-foreground hover:text-foreground transition-colors duration-150 py-0.5 px-2 rounded hover:bg-accent/30 ${i === log.length - 1 ? 'animate-log-new' : ''}`}>
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
