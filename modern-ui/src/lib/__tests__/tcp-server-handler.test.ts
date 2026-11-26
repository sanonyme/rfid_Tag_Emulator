import { describe, it, expect, afterEach, vi } from 'vitest'
import { createConnection } from 'node:net'

vi.mock('../../../electron/window-broadcast', () => ({
  broadcastToAllWindows: vi.fn(),
}))

import {
  parseHexPayload,
  startTcpServer,
  stopTcpServer,
  getTcpServerStatus,
  sendToTcpServerClients,
  disconnectTcpServerClient,
} from '../../../electron/tcp-server-handler'
import {
  connectCustomTcpClient,
  disconnectCustomTcpClient,
  getCustomTcpClientStatus,
  sendCustomTcpClientData,
} from '../../../electron/tcp-client-handler'

describe('tcp-server-handler', () => {
  afterEach(async () => {
    disconnectCustomTcpClient()
    await stopTcpServer()
  })

  it('parses valid hex payloads with spaces, colons, or 0x prefixes', () => {
    const res = parseHexPayload('02 4F:4B,0x03')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.buffer.equals(Buffer.from([0x02, 0x4f, 0x4b, 0x03]))).toBe(true)
    }
  })

  it('rejects empty, odd-length, and non-hex payloads', () => {
    expect(parseHexPayload('   ').ok).toBe(false)
    expect(parseHexPayload('ABC').ok).toBe(false)
    expect(parseHexPayload('ZZ 01').ok).toBe(false)
  })

  it('starts, accepts a client, sends ASCII and HEX replies, and disconnects', async () => {
    // Pick a high ephemeral-friendly port
    const testPort = 45000 + Math.floor(Math.random() * 10000)
    const startRes = await startTcpServer(testPort, '127.0.0.1')
    expect(startRes.ok).toBe(true)
    expect(getTcpServerStatus().running).toBe(true)
    expect(getTcpServerStatus().port).toBe(testPort)

    const received: Buffer[] = []
    const client = createConnection({ host: '127.0.0.1', port: testPort })

    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('error', reject)
    })

    // Wait briefly for server to register client
    await new Promise((r) => setTimeout(r, 30))
    const status = getTcpServerStatus()
    expect(status.clients.length).toBe(1)
    const clientId = status.clients[0].id

    const dataPromise = new Promise<void>((resolve) => {
      client.on('data', (chunk) => {
        received.push(chunk)
        if (Buffer.concat(received).length >= 7) resolve()
      })
    })

    const sendAscii = sendToTcpServerClients('HI', { clientId, lineEnding: 'crlf' })
    expect(sendAscii.ok).toBe(true)
    expect(sendAscii.byteLength).toBe(4)

    const sendHex = sendToTcpServerClients('02 41 03', { clientId, hex: true })
    expect(sendHex.ok).toBe(true)
    expect(sendHex.byteLength).toBe(3)

    await dataPromise
    const combined = Buffer.concat(received)
    expect(combined.equals(Buffer.from([0x48, 0x49, 0x0d, 0x0a, 0x02, 0x41, 0x03]))).toBe(true)

    const disc = disconnectTcpServerClient(clientId)
    expect(disc.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 30))
    expect(getTcpServerStatus().clients.length).toBe(0)
    client.destroy()
  })

  it('keeps persistent TCP client connected across multiple sends until explicitly closed', async () => {
    const testPort = 45000 + Math.floor(Math.random() * 10000)
    const startRes = await startTcpServer(testPort, '127.0.0.1')
    expect(startRes.ok).toBe(true)

    const connRes = await connectCustomTcpClient('127.0.0.1', testPort)
    expect(connRes.ok).toBe(true)
    expect(getCustomTcpClientStatus().connected).toBe(true)

    // Send multiple messages — connection stays open
    const s1 = sendCustomTcpClientData('HELLO', { lineEnding: 'crlf' })
    expect(s1.ok).toBe(true)
    expect(s1.byteLength).toBe(7)

    await new Promise((r) => setTimeout(r, 40))
    expect(getCustomTcpClientStatus().connected).toBe(true)
    expect(getTcpServerStatus().clients.length).toBe(1)

    const s2 = sendCustomTcpClientData('02 4F 4B 03', { hex: true })
    expect(s2.ok).toBe(true)
    expect(s2.byteLength).toBe(4)

    await new Promise((r) => setTimeout(r, 40))
    expect(getCustomTcpClientStatus().connected).toBe(true)
    expect(getTcpServerStatus().clients.length).toBe(1)

    disconnectCustomTcpClient()
    await new Promise((r) => setTimeout(r, 40))
    expect(getCustomTcpClientStatus().connected).toBe(false)
    expect(getTcpServerStatus().clients.length).toBe(0)
  })
})
