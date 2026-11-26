import { createConnection, type Socket } from 'node:net'
import { broadcastToAllWindows } from './window-broadcast.js'
import { parseHexPayload } from './tcp-server-handler.js'

export interface CustomTcpClientStatus {
  connected: boolean
  host: string | null
  port: number | null
}

export interface CustomTcpClientDataEvent {
  host: string
  port: number
  text: string
  hex: string
  byteLength: number
  timestamp: number
}

export interface CustomTcpClientSendOptions {
  hex?: boolean
  lineEnding?: 'none' | 'lf' | 'crlf' | 'cr'
}

let socket: Socket | null = null
let connectedHost: string | null = null
let connectedPort: number | null = null
let isConnected = false

function bufferToHex(buf: Buffer): string {
  const parts: string[] = []
  for (let i = 0; i < buf.length; i++) {
    parts.push(buf[i].toString(16).toUpperCase().padStart(2, '0'))
  }
  return parts.join(' ')
}

function getLineEnding(mode?: CustomTcpClientSendOptions['lineEnding']): string {
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

export function getCustomTcpClientStatus(): CustomTcpClientStatus {
  return {
    connected: isConnected && Boolean(socket && !socket.destroyed),
    host: connectedHost,
    port: connectedPort,
  }
}

function emitStatus(): void {
  broadcastToAllWindows('tcp-client-status', getCustomTcpClientStatus())
}

export function connectCustomTcpClient(
  host: string,
  port: number,
  timeoutMs: number = 5000,
): Promise<{ ok: boolean; status?: CustomTcpClientStatus; error?: string }> {
  return new Promise((resolve) => {
    const cleanHost = (host || '').trim()
    const portNum = Math.floor(Number(port))
    if (!cleanHost) {
      resolve({ ok: false, error: 'Host is empty' })
      return
    }
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      resolve({ ok: false, error: 'Invalid port number (1–65535)' })
      return
    }

    // Close any previous socket cleanly
    disconnectCustomTcpClientSync()

    const sock = createConnection({ host: cleanHost, port: portNum })
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: `Connection timed out (${cleanHost}:${portNum})` })
    }, timeoutMs)

    sock.once('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket = sock
      connectedHost = cleanHost
      connectedPort = portNum
      isConnected = true
      const status = getCustomTcpClientStatus()
      emitStatus()
      resolve({ ok: true, status })
    })

    sock.on('data', (chunk: Buffer) => {
      const event: CustomTcpClientDataEvent = {
        host: cleanHost,
        port: portNum,
        text: chunk.toString('utf8'),
        hex: bufferToHex(chunk),
        byteLength: chunk.length,
        timestamp: Date.now(),
      }
      broadcastToAllWindows('tcp-client-data', event)
    })

    sock.on('error', (err: NodeJS.ErrnoException) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        const friendly =
          err.code === 'ECONNREFUSED'
            ? `Connection refused (${cleanHost}:${portNum})`
            : err.code === 'ENOTFOUND'
              ? `Host not found (${cleanHost})`
              : err.message
        resolve({ ok: false, error: friendly })
      } else {
        broadcastToAllWindows('tcp-client-error', {
          message: err.message,
          timestamp: Date.now(),
        })
      }
    })

    sock.on('close', () => {
      const wasActive = socket === sock
      if (wasActive) {
        socket = null
        isConnected = false
        const prevHost = connectedHost
        const prevPort = connectedPort
        connectedHost = null
        connectedPort = null
        broadcastToAllWindows('tcp-client-disconnected', {
          host: prevHost,
          port: prevPort,
          timestamp: Date.now(),
        })
        emitStatus()
      }
    })
  })
}

export function disconnectCustomTcpClient(): { ok: boolean; status: CustomTcpClientStatus } {
  disconnectCustomTcpClientSync()
  const status = getCustomTcpClientStatus()
  emitStatus()
  return { ok: true, status }
}

export function disconnectCustomTcpClientSync(): void {
  if (socket) {
    const s = socket
    socket = null
    isConnected = false
    connectedHost = null
    connectedPort = null
    try {
      s.destroy()
    } catch {
      /* ignore */
    }
  } else {
    isConnected = false
    connectedHost = null
    connectedPort = null
  }
}

export function sendCustomTcpClientData(
  payload: string,
  options: CustomTcpClientSendOptions = {},
): { ok: boolean; byteLength?: number; hex?: string; error?: string } {
  if (!isConnected || !socket || socket.destroyed || !socket.writable) {
    return { ok: false, error: 'TCP client is not connected' }
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

  try {
    socket.write(buf)
    return { ok: true, byteLength: buf.length, hex: bufferToHex(buf) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface OneShotTcpOptions {
  hex?: boolean
  lineEnding?: 'none' | 'lf' | 'crlf' | 'cr'
  waitForResponse?: boolean
  timeoutMs?: number
}

/**
 * Connect to host:port, send one payload (ASCII with optional line ending, or HEX bytes),
 * optionally capture the first response chunk(s) until quiet/close/timeout, then close cleanly.
 * Does not disturb the persistent TCP Client connection shown in the TCP tab.
 */
export function sendOneShotTcpMessage(
  host: string,
  port: number,
  payload: string,
  options: OneShotTcpOptions = {},
): Promise<{
  ok: boolean
  byteLength?: number
  hex?: string
  responseText?: string
  responseHex?: string
  error?: string
}> {
  return new Promise((resolve) => {
    const cleanHost = (host || '').trim()
    const portNum = Math.floor(Number(port))
    if (!cleanHost) {
      resolve({ ok: false, error: 'Host is empty' })
      return
    }
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      resolve({ ok: false, error: 'Invalid port number (1–65535)' })
      return
    }

    let buf: Buffer
    if (options.hex) {
      const parsed = parseHexPayload(payload)
      if (!parsed.ok) {
        resolve({ ok: false, error: parsed.error })
        return
      }
      buf = parsed.buffer
    } else {
      buf = Buffer.from(payload + getLineEnding(options.lineEnding), 'utf8')
    }

    const waitForResponse = options.waitForResponse === true
    const timeoutMs = Math.max(200, Math.min(60000, options.timeoutMs ?? 3000))
    const sock = createConnection({ host: cleanHost, port: portNum })
    const rxChunks: Buffer[] = []
    let settled = false
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: {
      ok: boolean
      byteLength?: number
      hex?: string
      responseText?: string
      responseHex?: string
      error?: string
    }) => {
      if (settled) return
      settled = true
      clearTimeout(overallTimer)
      if (settleTimer) clearTimeout(settleTimer)
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    const overallTimer = setTimeout(() => {
      if (waitForResponse && rxChunks.length > 0) {
        const joined = Buffer.concat(rxChunks)
        finish({
          ok: true,
          byteLength: buf.length,
          hex: bufferToHex(buf),
          responseText: joined.toString('utf8'),
          responseHex: bufferToHex(joined),
        })
      } else if (waitForResponse) {
        finish({ ok: false, error: `Timed out waiting for TCP response (${timeoutMs}ms)` })
      } else {
        finish({ ok: false, error: `TCP connection timed out (${cleanHost}:${portNum})` })
      }
    }, timeoutMs)

    sock.once('connect', () => {
      sock.write(buf, (writeErr) => {
        if (writeErr) {
          finish({ ok: false, error: writeErr.message })
          return
        }
        if (!waitForResponse) {
          sock.end()
          finish({ ok: true, byteLength: buf.length, hex: bufferToHex(buf) })
        }
      })
    })

    sock.on('data', (chunk: Buffer) => {
      if (!waitForResponse) return
      rxChunks.push(chunk)
      if (settleTimer) clearTimeout(settleTimer)
      // Give peer 120ms for any trailing packets before completing capture
      settleTimer = setTimeout(() => {
        const joined = Buffer.concat(rxChunks)
        finish({
          ok: true,
          byteLength: buf.length,
          hex: bufferToHex(buf),
          responseText: joined.toString('utf8'),
          responseHex: bufferToHex(joined),
        })
      }, 120)
    })

    sock.once('end', () => {
      if (!waitForResponse) return
      const joined = Buffer.concat(rxChunks)
      finish({
        ok: true,
        byteLength: buf.length,
        hex: bufferToHex(buf),
        responseText: joined.toString('utf8'),
        responseHex: bufferToHex(joined),
      })
    })

    sock.once('error', (err: NodeJS.ErrnoException) => {
      const friendly =
        err.code === 'ECONNREFUSED'
          ? `Connection refused (${cleanHost}:${portNum})`
          : err.code === 'ENOTFOUND'
            ? `Host not found (${cleanHost})`
            : err.message
      finish({ ok: false, error: friendly })
    })
  })
}
