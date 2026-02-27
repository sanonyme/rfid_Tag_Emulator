import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Send, Globe, Clock, CheckCircle, XCircle, Loader2, Copy, Check, Save, Braces } from 'lucide-react'

const DEFAULT_URL = 'https://api.product.inditex.com/icdmrfidre/api/v1/rfid/box-readings'
//const DEFAULT_BODY = '{\n  "ou i i a i": "67 67 67 67"\n}'

export function ApiTab() {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [body, setBody] = useState('')
  const [method] = useState<'POST'>('POST')
  const [headerName, setHeaderName] = useState('itx-apiKey')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="flex flex-col gap-4 h-full max-w-5xl mx-auto">
      {/* Request Card - Bruno style */}
      <Card className="border-border/50 bg-card transition-all duration-300">
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
              placeholder='{"ou i i a i": "67 67 67 67"}'
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
      <Card className="flex-1 min-h-0 border-border/50 bg-card transition-all duration-300">
        <CardHeader className="py-2 border-b border-border/50">
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
        <CardContent className="h-[calc(100%-4rem)] p-0">
          <ScrollArea className="h-full">
            <pre className="p-4 font-mono text-sm text-muted-foreground whitespace-pre-wrap break-all">
              {!response ? (
                <span className="italic">Send a request to see the response...</span>
              ) : response.error ? (
                <span className="text-destructive">{response.error}</span>
              ) : (
                formatResponseBody(response.data)
              )}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
