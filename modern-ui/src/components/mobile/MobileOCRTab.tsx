import { useState, useRef, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Send, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { formatTime } from '@/lib/utils'

interface MobileOCRTabProps {
  host: string
  connected: boolean
  message: string
  setMessage: (m: string) => void
}

export function MobileOCRTab({ host, message, setMessage }: MobileOCRTabProps) {
  const [log, setLog] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef<{ success: ((m: string) => void) | null; error: ((m: string) => void) | null }>({
    success: null,
    error: null,
  })

  const addLog = (m: string) => setLog((p) => [...p, `[${formatTime()}] ${m}`].slice(-100))
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onOcrSuccess((m) => callbacks.current.success?.(m))
      window.electronAPI.onOcrError((m) => callbacks.current.error?.(m))
    }
  }, [])

  const handleSend = async () => {
    if (!message.trim()) {
      addLog('Error: Message empty')
      return
    }
    if (!host) {
      addLog('Error: Set host in connection')
      return
    }
    if (!window.electronAPI) {
      addLog('Error: API not available')
      return
    }
    setSending(true)
    callbacks.current = {
      success: (m) => {
        addLog(m)
        toast.success('Sent')
        setSending(false)
      },
      error: (m) => {
        addLog(m)
        setSending(false)
      },
    }
    window.electronAPI.ocrSend(host, message)
  }

  const handleInditex = () => {
    const code =
      '{"00":1,"01":1,"02":"2/2","03":1,"04":1224,"05":490,"06":102,"07":36,"08":"S2024","09":3,"10":3,"11":1,"12":835906,"13":"28937-P/2","14":10079,"15":150,"16":0,"17":317,"18":282537599,"19":0,"20":39} $0A'
    setMessage(code)
    addLog('Inditex code loaded')
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" />
            OCR Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Message</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter message"
              disabled={sending}
              className="h-12 text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="h-14"
              onClick={handleSend}
              disabled={sending || !message.trim()}
            >
              <Send className={`w-5 h-5 mr-2 ${sending ? 'animate-spin' : ''}`} />
              {sending ? 'Sending...' : 'Send'}
            </Button>
            <Button size="lg" variant="outline" className="h-14" onClick={handleInditex} disabled={sending}>
              Inditex Code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xs space-y-1 max-h-40 overflow-y-auto bg-muted/30 rounded-lg p-2">
            {log.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No messages yet</p>
            ) : (
              log.map((line, i) => (
                <div key={i} className="text-muted-foreground">
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
