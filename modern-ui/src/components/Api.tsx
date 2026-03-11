import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from './ui/dialog'
import { Send, Globe, Clock, CheckCircle, XCircle, Loader2, Copy, Check, Save, Braces, ArrowDown, ArrowUp } from 'lucide-react'

function JsonHighlight({ json }: { json: string }) {
  if (!json) return null
  const parts = json.split(/("(?:[^"\\]|\\.)*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === undefined || part === '') return null
        if (part === ':') return <span key={i}>:</span>
        if (/^".*"$/.test(part)) {
          const prev = parts.slice(0, i + 1)
          const isKey = prev[i + 1] === ':'
          return <span key={i} className={isKey ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}>{part}</span>
        }
        if (part === 'true' || part === 'false') return <span key={i} className="text-amber-600 dark:text-amber-400">{part}</span>
        if (part === 'null') return <span key={i} className="text-red-500">{part}</span>
        if (/^-?\d/.test(part)) return <span key={i} className="text-blue-600 dark:text-blue-400">{part}</span>
        return <span key={i} className="text-muted-foreground">{part}</span>
      })}
    </>
  )
}

const DEFAULT_URL = 'https://api.product.inditex.com/icdmrfidre/api/v1/rfid/box-readings'
//const DEFAULT_BODY = '{\n  "ou i i a i": "67 67 67 67"\n}'

interface ApiTabProps {
  base64Open?: boolean
  onBase64OpenChange?: (open: boolean) => void
}

export function ApiTab({ base64Open, onBase64OpenChange }: ApiTabProps = {}) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [body, setBody] = useState('')
  const [method] = useState<'POST'>('POST')
  const [headerName, setHeaderName] = useState('itx-apiKey')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  // Base64 Decoder state (like base64decode.org)
  const [base64Input, setBase64Input] = useState('')
  const [base64Output, setBase64Output] = useState('')
  const [base64Error, setBase64Error] = useState<string | null>(null)
  const [base64Mode, setBase64Mode] = useState<'decode' | 'encode'>('decode')

  useEffect(() => {
    window.electronAPI?.getApiConfig?.().then((config) => {
      if (config) {
        setHeaderName(config.headerName || 'itx-apiKey')
        setApiKey(config.key || '')
      }
    })
  }, [])
  const [response, setResponse] = useState<{
    ok: boolean
    status: number
    statusText: string
    data: string | null
    headers?: Record<string, string>
    durationMs?: number
    error?: string
  } | null>(null)

  const handleSend = async () => {
    if (!window.electronAPI?.itxApiRequest) {
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Error',
        data: null,
        error: 'Electron API not available',
      })
      return
    }

    setSending(true)
    setResponse(null)
    const start = performance.now()

    try {
      const res = await window.electronAPI.itxApiRequest(url, body)
      const durationMs = Math.round(performance.now() - start)
      setResponse({
        ...res,
        durationMs,
      })
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start)
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Error',
        data: null,
        durationMs,
        error: err?.message || String(err),
      })
    } finally {
      setSending(false)
    }
  }

  const getResponseText = () => {
    if (!response) return ''
    if (response.error) return response.error
    return formatResponseBody(response.data)
  }

  const handlePrettifyBody = () => {
    try {
      const parsed = JSON.parse(body)
      setBody(JSON.stringify(parsed, null, 2))
    } catch {
      // Invalid JSON - leave as is or could show a toast
    }
  }

  const handleSaveConfig = async () => {
    await window.electronAPI?.saveApiConfig?.(headerName, apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleCopyResponse = async () => {
    const text = getResponseText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatResponseBody = (data: string | null) => {
    if (!data) return ''
    try {
      const parsed = JSON.parse(data)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return data
    }
  }

  const handleBase64Convert = () => {
    setBase64Error(null)
    setBase64Output('')
    const input = base64Input.trim()
    if (!input) return

    try {
      if (base64Mode === 'decode') {
        // Decode Base64 to UTF-8 text (like base64decode.org)
        const decoded = atob(input.replace(/\s/g, ''))
        const bytes = new Uint8Array(decoded.length)
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i)
        }
        setBase64Output(new TextDecoder('utf-8').decode(bytes))
      } else {
        // Encode UTF-8 text to Base64
        const encoded = btoa(
          String.fromCharCode(...new TextEncoder().encode(input))
        )
        setBase64Output(encoded)
      }
    } catch (e) {
      setBase64Error(
        base64Mode === 'decode'
          ? 'Invalid Base64 string. Ensure it contains only valid Base64 characters (A-Za-z0-9+/=).'
          : 'Encoding failed.'
      )
    }
  }

  const handleBase64Copy = async () => {
    if (!base64Output) return
    try {
      await navigator.clipboard.writeText(base64Output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex flex-col gap-4 min-h-full max-w-5xl mx-auto relative">
      {/* Request Card - Bruno style */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Inditex RFID Box Readings API
          </CardTitle>
          <CardDescription>
            POST JSON to the Inditex API. Configure the auth header below; it is saved locally.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL + Method row */}
          <div className="flex gap-2 items-center">
            <Select value={method} disabled>
              <SelectTrigger className="w-28 shrink-0 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-0">
              <Label htmlFor="api-url" className="sr-only">URL</Label>
              <Input
                id="api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.product.inditex.com/..."
                disabled={sending}
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Auth header config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="api-header">Header name</Label>
              <Input
                id="api-header"
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                placeholder="itx-apiKey"
                disabled={sending}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  disabled={sending}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSaveConfig}
                  disabled={sending}
                  title="Save (persists across restarts)"
                >
                  {saved ? <Check className="w-4 h-4 text-green-500" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="api-body">Request Body (JSON)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrettifyBody}
                disabled={sending}
                className="h-7 px-2 text-xs"
              >
                <Braces className="w-3.5 h-3.5 mr-1" />
                Prettify
              </Button>
            </div>
            <Textarea
              id="api-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"test": "test value"}'
              disabled={sending}
              className="font-mono text-sm min-h-[180px] resize-y"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sending}
            size="lg"
            className="w-full"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {sending ? 'Sending...' : 'Send Request'}
          </Button>
        </CardContent>
      </Card>

      {/* Response Card */}
      <Card className="flex-1 min-h-[200px] border-border/50 bg-card flex flex-col">
        <CardHeader className="py-2 border-b border-border/50 shrink-0">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Response
              {response && (
                <>
                  {response.ok ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                  <Badge variant={response.ok ? 'default' : 'destructive'}>
                    {response.status} {response.statusText}
                  </Badge>
                  {response.durationMs != null && (
                    <span className="flex items-center gap-1 text-muted-foreground font-normal">
                      <Clock className="w-3 h-3" />
                      {response.durationMs}ms
                    </span>
                  )}
                </>
              )}
            </CardTitle>
            {response && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyResponse}
                className="h-8 px-2"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="ml-1.5">{copied ? 'Copied!' : 'Copy'}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <ScrollArea className="h-full">
            <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all">
              {!response ? (
                <span className="text-muted-foreground italic">Send a request to see the response...</span>
              ) : response.error ? (
                <span className="text-destructive">{response.error}</span>
              ) : (
                <JsonHighlight json={formatResponseBody(response.data)} />
              )}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Small floating Base64 trigger - click to open decoder */}
      <Dialog open={base64Open} onOpenChange={onBase64OpenChange}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors shadow-sm"
            title="Base64 Decode / Encode"
          >
            <Braces className="w-3.5 h-3.5" />
            Base64
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Braces className="w-5 h-5 text-primary" />
              Base64 Decoder / Encoder
            </DialogTitle>
            <DialogDescription>
              Decode Base64 to text or encode text to Base64.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button
                variant={base64Mode === 'decode' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setBase64Mode('decode')
                  setBase64Output('')
                  setBase64Error(null)
                }}
              >
                <ArrowDown className="w-3.5 h-3.5 mr-1.5" />
                Decode
              </Button>
              <Button
                variant={base64Mode === 'encode' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setBase64Mode('encode')
                  setBase64Output('')
                  setBase64Error(null)
                }}
              >
                <ArrowUp className="w-3.5 h-3.5 mr-1.5" />
                Encode
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base64-input">
                {base64Mode === 'decode' ? 'Base64 string' : 'Text to encode'}
              </Label>
              <Textarea
                id="base64-input"
                value={base64Input}
                onChange={(e) => {
                  setBase64Input(e.target.value)
                  setBase64Error(null)
                }}
                placeholder={
                  base64Mode === 'decode'
                    ? 'Paste Base64 (e.g. SGVsbG8gV29ybGQ=)'
                    : 'Enter text to encode'
                }
                className="font-mono text-sm min-h-[140px] resize-y"
              />
            </div>

            <Button onClick={handleBase64Convert} variant="secondary" className="w-full">
              {base64Mode === 'decode' ? 'Decode Base64' : 'Encode to Base64'}
            </Button>

            {base64Output && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">
                    {base64Mode === 'decode' ? 'Decoded text' : 'Base64 output'}
                  </Label>
                  <Button variant="ghost" size="sm" onClick={handleBase64Copy} className="h-7 px-2 text-xs">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="ml-1">{copied ? 'Copied!' : 'Copy'}</span>
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-muted/50 border font-mono text-sm whitespace-pre-wrap break-all max-h-48 overflow-auto">
                  {base64Output}
                </pre>
              </div>
            )}

            {base64Error && (
              <p className="text-xs text-destructive">{base64Error}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
