import { describe, it, expect } from 'vitest'
import { EPCDecoder, EPCEncoder } from '../decoder'
import { generateSgtin96 } from '../epc-encoders'

describe('EPCDecoder round-trip', () => {
  it('decodes SGTIN-96 produced by generateSgtin96', () => {
    const [epc] = generateSgtin96('00012345678905', 1, 42)
    expect(epc).toBeDefined()
    const decoded = EPCDecoder.decodeSgtin96(epc!)
    expect(decoded.error).toBeUndefined()
    expect(decoded.serial).toBe('42')
    expect(decoded.gtin).toMatch(/^\d{14}$/)
  })

  it('round-trips encode → decode for a known GTIN', () => {
    const gtin = '00012345678905'
    const serial = '1001'
    const encoded = EPCEncoder.encodeSgtin96(gtin, serial, 6, 0)
    expect(encoded.error).toBeUndefined()
    const decoded = EPCDecoder.decodeSgtin96(encoded.epc!)
    expect(decoded.error).toBeUndefined()
    expect(decoded.serial).toBe(serial)
    expect(decoded.gtin).toBe(gtin)
  })

  it('SGTIN-96 partition 6 (GCP length 6) sets filter+partition byte 0x18', () => {
    const encoded = EPCEncoder.encodeSgtin96('00000000000000', '1', 6, 0)
    expect(encoded.epc).toBe('301800000000000000000001')
  })

  it('rejects invalid hex length', () => {
    expect(EPCDecoder.decodeSgtin96('30').error).toContain('24 hex')
  })
})
