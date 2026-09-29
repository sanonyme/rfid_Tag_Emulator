import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decodeBarcodesFromImageFile } from '../decode-barcodes-from-image'

const scanImageData = vi.fn()

vi.mock('@undecaf/zbar-wasm', () => ({
  scanImageData: (...args: unknown[]) => scanImageData(...args),
}))

vi.mock('@zxing/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zxing/library')>()
  return {
    ...actual,
    MultiFormatReader: class {
      decode() {
        throw new actual.NotFoundException()
      }
    },
    RGBLuminanceSource: class {
      constructor() {}
    },
    HybridBinarizer: class {
      constructor() {}
    },
    BinaryBitmap: class {
      constructor() {}
    },
  }
})

describe('decodeBarcodesFromImageFile', () => {
  beforeEach(() => {
    scanImageData.mockReset()
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 324,
      height: 182,
      close: vi.fn(),
    })) as unknown as typeof createImageBitmap

    const rgba = new Uint8ClampedArray(324 * 182 * 4)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        drawImage: vi.fn(),
        getImageData: () => ({ data: rgba, width: 324, height: 182 }),
      } as unknown as CanvasRenderingContext2D
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decodes Code 128 via offline ZBar (ZEUS-12345 style)', async () => {
    scanImageData.mockResolvedValue([
      {
        typeName: 'ZBAR_CODE128',
        decode: () => 'ZEUS-12345',
      },
    ])

    const file = new File(['x'], 'barcodes-1.png', { type: 'image/png' })
    await expect(decodeBarcodesFromImageFile(file)).resolves.toEqual([
      { format: 'code128', value: 'ZEUS-12345' },
    ])
    expect(scanImageData).toHaveBeenCalled()
  })

  it('returns empty when nothing is found', async () => {
    scanImageData.mockResolvedValue([])
    delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector

    const file = new File(['x'], 'empty.png', { type: 'image/png' })
    await expect(decodeBarcodesFromImageFile(file)).resolves.toEqual([])
  })
})
