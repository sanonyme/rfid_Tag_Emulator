import { execFile, type ChildProcess } from 'child_process'
import dns from 'dns/promises'
import os from 'os'
import type { WebContents } from 'electron'

export interface NetInterfaceInfo {
  name: string
  address: string
  netmask: string
  cidr: number
  /** Normalized network CIDR e.g. 192.168.1.0/24 */
  networkCidr: string
}

function ipv4ToInt(ip: string): number {
  const p = ip.split('.').map((x) => parseInt(x, 10))
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return 0
  return (((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0)
}

/** Strict parse; returns null if not a valid IPv4 quad. */
function parseIpv4Strict(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const o = [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10), parseInt(m[4]!, 10)]
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return (((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0)
}

function intToIpv4(n: number): string {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

function netmaskToPrefix(mask: string): number {
  const n = ipv4ToInt(mask)
  let c = 0
  for (let i = 0; i < 32; i++) {
    if (n & (1 << (31 - i))) c++
    else break
  }
  return c
}

export function getIpv4Interfaces(): NetInterfaceInfo[] {
  const nets = os.networkInterfaces()
  const out: NetInterfaceInfo[] = []
  for (const name of Object.keys(nets)) {
    const addrs = nets[name]
    if (!addrs) continue
    for (const a of addrs) {
      const fam = a.family
      const isV4 = fam === 'IPv4' || fam === 4
      if (!isV4 || a.internal) continue
      if (!a.netmask) continue
      const cidr = netmaskToPrefix(a.netmask)
      const ipInt = ipv4ToInt(a.address)
      const maskInt = ipv4ToInt(a.netmask)
      const networkInt = ipInt & maskInt
      out.push({
        name,
        address: a.address,
        netmask: a.netmask,
        cidr,
        networkCidr: `${intToIpv4(networkInt)}/${cidr}`,
      })
    }
  }
  return out
}

const MAX_HOSTS = 4094

export function enumerateCidr(cidrInput: string): string[] | null {
  const m = cidrInput.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/)
  if (!m) return null
  const prefix = parseInt(m[2]!, 10)
  if (prefix < 8 || prefix > 30) return null
  const ipInt = ipv4ToInt(m[1]!)
  if (ipInt === 0 && m[1] !== '0.0.0.0') return null
  const mask = (~0 << (32 - prefix)) >>> 0
  const networkInt = ipInt & mask
  const hostBits = 32 - prefix
  const hostCount = (1 << hostBits) - 2
  if (hostCount < 1 || hostCount > MAX_HOSTS) return null
  const ips: string[] = []
  for (let i = 1; i <= hostCount; i++) {
    ips.push(intToIpv4(networkInt + i))
  }
  return ips
}

/** Angry IP–style inclusive range (start and end may be given in any order). */
export function enumerateIpRange(startIp: string, endIp: string): string[] | null {
  const a = parseIpv4Strict(startIp)
  const b = parseIpv4Strict(endIp)
  if (a === null || b === null) return null
  const lo = Math.min(a, b) >>> 0
  const hi = Math.max(a, b) >>> 0
  const count = hi - lo + 1
  if (count < 1 || count > MAX_HOSTS) return null
  const ips: string[] = []
  for (let x = lo; x <= hi; x++) {
    ips.push(intToIpv4(x))
  }
  return ips
}

/** Union of all non-internal IPv4 interface subnets (deduped). */
export function enumerateAllLocalSubnetsMerged(): string[] | null {
  const ifs = getIpv4Interfaces()
  if (ifs.length === 0) return null
  const set = new Set<string>()
  for (const i of ifs) {
    const ips = enumerateCidr(i.networkCidr)
    if (ips) {
      for (const ip of ips) set.add(ip)
    }
  }
  if (set.size === 0) return null
  if (set.size > MAX_HOSTS) return null
  return Array.from(set).sort((x, y) => (parseIpv4Strict(x)! - parseIpv4Strict(y)!))
}

function pingOnce(ip: string, signal: AbortSignal): Promise<boolean> {
  const platform = process.platform
  const args =
    platform === 'win32'
      ? ['-n', '1', '-w', '1000', ip]
      : platform === 'darwin'
        ? ['-c', '1', '-W', '1000', ip]
        : ['-c', '1', '-W', '1', ip]

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    let child: ChildProcess
    try {
      child = execFile('ping', args, { timeout: 4000 }, (err) => {
        resolve(err === null)
      })
    } catch {
      resolve(false)
      return
    }
    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.on('close', () => signal.removeEventListener('abort', onAbort))
  })
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

let activeController: AbortController | null = null

export function cancelNetScan(): void {
  activeController?.abort()
  activeController = null
}

export type NetScanStartPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number }
  | { mode: 'allSubnets'; concurrency?: number }

function resolveScanIps(payload: NetScanStartPayload): { ips: string[] } | { error: string } {
  if (payload.mode === 'cidr') {
    const ips = enumerateCidr(payload.cidr)
    if (!ips?.length) {
      return { error: 'Invalid CIDR (e.g. 192.168.1.0/24). Max 4094 hosts per scan.' }
    }
    return { ips }
  }
  if (payload.mode === 'range') {
    const ips = enumerateIpRange(payload.start, payload.end)
    if (!ips?.length) {
      return {
        error:
          'Invalid IP range. Use two IPv4 addresses (e.g. 192.168.1.1 – 192.168.1.254). Max 4094 addresses.',
      }
    }
    return { ips }
  }
  if (payload.mode === 'allSubnets') {
    const ips = enumerateAllLocalSubnetsMerged()
    if (!ips?.length) {
      return {
        error:
          'No scannable local IPv4 subnets found, or merged subnets exceed 4094 addresses. Use CIDR or a smaller range.',
      }
    }
    return { ips }
  }
  return { error: 'Unknown scan mode.' }
}

export function startNetScan(
  wc: WebContents,
  payload: NetScanStartPayload,
): { ok: true; total: number } | { ok: false; error: string } {
  if (activeController) {
    return { ok: false, error: 'A scan is already running. Stop it first.' }
  }
  const resolved = resolveScanIps(payload)
  if ('error' in resolved) {
    return { ok: false, error: resolved.error }
  }
  const ips = resolved.ips
  const concurrency = Math.min(64, Math.max(1, payload.concurrency ?? 40))
  const ac = new AbortController()
  activeController = ac
  const signal = ac.signal
  const total = ips.length

  void (async () => {
    let completed = 0
    try {
      await runPool(ips, concurrency, signal, async (ip) => {
        if (signal.aborted || wc.isDestroyed()) return
        const alive = await pingOnce(ip, signal)
        let hostname: string | undefined
        if (alive && !signal.aborted) {
          try {
            const names = await dns.reverse(ip)
            hostname = names[0]
          } catch {
            /* no PTR */
          }
        }
        completed += 1
        if (!wc.isDestroyed()) {
          wc.send('net-scan-host', {
            ip,
            alive,
            hostname,
            done: completed,
            total,
          })
        }
      })
      if (!signal.aborted && !wc.isDestroyed()) {
        wc.send('net-scan-done', { total })
      }
    } catch (e) {
      if (!wc.isDestroyed()) {
        wc.send('net-scan-error', {
          message: e instanceof Error ? e.message : String(e),
        })
      }
    } finally {
      if (activeController === ac) activeController = null
    }
  })()

  return { ok: true, total }
}
