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
  Server,
  Play,
  Square,
  Send,
  Copy,
  Download,
  Trash2,
  Users,
  X,
  Radio,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatTime, cn } from '@/lib/utils'
import { sectionCard as SECTION_CARD } from '@/lib/ui-tokens'

interface TcpClientInfo {
  id: string
  address: string
  port: number
  connectedAt: number
}

interface ServerLogEntry {
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

const DEFAULT_SLOTS: SendSlot[] = [
  { text: '', hex: false },
  { text: '', hex: false },
  { text: '', hex: false },
]

function escapeSpecialChars(text: string): string {
  return text.replace(/\r/g, '<CR>').replace(/\n/g, '<LF>').replace(/\t/g, '<TAB>')
}

export function TcpServerPanel() {
  const [listenPort, setListenPort] = useState('5000')
  const [bindHost, setBindHost] = useState('0.0.0.0')
  const [running, setRunning] = useState(false)
  const [activePort, setActivePort] = useState<number | null>(null)
  const [activeHost, setActiveHost] = useState('0.0.0.0')
  const [busy, setBusy] = useState(false)
  const [clients, setClients] = useState<TcpClientInfo[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('all')

  // Hercules-style display & behavior flags
  const [viewHex, setViewHex] = useState(false)
  const [showSpecialChars, setShowSpecialChars] = useState(false)
  const [echoMode, setEchoMode] = useState(false)
  const [lineEnding, setLineEnding] = useState<LineEnding>('crlf')

  // Hercules-style 3 quick-send slots (each with own HEX toggle)
  const [slots, setSlots] = useState<SendSlot[]>(DEFAULT_SLOTS)

  const [entries, setEntries] = useState<ServerLogEntry[]>([])
  const [rxBytes, setRxBytes] = useState(0)
  const [txBytes, setTxBytes] = useState(0)

  const logIdRef = useRef(0)
  const logEndRef = useRef<HTMLDivElement>(null)
  const echoModeRef = useRef(echoMode)
  echoModeRef.current = echoMode

  const pushEntry = useCallback(
    (entry: Omit<ServerLogEntry, 'id' | 'time'>) => {
      setEntries((prev) => {
        const next = [...prev, { ...entry, id: ++logIdRef.current, time: formatTime() }]
        return next.length > 500 ? next.slice(next.length - 500) : next
      })
    },
    [],
  )

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  // Keep selectedClientId valid if that client disconnects
  useEffect(() => {
    if (selectedClientId !== 'all' && !clients.some((c) => c.id === selectedClientId)) {
      setSelectedClientId('all')
    }
  }, [clients, selectedClientId])

  // Sync status & subscribe to Electron TCP server events
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.tcpServerStatus) return

    void api.tcpServerStatus().then((status) => {
      setRunning(status.running)
      setActivePort(status.port)
      setActiveHost(status.host)
      setClients(status.clients)
      if (status.port) setListenPort(String(status.port))
    })

    const unsubStatus = api.onTcpServerStatus?.((status) => {
      setRunning(status.running)
      setActivePort(status.port)
      setActiveHost(status.host)
      setClients(status.clients)
    })

    const unsubConnected = api.onTcpServerClientConnected?.((client) => {
      pushEntry({
        kind: 'system',
        peer: `${client.address}:${client.port}`,
        text: `Client connected (${client.address}:${client.port})`,
      })
    })

    const unsubDisconnected = api.onTcpServerClientDisconnected?.((client) => {
      pushEntry({
        kind: 'system',
        peer: `${client.address}:${client.port}`,
        text: `Client disconnected (${client.address}:${client.port})`,
      })
    })

    const unsubData = api.onTcpServerData?.((evt) => {
      setRxBytes((n) => n + evt.byteLength)
      pushEntry({
        kind: 'rx',
        peer: `${evt.address}:${evt.port}`,
        text: evt.text,
        hex: evt.hex,
        byteLength: evt.byteLength,
      })

      if (echoModeRef.current && api.tcpServerSend) {
        void api.tcpServerSend(evt.hex, { clientId: evt.clientId, hex: true }).then((res) => {
          if (res.ok && res.byteLength) {
            setTxBytes((n) => n + res.byteLength!)
            pushEntry({
              kind: 'tx',
              peer: `${evt.address}:${evt.port} (echo)`,
              text: evt.text,
              hex: evt.hex,
              byteLength: res.byteLength,
            })
          }
        })
      }
    })

    const unsubError = api.onTcpServerError?.((evt) => {
      pushEntry({
        kind: 'error',
        peer: evt.address ? `${evt.address}:${evt.port ?? ''}` : undefined,
        text: evt.message,
      })
    })

    return () => {
      unsubStatus?.()
      unsubConnected?.()
      unsubDisconnected?.()
      unsubData?.()
      unsubError?.()
    }
  }, [pushEntry])

  const handleStart = async () => {
    const api = window.electronAPI
    if (!api?.tcpServerStart) {
      toast.error('TCP Server requires the desktop Electron app')
      return
    }
    const portNum = parseInt(listenPort, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Enter a valid port between 1 and 65535')
      return
    }
    setBusy(true)
    try {
      const res = await api.tcpServerStart(portNum, bindHost.trim() || '0.0.0.0')
      if (res.ok && res.status) {
        setRunning(true)
        setActivePort(res.status.port)
        setActiveHost(res.status.host)
        pushEntry({
          kind: 'system',
          text: `TCP Server listening on ${res.status.host}:${res.status.port}`,
        })
        toast.success(`Listening on port ${res.status.port}`)
      } else {
        const msg = res.error ?? 'Failed to start TCP server'
        pushEntry({ kind: 'error', text: msg })
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async () => {
    const api = window.electronAPI
    if (!api?.tcpServerStop) return
    setBusy(true)
    try {
      const prevPort = activePort
      await api.tcpServerStop()
      setRunning(false)
      setActivePort(null)
      setClients([])
      pushEntry({
        kind: 'system',
        text: `TCP Server stopped${prevPort ? ` (port ${prevPort})` : ''}`,
      })
      toast.message('TCP Server stopped')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnectClient = async (client: TcpClientInfo) => {
    const api = window.electronAPI
    if (!api?.tcpServerDisconnectClient) return
    await api.tcpServerDisconnectClient(client.id)
  }

  const handleSendSlot = async (index: number) => {
    const api = window.electronAPI
    if (!api?.tcpServerSend) {
      toast.error('TCP Server requires the desktop Electron app')
      return
    }
    const slot = slots[index]
    if (!slot.text.length) {
      toast.error(`Send slot ${index + 1} is empty`)
      return
    }
    const res = await api.tcpServerSend(slot.text, {
      clientId: selectedClientId,
      hex: slot.hex,
      lineEnding: slot.hex ? 'none' : lineEnding,
    })
    if (res.ok) {
      setTxBytes((n) => n + (res.byteLength ?? 0))
      const targetLabel =
        selectedClientId === 'all'
          ? `all (${res.sentCount})`
          : (() => {
            const c = clients.find((x) => x.id === selectedClientId)
            return c ? `${c.address}:${c.port}` : selectedClientId
          })()
      pushEntry({
        kind: 'tx',
        peer: targetLabel,
        text: slot.hex ? `[HEX] ${res.hex ?? slot.text}` : slot.text,
        hex: res.hex,
        byteLength: res.byteLength,
      })
    } else {
      const err = res.error ?? 'Send failed'
      pushEntry({ kind: 'error', text: err })
      toast.error(err)
    }
  }

  const updateSlot = (index: number, patch: Partial<SendSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const formatLogLineForExport = (e: ServerLogEntry) => {
    const dir = e.kind === 'rx' ? 'RX' : e.kind === 'tx' ? 'TX' : e.kind === 'error' ? 'ERR' : 'SYS'
    const peer = e.peer ? ` [${e.peer}]` : ''
    const body = viewHex && e.hex ? e.hex : showSpecialChars ? escapeSpecialChars(e.text) : e.text
    return `[${e.time}] ${dir}${peer} ${body}`
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Server Control + Connected Clients Card */}
      <Card className={SECTION_CARD}>
        <CardHeader className="space-y-2 px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                <Server className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">TCP Server</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[2.45rem] text-xs leading-relaxed">
                  Listen for incoming TCP connections, inspect traffic, and reply to clients.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 whitespace-nowrap gap-1.5 font-mono text-[10px] font-medium transition-colors duration-200',
                running
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200',
                  running ? 'animate-pulse-slow bg-emerald-500' : 'bg-muted-foreground/50',
                )}
              />
              {running ? `Listening :${activePort}` : 'Stopped'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-5 pb-5 pt-0">
          {/* Bind / Port / Listen button */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6.5rem_7.25rem] sm:items-end">
            <div className="space-y-1.5">
              <div className="flex h-5 items-center">
                <Label htmlFor="tcpServerHost" className="text-xs font-medium leading-none">
                  Bind IP
                </Label>
              </div>
              <Input
                id="tcpServerHost"
                value={bindHost}
                onChange={(e) => setBindHost(e.target.value)}
                placeholder="0.0.0.0"
                disabled={running || busy}
                className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex h-5 items-center">
                <Label htmlFor="tcpServerPort" className="text-xs font-medium leading-none">
                  Port
                </Label>
              </div>
              <Input
                id="tcpServerPort"
                value={listenPort}
                onChange={(e) => setListenPort(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !running && !busy) void handleStart()
                }}
                placeholder="5000"
                disabled={running || busy}
                className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
              />
            </div>
            <Button
              onClick={running ? handleStop : handleStart}
              disabled={busy}
              variant={running ? 'destructive' : 'default'}
              className="h-10 w-full rounded-lg px-4 transition-colors duration-200"
            >
              {running ? (
                <>
                  <Square className="mr-2 h-3.5 w-3.5 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="mr-2 h-3.5 w-3.5 fill-current" />
                  Listen
                </>
              )}
            </Button>
          </div>

          {/* Hercules-style status / connected clients bar (fixed height to stay aligned with Client session box) */}
          <div className="h-[5.25rem] rounded-lg border border-border/50 bg-muted/20 p-3 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Connected clients</span>
                <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
                  {clients.length}
                </Badge>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span>RX: {rxBytes} B</span>
                <span>TX: {txBytes} B</span>
              </div>
            </div>

            <div className="flex h-7 items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
              {clients.length === 0 ? (
                <p className="truncate text-xs text-muted-foreground">
                  {running
                    ? `Waiting for clients on ${activeHost}:${activePort}…`
                    : 'Start the server to accept incoming TCP connections.'}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedClientId('all')}
                    className={cn(
                      'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 font-mono text-[11px] leading-none transition-colors',
                      selectedClientId === 'all'
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-border/50 bg-background/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    All ({clients.length})
                  </button>
                  {clients.map((c) => {
                    const selected = selectedClientId === c.id
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border pl-2 pr-1 font-mono text-[11px] leading-none transition-colors',
                          selected
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'border-border/50 bg-background/60 text-foreground/85',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedClientId(c.id)}
                          className="hover:underline"
                          title="Target this client for Send"
                        >
                          {c.address}:{c.port}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDisconnectClient(c)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          title={`Disconnect ${c.address}:${c.port}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* Hercules-style options row */}
          <div className="flex min-h-[2.75rem] flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap">
                <Switch checked={echoMode} onCheckedChange={setEchoMode} />
                <span>Echo</span>
              </label>
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
              <Label className="text-xs font-medium leading-none text-muted-foreground">
                Send to{' '}
                <span className="font-mono text-foreground">
                  {selectedClientId === 'all'
                    ? `all connected (${clients.length})`
                    : (() => {
                      const c = clients.find((x) => x.id === selectedClientId)
                      return c ? `${c.address}:${c.port}` : 'client'
                    })()}
                </span>
              </Label>
            </div>
            {slots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={slot.text}
                  onChange={(e) => updateSlot(idx, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && running && clients.length > 0) {
                      e.preventDefault()
                      void handleSendSlot(idx)
                    }
                  }}
                  placeholder={
                    slot.hex
                      ? `Slot ${idx + 1} hex (e.g. 02 4F 4B 03)`
                      : `Slot ${idx + 1} reply message…`
                  }
                  className="h-9 flex-1 rounded-lg border-border/50 font-mono text-xs shadow-none"
                />
                <Button
                  type="button"
                  variant={slot.hex ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateSlot(idx, { hex: !slot.hex })}
                  className="h-9 w-12 shrink-0 rounded-lg px-0 font-mono text-[11px]"
                  title="Toggle HEX byte input for this slot"
                >
                  HEX
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSendSlot(idx)}
                  disabled={!running || clients.length === 0 || !slot.text.length}
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

      {/* Received / Sent Data Log (Hercules terminal view) */}
      <Card className={cn(SECTION_CARD, 'flex min-h-[240px] flex-1 flex-col')}>
        <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </span>
              Received / Sent Data
              {running && (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-slow" />
              )}
            </CardTitle>
            <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
              {entries.length > 0 && (
                <>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(entries.map(formatLogLineForExport).join('\n'))
                      toast.success('Server log copied')
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
                      a.download = `tcp-server-log-${formatTime().replace(/[:/]/g, '-')}.txt`
                      a.click()
                      URL.revokeObjectURL(a.href)
                      toast.success('Server log exported')
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    <Server className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No server traffic yet</p>
                  <p className="max-w-xs text-xs leading-relaxed">
                    Click Listen to open a TCP port. Incoming packets (RX) and replies (TX) appear here.
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
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
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
                        entry.kind === 'tx' && 'text-emerald-700 dark:text-emerald-300',
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
  )
}
