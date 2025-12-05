import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Send, ScanLine } from 'lucide-react'
import { OCRClient } from '@/lib/tcp-client'
import { formatTime } from '@/lib/utils'

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
    await sendOcrMessage(message, true)
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
    <div className="flex flex-col gap-4 h-full max-w-4xl mx-auto">
      {/* OCR Input Card */}
      <Card className="border-border/50 bg-card transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-pink-500 animate-pulse-slow" />
            OCR Message Sender
          </CardTitle>
          <CardDescription>
            Send OCR messages to {host || 'host'}:10482
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ocrMessage">Message</Label>
            <Input
              id="ocrMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter message to send"
              disabled={sending}
              className="text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              size="lg"
              className="w-full"
            >
              <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-spin' : ''}`} />
              {sending ? 'Sending...' : 'Send Message'}
            </Button>
            <Button
              onClick={handleInditexCode}
              disabled={sending}
              variant="outline"
              size="lg"
              className="w-full"
            >
              Inditex Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log Area */}
      <Card className="flex-1 min-h-0 border-border/50 bg-card transition-all duration-300">
        <CardHeader className="py-2 border-b border-border/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>OCR Log</span>
              {sending && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
                </span>
              )}
            </CardTitle>
            <Button
              onClick={() => setLog([])}
              variant="ghost"
              size="sm"
            >
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-5rem)] bg-muted/20">
          <ScrollArea className="h-full">
            <div className="font-mono text-sm space-y-1 p-2">
              {log.length === 0 && (
                <div className="text-muted-foreground italic text-center py-8 animate-pulse-slow">
                  No messages sent yet...
                </div>
              )}
              {log.map((line, i) => (
                <div key={i} className="text-muted-foreground hover:text-foreground transition-colors duration-150 py-0.5 px-2 rounded hover:bg-accent/30 animate-fade-in">
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

