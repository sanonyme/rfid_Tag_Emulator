// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('./window-broadcast.js', () => ({
  broadcastToAllWindows: vi.fn(),
}))

import { TCPEmulatorHandler } from './tcp-handler.js'

describe('TCPEmulatorHandler.connect', () => {
  it('resolves cancelled when disconnect supersedes an in-flight connect', async () => {
    const handler = new TCPEmulatorHandler()
    const pending = handler.connect('127.0.0.1', 59999)
    handler.disconnect()
    const result = await pending
    expect(result).toEqual({ ok: false, error: 'Connection cancelled' })
  })
})
