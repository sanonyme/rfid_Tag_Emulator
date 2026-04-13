import http from 'http'
import https from 'https'
import net from 'net'
import type { WebContents } from 'electron'
import {
  enumerateAllLocalSubnetsMerged,
  enumerateCidr,
  enumerateIpRange,
} from './net-scan-handler.js'

export type ReaderVendor = 'impinj' | 'seuic' | 'unknown'

export interface ReaderDiscoveryResult {
  ip: string
  vendor: ReaderVendor
  confidence: 'low' | 'medium' | 'high'
  openPorts: number[]
  reason: string
  title?: string
  server?: string
  url?: string
}

export type ReaderDiscoveryPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'allSubnets'; concurrency?: number; timeoutMs?: number }

const DEFAULT_PORTS = [5084, 5085, 80, 443, 23]
const MAX_HOSTS = 4094

let activeController: AbortController | null = null

function parseTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return undefined
  return m[1]?.replace(/\s+/g, ' ').trim() || undefined
}

function keywordsForVendorBlob(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function tcpProbe(ip: string, port: number, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }

    const sock = new net.Socket()
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve(ok)
    }

    const onAbort = () => finish(false)
    signal.addEventListener('abort', onAbort, { once: true })

    sock.setTimeout(timeoutMs)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => finish(false))
    sock.once('close', () => signal.removeEventListener('abort', onAbort))
    sock.connect(port, ip)
  })
}

type HttpProbe = { title?: string; server?: string; status?: number; bodySnippet?: string; url: string }

function httpProbe(
  ip: string,
  secure: boolean,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<HttpProbe | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null)
      return
    }
    const lib = secure ? https : http
    const url = `${secure ? 'https' : 'http'}://${ip}/`
    const req = lib.request(
      {
        host: ip,
        port: secure ? 443 : 80,
        path: '/',
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => {
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)))
          const total = chunks.reduce((n, b) => n + b.length, 0)
          if (total > 8192) {
            try {
              req.destroy()
            } catch {
              /* ignore */
            }
          }
        })
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({
            title: parseTitle(body),
            server: String(res.headers.server ?? ''),
            status: res.statusCode,
            bodySnippet: body.slice(0, 2048),
            url,
          })
        })
      },
    )
    req.on('timeout', () => {
      try {
        req.destroy()
      } catch {
        /* ignore */
      }
      resolve(null)
    })
    req.on('error', () => resolve(null))
    const onAbort = () => {
      try {
        req.destroy()
      } catch {
        /* ignore */
      }
      resolve(null)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    req.on('close', () => signal.removeEventListener('abort', onAbort))
    req.end()
  })
}

function resolveIps(payload: ReaderDiscoveryPayload): { ips: string[] } | { error: string } {
  if (payload.mode === 'cidr') {
    const ips = enumerateCidr(payload.cidr)
    if (!ips?.length) return { error: 'Invalid CIDR. Example: 192.168.1.0/24' }
    return { ips }
  }
  if (payload.mode === 'range') {
    const ips = enumerateIpRange(payload.start, payload.end)
    if (!ips?.length) return { error: 'Invalid IP range. Example: 192.168.1.1 - 192.168.1.254' }
    return { ips }
  }
  const ips = enumerateAllLocalSubnetsMerged()
  if (!ips?.length) return { error: 'No scannable local subnets found.' }
  if (ips.length > MAX_HOSTS) return { error: 'Too many hosts in merged subnets. Use CIDR or range.' }
  return { ips }
}

function fingerprintReader(
  ip: string,
  openPorts: number[],
  httpInfo: HttpProbe | null,
  httpsInfo: HttpProbe | null,
): ReaderDiscoveryResult | null {
  const llrpOpen = openPorts.includes(5084) || openPorts.includes(5085)
  const httpBlob = keywordsForVendorBlob(
    httpInfo?.title,
    httpInfo?.server,
    httpInfo?.bodySnippet,
    httpsInfo?.title,
    httpsInfo?.server,
    httpsInfo?.bodySnippet,
  )

  const impinjHit =
    llrpOpen ||
    httpBlob.includes('impinj') ||
    httpBlob.includes('speedway') ||
    httpBlob.includes('r700') ||
    httpBlob.includes('xarray')

  const seuicHit =
    httpBlob.includes('seuic') ||
    httpBlob.includes('autoid') ||
    httpBlob.includes('uf3') ||
    httpBlob.includes('uf40')

  if (!impinjHit && !seuicHit) return null

  if (impinjHit && !seuicHit) {
    return {
      ip,
      vendor: 'impinj',
      confidence: llrpOpen && httpBlob.includes('impinj') ? 'high' : llrpOpen ? 'medium' : 'low',
      openPorts,
      reason: llrpOpen
        ? 'LLRP port detected (5084/5085) with Impinj-like service fingerprints.'
        : 'HTTP/HTTPS fingerprint matched Impinj-related keywords.',
      title: httpsInfo?.title || httpInfo?.title,
      server: httpsInfo?.server || httpInfo?.server,
      url: httpsInfo?.status ? httpsInfo.url : httpInfo?.status ? httpInfo.url : undefined,
    }
  }

  if (seuicHit && !impinjHit) {
    return {
      ip,
      vendor: 'seuic',
      confidence: httpBlob.includes('seuic') ? 'high' : 'medium',
      openPorts,
      reason: 'HTTP/HTTPS fingerprint matched SEUIC/AUTOID-related keywords.',
      title: httpsInfo?.title || httpInfo?.title,
      server: httpsInfo?.server || httpInfo?.server,
      url: httpsInfo?.status ? httpsInfo.url : httpInfo?.status ? httpInfo.url : undefined,
    }
  }

  return {
    ip,
    vendor: 'unknown',
    confidence: 'low',
    openPorts,
    reason: 'Mixed fingerprints detected (possible OEM/bridged reader).',
    title: httpsInfo?.title || httpInfo?.title,
    server: httpsInfo?.server || httpInfo?.server,
    url: httpsInfo?.status ? httpsInfo.url : httpInfo?.status ? httpInfo.url : undefined,
  }
}

async function runPool(
  ips: string[],
  limit: number,
  signal: AbortSignal,
  worker: (ip: string) => Promise<void>,
): Promise<void> {
  let index = 0
  async function slot() {
    while (!signal.aborted) {
      const i = index++
      if (i >= ips.length) break
      await worker(ips[i]!)
    }
  }
  const n = Math.min(Math.max(1, limit), ips.length)
  await Promise.all(Array.from({ length: n }, () => slot()))
}

export function cancelReaderDiscovery(): void {
  activeController?.abort()
  activeController = null
}

export function startReaderDiscovery(
  wc: WebContents,
  payload: ReaderDiscoveryPayload,
): { ok: true; total: number } | { ok: false; error: string } {
  if (activeController) {
    return { ok: false, error: 'Reader discovery already running. Stop it first.' }
  }

  const resolved = resolveIps(payload)
  if ('error' in resolved) return { ok: false, error: resolved.error }
  const ips = resolved.ips
  const total = ips.length
  const concurrency = Math.min(80, Math.max(1, payload.concurrency ?? 48))
  const timeoutMs = Math.min(8000, Math.max(400, payload.timeoutMs ?? 1200))

  const ac = new AbortController()
  activeController = ac
  const signal = ac.signal

  void (async () => {
    let done = 0
    let found = 0
    try {
      await runPool(ips, concurrency, signal, async (ip) => {
        if (signal.aborted || wc.isDestroyed()) return
        const openFlags = await Promise.all(DEFAULT_PORTS.map((p) => tcpProbe(ip, p, timeoutMs, signal)))
        const openPorts = DEFAULT_PORTS.filter((_p, idx) => openFlags[idx])
        let httpInfo: HttpProbe | null = null
        let httpsInfo: HttpProbe | null = null
        if (openPorts.includes(80)) httpInfo = await httpProbe(ip, false, timeoutMs, signal)
        if (openPorts.includes(443)) httpsInfo = await httpProbe(ip, true, timeoutMs, signal)

        const reader = fingerprintReader(ip, openPorts, httpInfo, httpsInfo)
        done += 1
        if (reader) found += 1
        if (!wc.isDestroyed()) {
          wc.send('reader-discovery-host', {
            ip,
            done,
            total,
            found,
            openPorts,
            reader,
          })
        }
      })
      if (!signal.aborted && !wc.isDestroyed()) {
        wc.send('reader-discovery-done', { total, found })
      }
    } catch (e) {
      if (!wc.isDestroyed()) {
        wc.send('reader-discovery-error', {
          message: e instanceof Error ? e.message : String(e),
        })
      }
    } finally {
      if (activeController === ac) activeController = null
    }
  })()

  return { ok: true, total }
}
