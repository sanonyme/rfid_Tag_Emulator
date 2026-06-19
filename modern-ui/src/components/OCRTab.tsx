import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Send, ScanLine, Copy, Download, Activity } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { toast } from 'sonner'
import { OCRClient } from '@/lib/tcp-client'
import { formatTime, cn } from '@/lib/utils'
import { Badge } from './ui/badge'
import { sectionCard as SECTION_CARD } from '@/lib/ui-tokens'

interface OCRTabProps {
  host: string
  connected: boolean  // Keep for future use
  ocrClient: OCRClient  // Keep for future use
  message: string
  setMessage: (message: string) => void
}

export function OCRTab({ host, connected: _connected, ocrClient: _ocrClient, message, setMessage }: OCRTabProps) {
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
      console.log('OCR: Setting up event listeners')
      window.electronAPI.onOcrSuccess((msg: string) => {
        console.log('OCR: Received success event:', msg)
        if (currentCallbacks.current.success) {
          currentCallbacks.current.success(msg)
        } else {
          console.log('OCR: No success callback set')
        }
      })
      window.electronAPI.onOcrError((msg: string) => {
        console.log('OCR: Received error event:', msg)
        if (currentCallbacks.current.error) {
          currentCallbacks.current.error(msg)
        } else {
          console.log('OCR: No error callback set')
        }
      })
      listenersSetUp.current = true
    }
  }, [])

  const handleSend = async () => {
    // Pass false to not clear the input after sending
    await sendOcrMessage(message, false) // to sustain the OCR input 
  }

  const sendOcrMessage = async (msgToSend: string, clearInput: boolean = false) => {
    if (!msgToSend.trim()) {
      addLog('Error: Message is empty')
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
    
    // Set callbacks for this send (no timeout - Java doesn't have one)
    currentCallbacks.current = {
      success: (msg: string) => {
        addLog(msg)
        toast.success('Message sent successfully')
        if (clearInput) {
          setMessage('')
        }
        setSending(false)
      },
      error: (msg: string) => {
        addLog(msg)
        setSending(false)
      }
    }
    
    // Send message
    console.log('OCR: Sending message to', host, ':', msgToSend)
    window.electronAPI.ocrSend(host, msgToSend)
  }

  const handleInditexCode = () => {
    const code = '{"00":1,"01":1,"02":"2/2","03":1,"04":1224,"05":490,"06":102,"07":36,"08":"S2024","09":3,"10":3,"11":1,"12":835906,"13":"28937-P/2","14":10079,"15":150,"16":0,"17":317,"18":282537599,"19":0,"20":39} $0A'
    setMessage(code)
    sendOcrMessage(code, false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="stagger-children mx-auto flex h-full max-w-4xl flex-col gap-4">
      {/* OCR Input Card */}
      <Card className={SECTION_CARD} data-tour="tour-ocr-main">
        <CardHeader className="space-y-3 pb-3 pt-5 px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                <ScanLine className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">OCR message sender</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Delivers payloads to the Edge OCR channel on the fixed reader host.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-normal">
              :10482
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Target: <span className="font-mono text-foreground/90">{host || '—'}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 pt-0">
          <div className="space-y-2">
            <Label htmlFor="ocrMessage" className="text-sm font-medium">
              Message
            </Label>
            <Input
              id="ocrMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter message to send"
              disabled={sending}
              className="h-10 rounded-lg border-border/50 text-base shadow-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              size="lg"
              className="w-full rounded-xl shadow-md shadow-primary/25"
            >
              <Send className={`mr-2 h-4 w-4 ${sending ? 'animate-spin' : ''}`} />
              {sending ? 'Sending…' : 'Send message'}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleInditexCode}
                  disabled={sending}
                  variant="outline"
                  size="lg"
                  className="w-full rounded-xl border-border/60 bg-muted/20 shadow-none hover:bg-muted/40"
                >
                  Inditex sample
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Sends a sample Inditex OCR JSON payload
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      {/* Log Area */}
      <Card className={cn(SECTION_CARD, 'flex min-h-[200px] flex-1 flex-col')} data-tour="tour-ocr-log">
        <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 ring-1 ring-amber-500/20">
                <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </span>
              OCR log
              {sending && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
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
                      a.download = `ocr-log-${formatTime().replace(/[:/]/g, '-')}.txt`
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                    <ScanLine className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No OCR traffic yet</p>
                  <p className="max-w-xs text-xs leading-relaxed">Send a message to see responses and errors here.</p>
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

