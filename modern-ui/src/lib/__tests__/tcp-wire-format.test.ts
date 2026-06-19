import { describe, it, expect } from 'vitest'
import { formatTcpTagMessage } from '../tcp-wire-format'

describe('formatTcpTagMessage', () => {
  it('formats driver tag line with trailing newline', () => {
    const line = formatTcpTagMessage(
      {
        epc: '3034257BF400000000000001',
        tid: 'E280',
        uid: 'reader-1',
        antenna: 2,
        rssi: '-45.0',
      },
      'llrp',
    )
    expect(line).toBe(
      'driver=llrp epc=3034257BF400000000000001 @tid=E280 uid=reader-1 antenna=2 @rssi=-45.0\n',
    )
  })
})
