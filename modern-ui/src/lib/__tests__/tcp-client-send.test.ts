import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TCPEmulatorClient } from '../tcp-client'

describe('TCPEmulatorClient.sendTags', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('awaits tcp-complete before resolving', async () => {
    let completeCb: ((message: string) => void) | undefined
    window.electronAPI = {
      onTcpConnected: vi.fn(),
      onTcpDisconnected: vi.fn(),
      onTcpError: vi.fn(),
      onTcpProgress: vi.fn(),
      onTcpComplete: (cb: (message: string) => void) => {
        completeCb = cb
      },
      tcpSendTags: vi.fn(),
    } as unknown as typeof window.electronAPI

    const client = new TCPEmulatorClient()
    const progress: string[] = []
    const complete: string[] = []

    const sendPromise = client.sendTags(
      [{ epc: 'E1', tid: '', uid: '', antenna: 1, rssi: '-50' }],
      'llrp',
      0,
      (m) => progress.push(m),
      (m) => complete.push(m),
    )

    let settled = false
    void sendPromise.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    completeCb!('done')
    await sendPromise
    expect(complete).toEqual(['done'])
  })
})
