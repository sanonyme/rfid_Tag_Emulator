import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Switch } from './ui/switch'
import {
  Send,
  Terminal,
  Copy,
  Download,
  Activity,
  Plug,
  Unplug,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatTime, cn } from '@/lib/utils'
import { sectionCard as SECTION_CARD } from '@/lib/ui-tokens'
import { TcpServerPanel } from './TcpServerPanel'

interface CustomTabProps {
  host: string
  message: string
  setMessage: (message: string) => void
  port: string
  setPort: (port: string) => void
}

interface ClientLogEntry {
  id: number
  time: string
  kind: 'rx' | 'tx' | 'system' | 'error'
  peer?: string
  text: string
  hex?: string
  byteLength?: number
}

type LineEnding = 'none' | 'lf' | 'crlf' | 'cr'

interface SendSlot {
  text: string
  hex: boolean
}

function escapeSpecialChars(text: string): string {
  return text.replace(/\r/g, '<CR>').replace(/\n/g, '<LF>').replace(/\t/g, '<TAB>')
}

export function CustomTab({ host, message, setMessage, port, setPort }: CustomTabProps) {
  const [targetHost, setTargetHost] = useState(host || '127.0.0.1')
  const [hostTouched, setHostTouched] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectedHost, setConnectedHost] = useState<string | null>(null)
  const [connectedPort, setConnectedPort] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Hercules-style display & send options
  const [viewHex, setViewHex] = useState(false)
  const [showSpecialChars, setShowSpecialChars] = useState(false)
  const [lineEnding, setLineEnding] = useState<LineEnding>('crlf')

  // Slot 1 uses the lifted `message` prop (preserves profile persistence), plus 2 extra quick-send slots
  const [slot1Hex, setSlot1Hex] = useState(false)
  const [extraSlots, setExtraSlots] = useState<SendSlot[]>([
    { text: '', hex: false },
    { text: '', hex: false },
  ])

  const [entries, setEntries] = useState<ClientLogEntry[]>([])
  const [rxBytes, setRxBytes] = useState(0)
  const [txBytes, setTxBytes] = useState(0)

  const logIdRef = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)

  const pushEntry = useCallback((entry: Omit<ClientLogEntry, 'id' | 'time'>) => {
    setEntries((prev) => {
      const next = [...prev, { ...entry, id: ++logIdRef.current, time: formatTime() }]
      return next.length > 500 ? next.slice(next.length - 500) : next
    })
  }, [])

  // Keep synced with the top Connection host until the user edits the field manually
  useEffect(() => {
    if (!hostTouched && host) {
      setTargetHost(host)
    }
  }, [host, hostTouched])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  // Sync status & subscribe to Electron persistent TCP client events
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.tcpClientStatus) return

    void api.tcpClientStatus().then((status) => {
      setConnected(status.connected)
      setConnectedHost(status.host)
      setConnectedPort(status.port)
      if (status.host) {
        setTargetHost(status.host)
        setHostTouched(true)
      }
      if (status.port) setPort(String(status.port))
    })

    const unsubStatus = api.onTcpClientStatus?.((status) => {
      setConnected(status.connected)
      setConnectedHost(status.host)
      setConnectedPort(status.port)
    })

    const unsubData = api.onTcpClientData?.((evt) => {
      setRxBytes((n) => n + evt.byteLength)
      pushEntry({
        kind: 'rx',
        peer: `${evt.host}:${evt.port}`,
        text: evt.text,
        hex: evt.hex,
        byteLength: evt.byteLength,
      })
    })

    const unsubDisconnected = api.onTcpClientDisconnected?.((evt) => {
      setConnected(false)
      setConnectedHost(null)
      setConnectedPort(null)
      pushEntry({
        kind: 'system',
        peer: evt.host && evt.port ? `${evt.host}:${evt.port}` : undefined,
        text: `Disconnected${evt.host && evt.port ? ` from ${evt.host}:${evt.port}` : ''}`,
      })
    })

    const unsubError = api.onTcpClientError?.((evt) => {
      pushEntry({
        kind: 'error',
        text: evt.message,
      })
    })

    return () => {
      unsubStatus?.()
      unsubData?.()
      unsubDisconnected?.()
      unsubError?.()
    }
  }, [pushEntry, setPort])

  const handleConnect = async () => {
    const api = window.electronAPI
    if (!api?.tcpClientConnect) {
      toast.error('TCP Client requires the desktop Electron app')
      return
    }
    const cleanHost = targetHost.trim()
    if (!cleanHost) {
      toast.error('Enter a target IP or hostname')
      return
    }
    const portNum = parseInt(port, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Enter a valid port between 1 and 65535')
      return
    }
    setBusy(true)
    try {
      const res = await api.tcpClientConnect(cleanHost, portNum)
      if (res.ok && res.status) {
        setConnected(true)
        setConnectedHost(res.status.host)
        setConnectedPort(res.status.port)
        pushEntry({
          kind: 'system',
          peer: `${res.status.host}:${res.status.port}`,
          text: `Connected to ${res.status.host}:${res.status.port}`,
        })
        toast.success(`Connected to ${res.status.host}:${res.status.port}`)
      } else {
        const msg = res.error ?? 'Connection failed'
        pushEntry({ kind: 'error', text: msg })
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    const api = window.electronAPI
    if (!api?.tcpClientDisconnect) return
    setBusy(true)
    try {
      const prevTarget = connectedHost && connectedPort ? `${connectedHost}:${connectedPort}` : null
      await api.tcpClientDisconnect()
      setConnected(false)
      setConnectedHost(null)
      setConnectedPort(null)
      pushEntry({
        kind: 'system',
        peer: prevTarget ?? undefined,
        text: `Closed connection${prevTarget ? ` to ${prevTarget}` : ''}`,
      })
      toast.message('TCP Client disconnected')
    } finally {
      setBusy(false)
    }
  }

  const handleSendPayload = async (text: string, hex: boolean) => {
    const api = window.electronAPI
    if (!api?.tcpClientSend) {
      toast.error('TCP Client requires the desktop Electron app')
      return
    }
    if (!text.length) {
      toast.error('Message is empty')
      return
    }
    if (!connected) {
      toast.error('Connect to a server first')
      return
    }

    const res = await api.tcpClientSend(text, {
      hex,
      lineEnding: hex ? 'none' : lineEnding,
    })
    if (res.ok) {
      setTxBytes((n) => n + (res.byteLength ?? 0))
      pushEntry({
        kind: 'tx',
        peer: connectedHost && connectedPort ? `${connectedHost}:${connectedPort}` : undefined,
        text: hex ? `[HEX] ${res.hex ?? text}` : text,
        hex: res.hex,
        byteLength: res.byteLength,
      })
    } else {
      const err = res.error ?? 'Send failed'
      pushEntry({ kind: 'error', text: err })
      toast.error(err)
    }
  }

  const updateExtraSlot = (index: number, patch: Partial<SendSlot>) => {
    setExtraSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const formatLogLineForExport = (e: ClientLogEntry) => {
    const dir = e.kind === 'rx' ? 'RX' : e.kind === 'tx' ? 'TX' : e.kind === 'error' ? 'ERR' : 'SYS'
    const peer = e.peer ? ` [${e.peer}]` : ''
    const body = viewHex && e.hex ? e.hex : showSpecialChars ? escapeSpecialChars(e.text) : e.text
    return `[${e.time}] ${dir}${peer} ${body}`
  }

  return (
    <div className="stagger-children mx-auto grid h-full max-w-7xl grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Left Column: Persistent Hercules-style TCP Client */}
      <div className="flex min-h-0 flex-col gap-4">
        <Card className={SECTION_CARD} data-tour="tour-custom-main">
          <CardHeader className="space-y-2 pb-3 pt-5 px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
                  <Terminal className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="text-base font-semibold tracking-tight">TCP Client</CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.45rem] text-xs leading-relaxed">
                    Open a persistent TCP connection to any IP and port.
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 whitespace-nowrap gap-1.5 font-mono text-[10px] font-medium transition-colors duration-200',
                  connected
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                    : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200',
                    connected ? 'animate-pulse-slow bg-violet-500' : 'bg-muted-foreground/50',
                  )}
                />
                {connected ? `Connected :${connectedPort}` : 'Disconnected'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 px-5 pb-5 pt-0">
            {/* Target IP / Port / Connect button */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6.5rem_7.25rem] sm:items-end">
              <div className="space-y-1.5">
                <div className="flex h-5 items-center justify-between gap-2">
                  <Label htmlFor="customHost" className="text-xs font-medium leading-none">
                    Target IP / Host
                  </Label>
                  <div className="flex items-center gap-1.5">
                    {host && targetHost.trim() !== host && !connected && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetHost(host)
                          setHostTouched(false)
                        }}
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={`Use connection host (${host})`}
                      >
                        Use {host}
                      </button>
                    )}
                    {targetHost.trim() !== '127.0.0.1' && !connected && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetHost('127.0.0.1')
                          setHostTouched(true)
                        }}
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Target local machine (127.0.0.1)"
                      >
                        127.0.0.1
                      </button>
                    )}
                  </div>
                </div>
                <Input
                  id="customHost"
                  value={targetHost}
                  onChange={(e) => {
                    setTargetHost(e.target.value)
                    setHostTouched(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !connected && !busy) void handleConnect()
                  }}
                  placeholder="e.g. 127.0.0.1"
                  disabled={connected || busy}
                  className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex h-5 items-center">
                  <Label htmlFor="customPort" className="text-xs font-medium leading-none">
                    Port
                  </Label>
                </div>
                <Input
                  id="customPort"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !connected && !busy) void handleConnect()
                  }}
                  placeholder="5000"
                  disabled={connected || busy}
                  className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
                />
              </div>

              <Button
                onClick={connected ? handleDisconnect : handleConnect}
                disabled={busy}
                variant={connected ? 'destructive' : 'default'}
                className="h-10 w-full rounded-lg px-3 transition-colors duration-200"
              >
                {connected ? (
                  <>
                    <Unplug className="mr-1.5 h-3.5 w-3.5" />
                    Close
                  </>
                ) : (
                  <>
                    <Plug className="mr-1.5 h-3.5 w-3.5" />
                    Connect
                  </>
                )}
              </Button>
            </div>

            {/* Connection info + RX/TX byte counters (fixed height to stay aligned with Server clients box) */}
            <div className="h-[5.25rem] rounded-lg border border-border/50 bg-muted/20 p-3 flex flex-col justify-between gap-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Plug className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Session</span>
                  <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
                    {connected ? 'Active' : 'Idle'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                  <span>RX: {rxBytes} B</span>
                  <span>TX: {txBytes} B</span>
                </div>
              </div>
              <div className="flex h-7 items-center overflow-hidden">
                <p className="truncate text-xs text-muted-foreground">
                  {connected ? (
                    <>
                      Connected to{' '}
                      <span className="font-mono text-foreground">
                        {connectedHost}:{connectedPort}
                      </span>
                    </>
                  ) : (
                    'Click Connect to open a persistent TCP socket.'
                  )}
                </p>
              </div>
            </div>

            {/* Hercules-style options row */}
            <div className="flex min-h-[2.75rem] flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
                  <Switch checked={viewHex} onCheckedChange={setViewHex} />
                  <span>HEX view</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
                  <Switch
                    checked={showSpecialChars}
                    onCheckedChange={setShowSpecialChars}
                    disabled={viewHex}
                  />
                  <span className={viewHex ? 'text-muted-foreground' : ''}>Special chars</span>
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">EOL:</span>
                <Select value={lineEnding} onValueChange={(v) => setLineEnding(v as LineEnding)}>
                  <SelectTrigger className="h-7 w-[5.25rem] font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="lf">LF (\n)</SelectItem>
                    <SelectItem value="crlf">CRLF</SelectItem>
                    <SelectItem value="cr">CR (\r)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Hercules-style 3 Send Slots */}
            <div className="space-y-2">
              <div className="flex h-4 items-center justify-between">
                <Label className="text-xs font-medium leading-none text-muted-foreground">Send</Label>
              </div>

              {/* Slot 1 (backed by profile-persisted `message` prop) */}
              <div className="flex items-center gap-2">
                <Input
                  id="customMessage"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && connected && message.length > 0) {
                      e.preventDefault()
                      void handleSendPayload(message, slot1Hex)
                    }
                  }}
                  placeholder={
                    slot1Hex ? 'Slot 1 hex (e.g. 02 48 49 03)' : 'Slot 1 message…'
                  }
                  className="h-9 flex-1 rounded-lg border-border/50 font-mono text-xs shadow-none"
                />
                <Button
                  type="button"
                  variant={slot1Hex ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSlot1Hex((v) => !v)}
                  className="h-9 w-12 shrink-0 rounded-lg px-0 font-mono text-[11px]"
                  title="Toggle HEX byte input for this slot"
                >
                  HEX
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSendPayload(message, slot1Hex)}
                  disabled={!connected || !message.length}
                  className="h-9 shrink-0 rounded-lg px-3"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send
                </Button>
              </div>

              {/* Slots 2 & 3 */}
              {extraSlots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={slot.text}
                    onChange={(e) => updateExtraSlot(idx, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && connected && slot.text.length > 0) {
                        e.preventDefault()
                        void handleSendPayload(slot.text, slot.hex)
                      }
                    }}
                    placeholder={
                      slot.hex
                        ? `Slot ${idx + 2} hex (e.g. 02 4F 4B 03)`
                        : `Slot ${idx + 2} message…`
                    }
                    className="h-9 flex-1 rounded-lg border-border/50 font-mono text-xs shadow-none"
                  />
                  <Button
                    type="button"
                    variant={slot.hex ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateExtraSlot(idx, { hex: !slot.hex })}
                    className="h-9 w-12 shrink-0 rounded-lg px-0 font-mono text-[11px]"
                    title="Toggle HEX byte input for this slot"
                  >
                    HEX
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSendPayload(slot.text, slot.hex)}
                    disabled={!connected || !slot.text.length}
                    className="h-9 shrink-0 rounded-lg px-3"
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Client Received / Sent Data Log */}
        <Card className={cn(SECTION_CARD, 'flex min-h-[240px] flex-1 flex-col')} data-tour="tour-custom-log">
          <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 ring-1 ring-violet-500/20">
                  <Activity className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </span>
                Received / Sent Data
                {connected && (
                  <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse-slow" />
                )}
              </CardTitle>
              <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
                {entries.length > 0 && (
                  <>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(entries.map(formatLogLineForExport).join('\n'))
                        toast.success('Client log copied')
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
                        const text = entries.map(formatLogLineForExport).join('\n')
                        const blob = new Blob([text], { type: 'text/plain' })
                        const a = document.createElement('a')
                        a.href = URL.createObjectURL(blob)
                        a.download = `tcp-client-log-${formatTime().replace(/[:/]/g, '-')}.txt`
                        a.click()
                        URL.revokeObjectURL(a.href)
                        toast.success('Client log exported')
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                      title="Export log"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                    <div className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
                  </>
                )}
                <Button
                  onClick={() => {
                    setEntries([])
                    setRxBytes(0)
                    setTxBytes(0)
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 rounded-md px-2.5 text-xs"
                  title="Clear log and counters"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="min-h-0 flex-1 bg-muted/15 p-0">
            <ScrollArea className="h-full min-h-[200px]">
              <div className="space-y-0.5 p-3 font-mono text-xs">
                {entries.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No client traffic yet</p>
                    <p className="max-w-xs text-xs leading-relaxed">
                      Connect to a TCP server to send messages (TX) and view live replies (RX) here.
                    </p>
                  </div>
                )}

                {entries.map((entry, i) => {
                  const body =
                    viewHex && entry.hex
                      ? entry.hex
                      : showSpecialChars
                        ? escapeSpecialChars(entry.text)
                        : entry.text
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        'flex items-start gap-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-accent/35',
                        i === entries.length - 1 && 'animate-log-new',
                      )}
                    >
                      <span className="shrink-0 text-muted-foreground/70">[{entry.time}]</span>
                      {entry.kind === 'rx' && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                          <ArrowDownLeft className="h-3 w-3" />
                          RX
                        </span>
                      )}
                      {entry.kind === 'tx' && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                          <ArrowUpRight className="h-3 w-3" />
                          TX
                        </span>
                      )}
                      {entry.kind === 'system' && (
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                          SYS
                        </span>
                      )}
                      {entry.kind === 'error' && (
                        <span className="shrink-0 rounded bg-destructive/15 px-1 text-[10px] font-semibold text-destructive">
                          ERR
                        </span>
                      )}
                      {entry.peer && (
                        <span className="shrink-0 text-muted-foreground">{entry.peer}</span>
                      )}
                      <span
                        className={cn(
                          'min-w-0 flex-1 whitespace-pre-wrap break-all',
                          entry.kind === 'rx' && 'text-sky-700 dark:text-sky-300',
                          entry.kind === 'tx' && 'text-violet-700 dark:text-violet-300',
                          entry.kind === 'error' && 'text-destructive',
                          entry.kind === 'system' && 'text-muted-foreground',
                        )}
                      >
                        {body}
                      </span>
                      {entry.byteLength !== undefined && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                          {entry.byteLength}B
                        </span>
                      )}
                    </div>
                  )
                })}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Hercules-style TCP Server */}
      <TcpServerPanel />
    </div>
  )
}
