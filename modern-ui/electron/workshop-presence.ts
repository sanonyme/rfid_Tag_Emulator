import dgram from 'dgram'
import os from 'os'
import type { WebContents } from 'electron'
import {
  WORKSHOP_GROUP,
  WORKSHOP_MAX_PACKET_BYTES,
  WORKSHOP_PORT,
  decodeWorkshopPacket,
  encodeWorkshopPacket,
  normalizeWorkshopRoom,
  sanitizeWorkshopName,
} from '../src/lib/workshop-protocol.js'

export type WorkshopJoinResult = { ok: true; name: string } | { ok: false; error: string; name: string }

type Bucket = { tokens: number; at: number }
type Sender = { socket: dgram.Socket; ready: boolean }

const PEER_RATE = 25
const PEER_BURST = 40
const INBOUND_RATE = 250
const INBOUND_BURST = 400
const OUTBOUND_RATE = 30
const OUTBOUND_BURST = 60
const MAX_TRACKED_PEERS = 64
const INTERFACE_REFRESH_MS = 20_000
/** Gives a final "bye" time to leave before the sockets close. */
const CLOSE_GRACE_MS = 200

let receiver: dgram.Socket | null = null
let receiverReady: Promise<void> | null = null
/** One send socket per LAN adapter, keyed by adapter address (VPN/VM adapters each get their own). */
const senders = new Map<string, Sender>()
let defaultMembership = false
let room: string | null = null
let subscriber: WebContents | null = null
let selfId: string | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
const peerBuckets = new Map<string, Bucket>()
const inbound: Bucket = { tokens: INBOUND_BURST, at: 0 }
const outbound: Bucket = { tokens: OUTBOUND_BURST, at: 0 }
const watchedContents = new WeakSet<WebContents>()

function take(bucket: Bucket, rate: number, burst: number, now: number): boolean {
  bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * rate)
  bucket.at = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

function lanAddresses(): string[] {
  const out: string[] = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      const fam = a.family as 'IPv4' | 'IPv6' | number
      if ((fam === 'IPv4' || fam === 4) && !a.internal) out.push(a.address)
    }
  }
  return out
}

/** OS account name, used until the player picks their own. */
export function workshopDefaultName(): string {
  try {
    const user = os.userInfo().username
    return sanitizeWorkshopName(user.charAt(0).toUpperCase() + user.slice(1))
  } catch {
    return 'Elf'
  }
}

function closeQuietly(socket: dgram.Socket) {
  try {
    socket.close()
  } catch {
    // already closed
  }
}

function onDatagram(buf: Buffer) {
  const target = subscriber
  if (!room || !target || buf.length > WORKSHOP_MAX_PACKET_BYTES) return
  const now = Date.now()
  if (!take(inbound, INBOUND_RATE, INBOUND_BURST, now)) return
  const msg = decodeWorkshopPacket(buf.toString('utf8'), room)
  if (!msg || msg.id === selfId) return
  let bucket = peerBuckets.get(msg.id)
  if (!bucket) {
    if (peerBuckets.size >= MAX_TRACKED_PEERS) peerBuckets.clear()
    bucket = { tokens: PEER_BURST, at: now }
    peerBuckets.set(msg.id, bucket)
  }
  if (!take(bucket, PEER_RATE, PEER_BURST, now)) return
  if (target.isDestroyed()) {
    shutdown(false)
    return
  }
  target.send('workshop-message', msg)
}

function ensureReceiver(): Promise<void> {
  if (receiverReady) return receiverReady
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  receiver = socket
  receiverReady = new Promise<void>((resolve, reject) => {
    const onBindError = (err: Error) => reject(err)
    socket.once('error', onBindError)
    socket.on('message', onDatagram)
    socket.bind({ port: WORKSHOP_PORT, exclusive: false }, () => {
      socket.removeListener('error', onBindError)
      socket.on('error', (err) => {
        console.warn('[workshop] socket error:', err.message)
        if (receiver === socket) shutdown(false)
      })
      try {
        socket.setMulticastTTL(1)
        socket.setMulticastLoopback(true)
      } catch {
        // defaults are fine
      }
      resolve()
    })
  })
  return receiverReady
}

/** Joins the group on every IPv4 adapter and keeps that in sync as adapters come and go. */
function refreshInterfaces() {
  const sock = receiver
  if (!sock || !room) return
  const addresses = new Set(lanAddresses())

  for (const [address, sender] of senders) {
    if (addresses.has(address)) continue
    try {
      sock.dropMembership(WORKSHOP_GROUP, address)
    } catch {
      // adapter already gone
    }
    closeQuietly(sender.socket)
    senders.delete(address)
  }

  for (const address of addresses) {
    if (senders.has(address)) continue
    try {
      sock.addMembership(WORKSHOP_GROUP, address)
    } catch {
      continue
    }
    const socket = dgram.createSocket({ type: 'udp4' })
    const sender: Sender = { socket, ready: false }
    senders.set(address, sender)
    const drop = () => {
      if (senders.get(address) === sender) senders.delete(address)
      closeQuietly(socket)
    }
    socket.on('error', drop)
    socket.bind({ address, port: 0 }, () => {
      try {
        socket.setMulticastTTL(1)
        socket.setMulticastInterface(address)
        socket.setMulticastLoopback(true)
        sender.ready = true
      } catch {
        drop()
      }
    })
  }

  if (senders.size === 0 && !defaultMembership) {
    try {
      sock.addMembership(WORKSHOP_GROUP)
      defaultMembership = true
    } catch {
      // no multicast route; the floor stays solo
    }
  }
}

function shutdown(graceful: boolean) {
  room = null
  subscriber = null
  selfId = null
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  const sockets = Array.from(senders.values(), (s) => s.socket)
  senders.clear()
  if (receiver) {
    receiver.removeListener('message', onDatagram)
    sockets.push(receiver)
  }
  receiver = null
  receiverReady = null
  defaultMembership = false
  peerBuckets.clear()
  if (graceful) setTimeout(() => sockets.forEach(closeQuietly), CLOSE_GRACE_MS)
  else sockets.forEach(closeQuietly)
}

export async function joinWorkshop(wc: WebContents, requestedRoom: unknown): Promise<WorkshopJoinResult> {
  const name = workshopDefaultName()
  const next = typeof requestedRoom === 'string' ? normalizeWorkshopRoom(requestedRoom) : null
  if (!next) return { ok: false, error: 'Invalid room', name }

  room = next
  subscriber = wc
  selfId = null
  if (!watchedContents.has(wc)) {
    watchedContents.add(wc)
    wc.once('destroyed', () => {
      if (subscriber === wc) shutdown(false)
    })
  }

  try {
    await ensureReceiver()
  } catch (err) {
    if (subscriber === wc) shutdown(false)
    return { ok: false, error: err instanceof Error ? err.message : String(err), name }
  }
  if (room !== next || subscriber !== wc) return { ok: false, error: 'Left before joining', name }

  refreshInterfaces()
  refreshTimer ??= setInterval(refreshInterfaces, INTERFACE_REFRESH_MS)
  return { ok: true, name }
}

/** Only the window that joined may send or leave, so a pop-out can't tear down the main window's floor. */
export function sendWorkshop(wc: WebContents, message: unknown): void {
  if (!room || wc !== subscriber) return
  if (!take(outbound, OUTBOUND_RATE, OUTBOUND_BURST, Date.now())) return
  const text = encodeWorkshopPacket(room, message)
  if (!text) return
  const buf = Buffer.from(text, 'utf8')
  if (buf.length > WORKSHOP_MAX_PACKET_BYTES) return
  selfId = (message as { id: string }).id

  let sent = false
  for (const sender of senders.values()) {
    if (!sender.ready) continue
    sender.socket.send(buf, WORKSHOP_PORT, WORKSHOP_GROUP, () => {})
    sent = true
  }
  if (!sent && defaultMembership && receiver) receiver.send(buf, WORKSHOP_PORT, WORKSHOP_GROUP, () => {})
}

export function leaveWorkshop(wc?: WebContents): void {
  if (wc && wc !== subscriber) return
  shutdown(wc !== undefined)
}
