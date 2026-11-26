import { createServer, type Server, type Socket } from 'node:net'
import { broadcastToAllWindows } from './window-broadcast.js'

export interface TcpServerClientInfo {
  id: string
  address: string
  port: number
  connectedAt: number
}

export interface TcpServerStatus {
  running: boolean
  host: string
  port: number | null
  clients: TcpServerClientInfo[]
}

export interface TcpServerDataEvent {
  clientId: string
  address: string
  port: number
  text: string
  hex: string
  byteLength: number
  timestamp: number
}

export interface TcpServerSendOptions {
  /** Target a specific client ID, or omit / pass `'all'` to broadcast to all connected clients. */
  clientId?: string
  /** When true, `payload` is parsed as space/colon/comma-separated hex bytes (e.g. `02 48 49 03`). */
  hex?: boolean
  /** Line ending to append in ASCII/UTF-8 mode. Ignored when `hex` is true. */
  lineEnding?: 'none' | 'lf' | 'crlf' | 'cr'
}

interface TrackedClient {
  info: TcpServerClientInfo
  socket: Socket
}

let server: Server | null = null
let listenHost = '0.0.0.0'
let listenPort: number | null = null
let clientSeq = 0
const clients = new Map<string, TrackedClient>()

function normalizeAddress(addr?: string): string {
  if (!addr) return 'unknown'
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr
}

function bufferToHex(buf: Buffer): string {
  const parts: string[] = []
  for (let i = 0; i < buf.length; i++) {
    parts.push(buf[i].toString(16).toUpperCase().padStart(2, '0'))
  }
  return parts.join(' ')
}

export function parseHexPayload(raw: string): { ok: true; buffer: Buffer } | { ok: false; error: string } {
  const cleaned = raw.replace(/0x/gi, '').replace(/[\s,:-]+/g, '')
  if (!cleaned) {
    return { ok: false, error: 'Hex payload is empty' }
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { ok: false, error: 'Invalid hex characters (use 0-9, A-F)' }
  }
  if (cleaned.length % 2 !== 0) {
    return { ok: false, error: 'Hex payload must have an even number of hex digits' }
  }
  return { ok: true, buffer: Buffer.from(cleaned, 'hex') }
}

function getLineEnding(mode?: TcpServerSendOptions['lineEnding']): string {
  switch (mode) {
    case 'lf':
      return '\n'
    case 'crlf':
      return '\r\n'
    case 'cr':
      return '\r'
    default:
      return ''
  }
}

export function getTcpServerStatus(): TcpServerStatus {
  return {
    running: Boolean(server && server.listening),
    host: listenHost,
    port: listenPort,
    clients: Array.from(clients.values()).map((c) => c.info),
  }
}

function emitStatus(): void {
  broadcastToAllWindows('tcp-server-status', getTcpServerStatus())
}

export function startTcpServer(
  port: number,
  host: string = '0.0.0.0',
): Promise<{ ok: boolean; status?: TcpServerStatus; error?: string }> {
  return new Promise((resolve) => {
    const portNum = Math.floor(Number(port))
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      resolve({ ok: false, error: 'Invalid port number (1–65535)' })
      return
    }
    const bindHost = (host || '0.0.0.0').trim() || '0.0.0.0'

    if (server && server.listening) {
      resolve({ ok: false, error: `Server is already listening on ${listenHost}:${listenPort}` })
      return
    }

    const srv = createServer((socket: Socket) => {
      const id = `c-${++clientSeq}`
      const info: TcpServerClientInfo = {
        id,
        address: normalizeAddress(socket.remoteAddress),
        port: socket.remotePort ?? 0,
        connectedAt: Date.now(),
      }
      clients.set(id, { info, socket })
      broadcastToAllWindows('tcp-server-client-connected', info)
      emitStatus()

      socket.on('data', (chunk: Buffer) => {
        const event: TcpServerDataEvent = {
          clientId: id,
          address: info.address,
          port: info.port,
          text: chunk.toString('utf8'),
          hex: bufferToHex(chunk),
          byteLength: chunk.length,
          timestamp: Date.now(),
        }
        broadcastToAllWindows('tcp-server-data', event)
      })

      socket.on('error', (err: Error) => {
        broadcastToAllWindows('tcp-server-error', {
          clientId: id,
          address: info.address,
          port: info.port,
          message: err.message,
          timestamp: Date.now(),
        })
      })

      socket.on('close', () => {
        if (clients.delete(id)) {
          broadcastToAllWindows('tcp-server-client-disconnected', info)
          emitStatus()
        }
      })
    })

    let settled = false
    const onStartupError = (err: NodeJS.ErrnoException) => {
      if (!settled) {
        settled = true
        server = null
        listenPort = null
        const friendly =
          err.code === 'EADDRINUSE'
            ? `Port ${portNum} is already in use`
            : err.code === 'EACCES'
              ? `Permission denied binding to ${bindHost}:${portNum}`
              : err.message
        resolve({ ok: false, error: friendly })
      } else {
        broadcastToAllWindows('tcp-server-error', {
          message: err.message,
          timestamp: Date.now(),
        })
      }
    }

    srv.on('error', onStartupError)

    srv.listen(portNum, bindHost, () => {
      if (settled) return
      settled = true
      server = srv
      listenHost = bindHost
      const addr = srv.address()
      listenPort = typeof addr === 'object' && addr ? addr.port : portNum
      const status = getTcpServerStatus()
      emitStatus()
      resolve({ ok: true, status })
    })
  })
}

export function stopTcpServer(): Promise<{ ok: boolean; status: TcpServerStatus }> {
  return new Promise((resolve) => {
    for (const { socket } of clients.values()) {
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
    }
    clients.clear()

    if (!server) {
      listenPort = null
      const status = getTcpServerStatus()
      emitStatus()
      resolve({ ok: true, status })
      return
    }

    const srv = server
    server = null
    listenPort = null
    try {
      srv.close(() => {
        const status = getTcpServerStatus()
        emitStatus()
        resolve({ ok: true, status })
      })
    } catch {
      const status = getTcpServerStatus()
      emitStatus()
      resolve({ ok: true, status })
    }
  })
}

export function disconnectTcpServerClient(clientId: string): { ok: boolean; error?: string } {
  const entry = clients.get(clientId)
  if (!entry) {
    return { ok: false, error: 'Client not found' }
  }
  try {
    entry.socket.destroy()
  } catch {
    /* ignore */
  }
  return { ok: true }
}

export function sendToTcpServerClients(
  payload: string,
  options: TcpServerSendOptions = {},
): { ok: boolean; sentCount?: number; byteLength?: number; hex?: string; error?: string } {
  if (!server || !server.listening) {
    return { ok: false, error: 'TCP server is not running' }
  }

  let buf: Buffer
  if (options.hex) {
    const parsed = parseHexPayload(payload)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    buf = parsed.buffer
  } else {
    const suffix = getLineEnding(options.lineEnding)
    buf = Buffer.from(payload + suffix, 'utf8')
  }

  const targets: TrackedClient[] =
    options.clientId && options.clientId !== 'all'
      ? (() => {
          const c = clients.get(options.clientId)
          return c ? [c] : []
        })()
      : Array.from(clients.values())

  if (targets.length === 0) {
    return {
      ok: false,
      error:
        options.clientId && options.clientId !== 'all'
          ? 'Selected client is no longer connected'
          : 'No clients connected',
    }
  }

  let sentCount = 0
  for (const { socket } of targets) {
    if (!socket.destroyed && socket.writable) {
      try {
        socket.write(buf)
        sentCount++
      } catch {
        /* ignore individual write errors; socket 'error' event will report */
      }
    }
  }

  return {
    ok: sentCount > 0,
    sentCount,
    byteLength: buf.length,
    hex: bufferToHex(buf),
    error: sentCount === 0 ? 'Failed to write to connected client(s)' : undefined,
  }
}

export function shutdownTcpServerSync(): void {
  for (const { socket } of clients.values()) {
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
  }
  clients.clear()
  if (server) {
    try {
      server.close()
    } catch {
      /* ignore */
    }
    server = null
  }
  listenPort = null
}
