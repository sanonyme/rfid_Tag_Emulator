import { createHash, createHmac, randomBytes } from 'node:crypto'
import dns from 'node:dns'
import fs from 'node:fs'
import net from 'node:net'
import { Notification, shell } from 'electron'
import { Client as SshClient, type ConnectConfig } from 'ssh2'
import WebSocket from 'ws'

const MAX_OUTPUT_BYTES = 256 * 1024

export interface SshExecPayload {
  host: string
  port?: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  command: string
  timeoutMs?: number
}

export type SshExecResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number }
  | { ok: false; error: string }

/**
 * Execute a single remote command over SSH (`ssh2`) with password or private-key auth.
 */
export async function runSshExec(payload: SshExecPayload): Promise<SshExecResult> {
  const host = String(payload.host || '').trim()
  const username = String(payload.username || '').trim()
  const command = String(payload.command || '')
  const port = Math.min(65535, Math.max(1, Number(payload.port) || 22))
  const timeoutMs = Math.min(120_000, Math.max(1000, Number(payload.timeoutMs) || 15_000))

  if (!host) return { ok: false, error: 'SSH host is required' }
  if (!username) return { ok: false, error: 'SSH username is required' }
  if (!command.trim()) return { ok: false, error: 'SSH command is required' }

  let privateKey: Buffer | undefined
  if (payload.privateKeyPath?.trim()) {
    const keyPath = payload.privateKeyPath.trim()
    if (!fs.existsSync(keyPath)) {
      return { ok: false, error: `Private key file not found: ${keyPath}` }
    }
    privateKey = fs.readFileSync(keyPath)
  }

  return new Promise<SshExecResult>((resolve) => {
    const conn = new SshClient()
    let settled = false
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    const finish = (res: SshExecResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        conn.end()
      } catch {
        /* ignore */
      }
      resolve(res)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: `SSH command timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            finish({ ok: false, error: err.message || String(err) })
            return
          }
          stream
            .on('close', (code: number | null) => {
              exitCode = typeof code === 'number' ? code : 0
              finish({ ok: true, stdout, stderr, exitCode })
            })
            .on('data', (chunk: Buffer) => {
              if (stdout.length < MAX_OUTPUT_BYTES) {
                stdout = (stdout + chunk.toString('utf8')).slice(0, MAX_OUTPUT_BYTES)
              }
            })
            .stderr.on('data', (chunk: Buffer) => {
              if (stderr.length < MAX_OUTPUT_BYTES) {
                stderr = (stderr + chunk.toString('utf8')).slice(0, MAX_OUTPUT_BYTES)
              }
            })
        })
      })
      .on('error', (err) => {
        finish({ ok: false, error: err.message || String(err) })
      })

    const cfg: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: Math.min(timeoutMs, 30_000),
      ...(privateKey ? { privateKey, passphrase: payload.passphrase || undefined } : {}),
      ...(payload.password ? { password: payload.password } : {}),
    }

    try {
      conn.connect(cfg)
    } catch (err: any) {
      finish({ ok: false, error: err?.message || String(err) })
    }
  })
}

export interface NetworkProbePayload {
  mode: 'tcp' | 'http' | 'dns'
  host: string
  port?: number
  url?: string
  expectedStatus?: number
  timeoutMs?: number
}

export type NetworkProbeResult =
  | {
      ok: true
      alive: boolean
      latencyMs: number
      status?: number
      resolvedIp?: string
      addresses?: string[]
      detail: string
    }
  | { ok: false; error: string }

/**
 * Probe TCP port reachability, HTTP endpoint health, or DNS resolution.
 */
export async function runNetworkProbe(payload: NetworkProbePayload): Promise<NetworkProbeResult> {
  const mode = payload.mode || 'tcp'
  const timeoutMs = Math.min(60_000, Math.max(200, Number(payload.timeoutMs) || 5000))
  const t0 = performance.now()

  if (mode === 'dns') {
    const host = String(payload.host || '').trim()
    if (!host) return { ok: false, error: 'Hostname is required for DNS lookup' }
    try {
      const results = await dns.promises.lookup(host, { all: true })
      const addresses = results.map((r) => r.address)
      const resolvedIp = addresses[0] ?? ''
      const latencyMs = Math.max(0, Math.round(performance.now() - t0))
      return {
        ok: true,
        alive: addresses.length > 0,
        latencyMs,
        resolvedIp,
        addresses,
        detail: addresses.length > 0 ? `${host} → ${addresses.join(', ')}` : `No addresses for ${host}`,
      }
    } catch (err: any) {
      const latencyMs = Math.max(0, Math.round(performance.now() - t0))
      return {
        ok: true,
        alive: false,
        latencyMs,
        resolvedIp: '',
        addresses: [],
        detail: err?.message || String(err),
      }
    }
  }

  if (mode === 'http') {
    const url = String(payload.url || payload.host || '').trim()
    if (!url) return { ok: false, error: 'URL is required for HTTP health probe' }
    const expected = Number(payload.expectedStatus)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal })
      clearTimeout(timer)
      const latencyMs = Math.max(0, Math.round(performance.now() - t0))
      const alive =
        Number.isFinite(expected) && expected > 0 ? res.status === expected : res.ok
      return {
        ok: true,
        alive,
        latencyMs,
        status: res.status,
        detail: `HTTP ${res.status} ${res.statusText} (${latencyMs}ms)`,
      }
    } catch (err: any) {
      clearTimeout(timer)
      const latencyMs = Math.max(0, Math.round(performance.now() - t0))
      return {
        ok: true,
        alive: false,
        latencyMs,
        status: 0,
        detail: err?.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : err?.message || String(err),
      }
    }
  }

  // mode === 'tcp'
  const host = String(payload.host || '').trim()
  const port = Number(payload.port)
  if (!host) return { ok: false, error: 'Host is required for TCP port probe' }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: `Invalid TCP port: ${payload.port}` }
  }

  return new Promise<NetworkProbeResult>((resolve) => {
    let settled = false
    const socket = net.createConnection({ host, port })
    const done = (alive: boolean, detail: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {
        /* ignore */
      }
      const latencyMs = Math.max(0, Math.round(performance.now() - t0))
      resolve({ ok: true, alive, latencyMs, detail })
    }

    const timer = setTimeout(() => {
      done(false, `${host}:${port} timed out after ${timeoutMs}ms`)
    }, timeoutMs)

    socket.once('connect', () => done(true, `${host}:${port} open`))
    socket.once('error', (err) => done(false, err.message || String(err)))
  })
}

export interface WebSocketRequestPayload {
  url: string
  headers?: Record<string, string>
  sendMessage?: string
  waitForMessage?: boolean
  matchRegex?: string
  timeoutMs?: number
}

export type WebSocketRequestResult =
  | { ok: true; received?: string; latencyMs: number }
  | { ok: false; error: string }

/**
 * Connect to a WebSocket endpoint, optionally send a payload, and optionally await a matching reply.
 */
export async function runWebSocketRequest(
  payload: WebSocketRequestPayload,
): Promise<WebSocketRequestResult> {
  const url = String(payload.url || '').trim()
  if (!url) return { ok: false, error: 'WebSocket URL is required' }
  if (!/^wss?:\/\//i.test(url)) {
    return { ok: false, error: 'WebSocket URL must start with ws:// or wss://' }
  }

  let regex: RegExp | null = null
  if (payload.matchRegex?.trim()) {
    try {
      regex = new RegExp(payload.matchRegex.trim())
    } catch (err: any) {
      return { ok: false, error: `Invalid match regex: ${err?.message || err}` }
    }
  }

  const timeoutMs = Math.min(60_000, Math.max(500, Number(payload.timeoutMs) || 8000))
  const t0 = performance.now()

  return new Promise<WebSocketRequestResult>((resolve) => {
    let settled = false
    let ws: WebSocket | null = null

    const finish = (res: WebSocketRequestResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      resolve(res)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: `WebSocket timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    try {
      ws = new WebSocket(url, { headers: payload.headers })
    } catch (err: any) {
      finish({ ok: false, error: err?.message || String(err) })
      return
    }

    ws.once('open', () => {
      if (payload.sendMessage !== undefined && payload.sendMessage !== '') {
        ws!.send(payload.sendMessage)
      }
      if (!payload.waitForMessage) {
        finish({ ok: true, latencyMs: Math.max(0, Math.round(performance.now() - t0)) })
      }
    })

    ws.on('message', (data) => {
      if (!payload.waitForMessage) return
      const text = typeof data === 'string' ? data : data.toString('utf8')
      if (!regex || regex.test(text)) {
        finish({
          ok: true,
          received: text,
          latencyMs: Math.max(0, Math.round(performance.now() - t0)),
        })
      }
    })

    ws.once('error', (err) => {
      finish({ ok: false, error: err?.message || String(err) })
    })

    ws.once('close', (code, reason) => {
      if (!settled && payload.waitForMessage) {
        finish({
          ok: false,
          error: `WebSocket closed before message received (${code}${reason?.length ? `: ${reason.toString()}` : ''})`,
        })
      }
    })
  })
}

export interface CryptoHashPayload {
  op: 'sha256' | 'sha512' | 'sha1' | 'md5' | 'hmacSha256' | 'hmacSha512' | 'randomToken'
  input?: string
  secret?: string
  byteLength?: number
}

export function runCryptoHash(
  payload: CryptoHashPayload,
): { ok: true; output: string } | { ok: false; error: string } {
  try {
    const input = String(payload.input ?? '')
    const secret = String(payload.secret ?? '')
    switch (payload.op) {
      case 'sha256':
      case 'sha512':
      case 'sha1':
      case 'md5':
        return { ok: true, output: createHash(payload.op).update(input, 'utf8').digest('hex') }
      case 'hmacSha256':
        return { ok: true, output: createHmac('sha256', secret).update(input, 'utf8').digest('hex') }
      case 'hmacSha512':
        return { ok: true, output: createHmac('sha512', secret).update(input, 'utf8').digest('hex') }
      case 'randomToken': {
        const len = Math.min(256, Math.max(4, Math.floor(Number(payload.byteLength) || 24)))
        return { ok: true, output: randomBytes(len).toString('base64url') }
      }
      default:
        return { ok: false, error: `Unsupported crypto op: ${String(payload.op)}` }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function openSystemTarget(payload: {
  mode: 'url' | 'file' | 'reveal'
  target: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = String(payload.target || '').trim()
  if (!target) return { ok: false, error: 'Target URL or file path is required' }

  if (payload.mode === 'url') {
    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      return { ok: false, error: `Invalid URL: ${target}` }
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return { ok: false, error: `Unsupported URL protocol: ${parsed.protocol}` }
    }
    await shell.openExternal(target)
    return { ok: true }
  }

  if (!fs.existsSync(target)) {
    return { ok: false, error: `Path does not exist: ${target}` }
  }

  if (payload.mode === 'reveal') {
    shell.showItemInFolder(target)
    return { ok: true }
  }

  const err = await shell.openPath(target)
  if (err) return { ok: false, error: err }
  return { ok: true }
}

export function showDesktopNotification(payload: {
  title: string
  body: string
}): { ok: boolean; error?: string } {
  if (!Notification.isSupported()) {
    return { ok: false, error: 'Desktop notifications are not supported on this OS' }
  }
  const n = new Notification({
    title: String(payload.title || 'Zeus Automation'),
    body: String(payload.body || ''),
  })
  n.show()
  return { ok: true }
}
