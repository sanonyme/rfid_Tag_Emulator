import dgram from 'dgram'
import type { WebContents } from 'electron'

export interface EdgeDevice {
  ip: string
  port: number
  guid: string
  mac: string
  version: string
  lastPDUpdate: string
  errors: string
  name: string
  raw: string
  discoveredAt: number
}

let activeSocket: dgram.Socket | null = null
let discoveryTimeout: ReturnType<typeof setTimeout> | null = null

function extractXmlValue(xml: string, tag: string): string {
  const open = `<${tag}>`
  const close = `</${tag}>`
  const start = xml.indexOf(open)
  const end = xml.indexOf(close)
  if (start === -1 || end === -1) return ''
  return xml.substring(start + open.length, end).trim()
}

function extractPropertyValue(xml: string, propName: string): string {
  const propRegex = new RegExp(
    `<CProperty>\\s*<Name>${propName}</Name>\\s*<Value>([^<]*)</Value>\\s*</CProperty>`,
    's',
  )
  const match = xml.match(propRegex)
  return match?.[1]?.trim() ?? ''
}

function parseHeartbeat(data: string, remoteAddr: string): EdgeDevice | null {
  if (!data.includes('CEdgeHeartBeatModel')) return null

  const ip = extractPropertyValue(data, 'IPAddress') || remoteAddr
  const portStr = extractPropertyValue(data, 'Port')
  const port = portStr ? parseInt(portStr, 10) : 0
  const guid = extractXmlValue(data, 'Guid')
  const mac = extractXmlValue(data, 'MACAddress')
  const version = extractXmlValue(data, 'Version')
  const lastPDUpdate = extractXmlValue(data, 'LastPDUpdate')
  const errors = extractXmlValue(data, 'Errors')
  const name = extractPropertyValue(data, 'showDashBoardInfo') !== ''
    ? `Edge (${mac || ip})`
    : `Edge Device`

  return {
    ip,
    port,
    guid,
    mac,
    version,
    lastPDUpdate,
    errors,
    name,
    raw: data,
    discoveredAt: Date.now(),
  }
}

export function startUdpDiscovery(
  wc: WebContents,
  localPort: number,
  listenDurationMs: number,
): { ok: true } | { ok: false; error: string } {
  if (activeSocket) {
    return { ok: false, error: 'UDP discovery is already running. Stop it first.' }
  }

  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    activeSocket = socket

    socket.on('error', (err) => {
      console.error('UDP Discovery socket error:', err.message)
      if (!wc.isDestroyed()) {
        wc.send('udp-discovery-error', { message: err.message })
      }
      cleanupSocket()
    })

    socket.on('message', (msg, rinfo) => {
      const raw = msg.toString('utf8')
      console.log(`UDP Discovery: received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`)

      if (!wc.isDestroyed()) {
        wc.send('udp-discovery-raw', {
          data: raw,
          from: rinfo.address,
          fromPort: rinfo.port,
          timestamp: Date.now(),
        })
      }

      const device = parseHeartbeat(raw, rinfo.address)
      if (device && !wc.isDestroyed()) {
        wc.send('udp-discovery-device', device)
      }
    })

    socket.bind(localPort, () => {
      console.log(`UDP Discovery: listening on port ${localPort}`)
      try {
        socket.setBroadcast(true)
      } catch {
        // not critical
      }
      if (!wc.isDestroyed()) {
        wc.send('udp-discovery-started', { port: localPort })
      }
    })

    if (listenDurationMs > 0) {
      discoveryTimeout = setTimeout(() => {
        console.log('UDP Discovery: listen duration expired, stopping')
        stopUdpDiscovery()
        if (!wc.isDestroyed()) {
          wc.send('udp-discovery-stopped', { reason: 'timeout' })
        }
      }, listenDurationMs)
    }

    return { ok: true }
  } catch (err) {
    cleanupSocket()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function sendUdpProbe(
  targetIp: string,
  targetPort: number,
  message: string,
): { ok: true } | { ok: false; error: string } {
  if (!activeSocket) {
    return { ok: false, error: 'UDP discovery socket is not running. Start discovery first.' }
  }
  try {
    const buf = Buffer.from(message, 'utf8')
    activeSocket.send(buf, 0, buf.length, targetPort, targetIp, (err) => {
      if (err) console.error('UDP probe send error:', err.message)
      else console.log(`UDP probe sent to ${targetIp}:${targetPort} (${buf.length} bytes)`)
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function cleanupSocket(): void {
  if (discoveryTimeout) {
    clearTimeout(discoveryTimeout)
    discoveryTimeout = null
  }
  if (activeSocket) {
    try {
      activeSocket.close()
    } catch {
      // already closed
    }
    activeSocket = null
  }
}

export function stopUdpDiscovery(): void {
  cleanupSocket()
}

export function isUdpDiscoveryRunning(): boolean {
  return activeSocket !== null
}
