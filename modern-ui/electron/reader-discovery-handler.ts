import http from 'http'
import https from 'https'
import net from 'net'
import type { WebContents } from 'electron'
import {
  enumerateAllLocalSubnetsMerged,
  enumerateCidr,
  enumerateIpRange,
} from './net-scan-handler.js'

/**
 * Supported vendor slugs. Keep this aligned with preload.ts and electron.d.ts.
 * `generic` = looks like an RFID reader (LLRP/known port) but vendor not identified.
 * `unknown` = legacy value kept for back-compat.
 */
export type ReaderVendor =
  | 'impinj'
  | 'zebra'
  | 'alien'
  | 'thingmagic'
  | 'caen'
  | 'nordicid'
  | 'honeywell'
  | 'sick'
  | 'feig'
  | 'kathrein'
  | 'csl'
  | 'invengo'
  | 'nedap'
  | 'turck'
  | 'balluff'
  | 'seuic'
  | 'siemens'
  | 'chainway'
  | 'bluebird'
  | 'chafon'
  | 'datalogic'
  | 'generic'
  | 'unknown'

export interface ReaderDiscoveryResult {
  ip: string
  vendor: ReaderVendor
  vendorLabel: string
  confidence: 'low' | 'medium' | 'high'
  openPorts: number[]
  reason: string
  title?: string
  server?: string
  url?: string
  /** IANA Private Enterprise Number extracted from an LLRP probe (if any). */
  pen?: number
}

export type ReaderDiscoveryPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'allSubnets'; concurrency?: number; timeoutMs?: number }

/**
 * Ports probed per host. Kept small so scans stay fast.
 *  - 5084/5085 : LLRP (EPCglobal) — the universal UHF reader protocol (Impinj, Zebra,
 *                Alien, ThingMagic, CAEN, Nordic ID, CSL, Kathrein, Invengo, Chafon, ...)
 *  - 80/443    : web admin UI (used by nearly every modern reader)
 *  - 23        : telnet console (Alien, older Impinj, Intermec/Honeywell, Zebra)
 *  - 10001     : Feig OBID, Balluff, Turck, and several serial-over-TCP readers
 *  - 14150     : Impinj ItemSense / R700 REST-ish ports and some OEM readers
 */
const DEFAULT_PORTS = [5084, 5085, 80, 443, 23, 10001, 14150]
const MAX_HOSTS = 4094

let activeController: AbortController | null = null

/**
 * Vendor fingerprint dictionary. Keywords are checked (case-insensitive) against the
 * combined HTTP/HTTPS `server` header, `<title>` tag and a short body snippet for each
 * host. Sources: each vendor's public reader datasheets, firmware landing pages, and
 * default web UI titles observed in the wild.
 */
interface VendorDef {
  slug: ReaderVendor
  label: string
  keywords: string[]
}

const VENDORS: VendorDef[] = [
  {
    slug: 'impinj',
    label: 'Impinj',
    keywords: [
      'impinj',
      'speedway',
      'octane',
      'r700',
      'r720',
      'r420',
      'r120',
      'xarray',
      'xspan',
      'xportal',
      'itemsense',
    ],
  },
  {
    slug: 'zebra',
    label: 'Zebra / Motorola',
    keywords: [
      'zebra technologies',
      'zebra rfid',
      'motorola solutions',
      'symbol technologies',
      'fx7500',
      'fx9500',
      'fx9600',
      'fx7400',
      'atr7000',
      'rfd8500',
      'rfd40',
      'rfd90',
      'mc3300r',
      'mc3390r',
    ],
  },
  {
    slug: 'alien',
    label: 'Alien Technology',
    keywords: [
      'alien technology',
      'alien rfid',
      'alr-9900',
      'alr-9680',
      'alr-9650',
      'alr-f800',
      'alr-h450',
      'alr9900',
      'alrh450',
    ],
  },
  {
    slug: 'thingmagic',
    label: 'ThingMagic / JADAK',
    keywords: [
      'thingmagic',
      'jadak',
      'mercury6',
      'mercuryapi',
      'sargas',
      'izar',
      'astra-ex',
      'astra ex',
      'm6e',
      'm7e',
    ],
  },
  {
    slug: 'caen',
    label: 'CAEN RFID',
    keywords: ['caen rfid', 'caenrfid', 'hadron', 'ion rfid', 'proton rfid', 'quark', 'muon'],
  },
  {
    slug: 'nordicid',
    label: 'Nordic ID',
    keywords: ['nordic id', 'nordicid', 'sampo s2', 'sampo s3', 'nordic-id'],
  },
  {
    slug: 'honeywell',
    label: 'Honeywell / Intermec',
    keywords: ['honeywell rfid', 'intermec', 'if2 ', 'if5 ', 'if30', 'if61'],
  },
  {
    slug: 'sick',
    label: 'SICK',
    keywords: ['sick ag', 'sick rfid', 'rfu620', 'rfu630', 'rfu65', 'rfh620', 'rfh6'],
  },
  {
    slug: 'feig',
    label: 'FEIG OBID',
    keywords: [
      'feig electronic',
      'feig ',
      'obid',
      'id isc',
      'isc.lru',
      'isc.mru',
      'id cpr',
      'idisc',
    ],
  },
  {
    slug: 'kathrein',
    label: 'Kathrein Solutions',
    keywords: ['kathrein', 'aru 2400', 'aru 3500', 'aru 2560', 'kathrein solutions'],
  },
  {
    slug: 'csl',
    label: 'CSL (Convergence Systems)',
    keywords: ['convergence systems', 'csl rfid', 'cs203', 'cs463', 'cs468', 'cs108', 'cs710s'],
  },
  {
    slug: 'invengo',
    label: 'Invengo',
    keywords: ['invengo', 'xc-rf8', 'xc-af1', 'xcra', 'xc-af'],
  },
  {
    slug: 'nedap',
    label: 'Nedap',
    keywords: ['nedap', 'upass', 'transit standard', 'transit ultimate', 'transit entry'],
  },
  {
    slug: 'turck',
    label: 'Turck',
    keywords: ['turck', 'tn-uhf', 'tn-q', 'bl ident'],
  },
  {
    slug: 'balluff',
    label: 'Balluff',
    keywords: ['balluff', 'bis v', 'bis u', 'bis m'],
  },
  {
    slug: 'seuic',
    label: 'SEUIC / AUTOID',
    keywords: ['seuic', 'autoid', 'uf3', 'uf40', 'uf42', 'uf31'],
  },
  {
    slug: 'siemens',
    label: 'Siemens SIMATIC RF',
    keywords: ['simatic rf', 'siemens rfid', 'simatic rf600', 'simatic rf200'],
  },
  {
    slug: 'chainway',
    label: 'Chainway',
    keywords: ['chainway', 'urx', 'ur4', 'uhf reader chainway'],
  },
  {
    slug: 'bluebird',
    label: 'Bluebird / Pidion',
    keywords: ['bluebird', 'pidion'],
  },
  {
    slug: 'chafon',
    label: 'Chafon',
    keywords: ['chafon', 'cf-ru', 'cf-rxxx'],
  },
  {
    slug: 'datalogic',
    label: 'Datalogic',
    keywords: ['datalogic rfid', 'datalogic scanning', 'dl-rfid'],
  },
]

/**
 * Generic "looks like an RFID reader" hints we try last. These confirm a reader
 * even when the specific vendor can't be identified (white-label / OEM units are
 * extremely common).
 */
const GENERIC_HINTS = [
  'llrp',
  'uhf reader',
  'uhf rfid',
  'rfid reader',
  'rain rfid',
  'epcglobal',
  'epc gen2',
  'gen2 reader',
  'tag reader',
  'rfid-reader',
  'rfid gateway',
  'fixed reader',
]

/**
 * IANA Private Enterprise Numbers (PEN) reported by RFID readers in the
 * GeneralDeviceCapabilities → DeviceManufacturerName field of
 * GET_READER_CAPABILITIES_RESPONSE. This is the most reliable vendor identifier
 * on LLRP — it's set in firmware and doesn't depend on web UI branding.
 *
 *   Impinj, Inc.             25882
 *   Motorola (Zebra RFID)      161
 *   Zebra Technologies         388
 *   Alien Technology         17996
 *   ThingMagic / JADAK       14958
 *   CAEN RFID S.r.l.         10789
 *   Nordic ID                20232
 *   Honeywell (Intermec)      1571
 *   FEIG Electronic          10617
 *   Kathrein-Werke KG         9525
 *   CSL (Convergence)        26554
 *   Invengo                  34750
 */
const PEN_MAP: Array<{ pen: number; vendor: ReaderVendor }> = [
  { pen: 25882, vendor: 'impinj' },
  { pen: 161, vendor: 'zebra' },
  { pen: 388, vendor: 'zebra' },
  { pen: 17996, vendor: 'alien' },
  { pen: 14958, vendor: 'thingmagic' },
  { pen: 10789, vendor: 'caen' },
  { pen: 20232, vendor: 'nordicid' },
  { pen: 1571, vendor: 'honeywell' },
  { pen: 10617, vendor: 'feig' },
  { pen: 9525, vendor: 'kathrein' },
  { pen: 26554, vendor: 'csl' },
  { pen: 34750, vendor: 'invengo' },
]

function scanForPen(buf: Buffer): { pen: number; vendor: ReaderVendor } | null {
  // Only scan the first ~512 bytes — the DeviceManufacturerName field sits near
  // the start of GeneralDeviceCapabilities, well before vendor-extension blobs.
  const limit = Math.min(buf.length, 512)
  for (const entry of PEN_MAP) {
    // Walk the buffer looking for the big-endian 4-byte PEN. We require the two
    // high bytes to be 0x00 0x00 because all registered IANA PENs fit in 24 bits,
    // which makes random collisions very unlikely.
    for (let i = 0; i + 4 <= limit; i++) {
      if (buf[i] !== 0x00 || buf[i + 1] !== 0x00) continue
      const val = (buf[i + 2]! << 8) | buf[i + 3]!
      if (val === entry.pen) return entry
    }
  }
  return null
}

/**
 * LLRP vendor probe. Opens port 5084, sends GET_READER_CAPABILITIES(All) and
 * inspects the response for an IANA PEN. Falls back to null on any error.
 *
 * GET_READER_CAPABILITIES wire format (LLRP v1.1):
 *   [rsvd(3)|ver(3)|type(10)] = 0x0401  (version=1, type=1)
 *   [length(32)]              = 0x0000000B (11 bytes total)
 *   [messageID(32)]           = 0x00000001
 *   [RequestedData(8)]        = 0x00 (All)
 */
function llrpVendorProbe(
  ip: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ pen: number; vendor: ReaderVendor } | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null)
      return
    }
    const sock = new net.Socket()
    let done = false
    let buf = Buffer.alloc(0)
    const finish = (v: { pen: number; vendor: ReaderVendor } | null) => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        /* ignore */
      }
      resolve(v)
    }
    const onAbort = () => finish(null)
    signal.addEventListener('abort', onAbort, { once: true })
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => {
      const msg = Buffer.from([0x04, 0x01, 0x00, 0x00, 0x00, 0x0b, 0x00, 0x00, 0x00, 0x01, 0x00])
      try {
        sock.write(msg)
      } catch {
        finish(null)
      }
    })
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const hit = scanForPen(buf)
      if (hit) {
        finish(hit)
        return
      }
      if (buf.length > 4096) finish(null)
    })
    sock.once('timeout', () => finish(scanForPen(buf)))
    sock.once('error', () => finish(null))
    sock.once('close', () => {
      signal.removeEventListener('abort', onAbort)
      finish(scanForPen(buf))
    })
    sock.connect(5084, ip)
  })
}

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

type HttpProbe = {
  title?: string
  server?: string
  status?: number
  bodySnippet?: string
  /** Raw "Name: value\n…" dump of every response header, used for fingerprinting. */
  headersBlob?: string
  url: string
}

/** Paths probed in order. Most readers reveal themselves at `/`, but Impinj
 * Speedway sends `WWW-Authenticate: Basic realm="Impinj Reader"` on `/cgi-bin/`
 * and Impinj R700 exposes JSON model info at `/api/v1/system/info`. */
const HTTP_PATHS = ['/', '/cgi-bin/login.cgi', '/web/', '/api/v1/system/info']

function httpProbeOnce(
  ip: string,
  secure: boolean,
  path: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<HttpProbe | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null)
      return
    }
    const lib = secure ? https : http
    const url = `${secure ? 'https' : 'http'}://${ip}${path}`
    const req = lib.request(
      {
        host: ip,
        port: secure ? 443 : 80,
        path,
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
        // Allow older RFID readers that still ship TLS 1.0 firmware (Speedway,
        // some Alien / CAEN units) to complete the handshake.
        ...(secure ? { minVersion: 'TLSv1' as const } : {}),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => {
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)))
          const total = chunks.reduce((n, b) => n + b.length, 0)
          if (total > 16384) {
            try {
              req.destroy()
            } catch {
              /* ignore */
            }
          }
        })
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          const headersBlob = Object.entries(res.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v ?? ''}`)
            .join('\n')
          resolve({
            title: parseTitle(body),
            server: String(res.headers.server ?? ''),
            status: res.statusCode,
            bodySnippet: body.slice(0, 4096),
            headersBlob,
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

/** Vendor keyword hunt across a probe's headers+title+body. */
function probeMentionsVendor(p: HttpProbe | null): boolean {
  if (!p) return false
  const blob = keywordsForVendorBlob(p.title, p.server, p.bodySnippet, p.headersBlob)
  for (const v of VENDORS) for (const k of v.keywords) if (blob.includes(k)) return true
  return false
}

/** Probe `/` first; if the response doesn't mention any known vendor, try a few
 * well-known reader admin paths to surface `WWW-Authenticate` realms, login
 * page titles, or JSON system-info responses. */
async function httpProbe(
  ip: string,
  secure: boolean,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<HttpProbe | null> {
  let best: HttpProbe | null = null
  for (const path of HTTP_PATHS) {
    if (signal.aborted) break
    const p = await httpProbeOnce(ip, secure, path, timeoutMs, signal)
    if (!p) continue
    if (!best) best = p
    if (probeMentionsVendor(p)) {
      // Prefer the vendor-revealing response, but keep server/title from the
      // root if the vendor path returned a JSON-only body.
      return {
        ...p,
        title: p.title || best.title,
        server: p.server || best.server,
      }
    }
  }
  return best
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

function countKeywordHits(blob: string, keywords: string[]): { score: number; hits: string[] } {
  const hits: string[] = []
  for (const k of keywords) {
    if (blob.includes(k)) hits.push(k)
  }
  return { score: hits.length, hits }
}

function fingerprintReader(
  ip: string,
  openPorts: number[],
  httpInfo: HttpProbe | null,
  httpsInfo: HttpProbe | null,
  llrpHit: { pen: number; vendor: ReaderVendor } | null,
): ReaderDiscoveryResult | null {
  const llrpOpen = openPorts.includes(5084) || openPorts.includes(5085)
  const feigOpen = openPorts.includes(10001)
  const impinjRestOpen = openPorts.includes(14150)

  const blob = keywordsForVendorBlob(
    httpInfo?.title,
    httpInfo?.server,
    httpInfo?.bodySnippet,
    httpInfo?.headersBlob,
    httpsInfo?.title,
    httpsInfo?.server,
    httpsInfo?.bodySnippet,
    httpsInfo?.headersBlob,
  )

  // Score every known vendor by keyword hits and pick the best match.
  let best: { vendor: VendorDef; score: number; hits: string[] } | null = null
  for (const v of VENDORS) {
    const { score, hits } = countKeywordHits(blob, v.keywords)
    if (score > 0 && (!best || score > best.score)) {
      best = { vendor: v, score, hits }
    }
  }

  const genericHint = GENERIC_HINTS.some((k) => blob.includes(k))
  const title = httpsInfo?.title || httpInfo?.title
  const server = httpsInfo?.server || httpInfo?.server
  const url = httpsInfo?.status ? httpsInfo.url : httpInfo?.status ? httpInfo.url : undefined

  // LLRP PEN is the strongest signal — it comes from the reader firmware itself,
  // so when present it always wins over HTTP keyword guessing. Look up the label
  // from VENDORS so Impinj/Zebra/etc. get their friendly names.
  if (llrpHit) {
    const def = VENDORS.find((v) => v.slug === llrpHit.vendor)
    const reasons: string[] = [
      `LLRP reported vendor via IANA PEN ${llrpHit.pen} → ${def?.label ?? llrpHit.vendor}`,
    ]
    if (best && best.vendor.slug === llrpHit.vendor) {
      reasons.push(`HTTP fingerprint also matched: ${best.hits.slice(0, 3).join(', ')}`)
    } else if (best) {
      reasons.push(`(HTTP hinted ${best.vendor.label}, but LLRP PEN is authoritative)`)
    }
    return {
      ip,
      vendor: llrpHit.vendor,
      vendorLabel: def?.label ?? llrpHit.vendor,
      confidence: 'high',
      openPorts,
      reason: reasons.join('; '),
      title,
      server,
      url,
      pen: llrpHit.pen,
    }
  }

  if (best) {
    // Known vendor match: LLRP open + vendor keywords → high; vendor keywords only → medium;
    // weak single hit without LLRP → medium still feels right since human-readable brand names
    // are unusual false positives.
    const confidence: ReaderDiscoveryResult['confidence'] =
      llrpOpen && best.score >= 1 ? 'high' : best.score >= 2 ? 'high' : best.score >= 1 ? 'medium' : 'low'
    const reasons: string[] = []
    if (llrpOpen) reasons.push('LLRP port (5084/5085) open')
    if (feigOpen && best.vendor.slug === 'feig') reasons.push('Feig/OBID port 10001 open')
    if (impinjRestOpen && best.vendor.slug === 'impinj') reasons.push('Impinj port 14150 open')
    reasons.push(`matched ${best.vendor.label} keyword${best.hits.length > 1 ? 's' : ''}: ${best.hits.slice(0, 3).join(', ')}`)
    return {
      ip,
      vendor: best.vendor.slug,
      vendorLabel: best.vendor.label,
      confidence,
      openPorts,
      reason: reasons.join('; '),
      title,
      server,
      url,
    }
  }

  // No vendor keyword matched. Fall back to protocol/port-based detection so any
  // RFID reader gets reported (white-label / OEM / Chinese no-name readers).
  if (llrpOpen) {
    return {
      ip,
      vendor: 'generic',
      vendorLabel: 'Generic RFID reader',
      confidence: 'medium',
      openPorts,
      reason:
        'LLRP port (5084/5085) open — RAIN/UHF RFID reader likely. Vendor could not be identified from HTTP fingerprint.',
      title,
      server,
      url,
    }
  }

  if (feigOpen && (openPorts.includes(80) || openPorts.includes(443))) {
    return {
      ip,
      vendor: 'generic',
      vendorLabel: 'Generic RFID reader',
      confidence: 'low',
      openPorts,
      reason:
        'Port 10001 open alongside web UI — often used by Feig/Balluff/Turck readers or serial-over-TCP RFID devices.',
      title,
      server,
      url,
    }
  }

  if (impinjRestOpen) {
    return {
      ip,
      vendor: 'generic',
      vendorLabel: 'Generic RFID reader',
      confidence: 'low',
      openPorts,
      reason: 'Port 14150 open — used by Impinj R700 REST-style API and some OEM readers.',
      title,
      server,
      url,
    }
  }

  if (genericHint && (openPorts.includes(80) || openPorts.includes(443))) {
    return {
      ip,
      vendor: 'generic',
      vendorLabel: 'Generic RFID reader',
      confidence: 'low',
      openPorts,
      reason: 'Web UI text mentions RFID/UHF/LLRP but no vendor keyword matched.',
      title,
      server,
      url,
    }
  }

  return null
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
        let llrpHit: { pen: number; vendor: ReaderVendor } | null = null
        if (openPorts.includes(80)) httpInfo = await httpProbe(ip, false, timeoutMs, signal)
        if (openPorts.includes(443)) httpsInfo = await httpProbe(ip, true, timeoutMs, signal)
        if (openPorts.includes(5084)) {
          // Use a slightly longer budget for the LLRP handshake — some readers
          // take ~400–600ms to answer GET_READER_CAPABILITIES.
          llrpHit = await llrpVendorProbe(ip, Math.max(timeoutMs, 1500), signal)
        }

        const reader = fingerprintReader(ip, openPorts, httpInfo, httpsInfo, llrpHit)
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
