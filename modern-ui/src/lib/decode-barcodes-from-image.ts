import { scanImageData } from '@undecaf/zbar-wasm'
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from '@zxing/library'

export type DecodedBarcode = {
  format: string
  value: string
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement) => Promise<
        Array<{ format: string; rawValue: string }>
      >
    }
  }
}

function zbarTypeLabel(typeName: string): string {
  return typeName.replace(/^ZBAR_/i, '').toLowerCase()
}

function barcodeFormatLabel(format: BarcodeFormat): string {
  const name = BarcodeFormat[format]
  return typeof name === 'string' ? name.toLowerCase() : String(format)
}

async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read image pixels')
    ctx.drawImage(bitmap, 0, 0)
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    bitmap.close?.()
  }
}

/** Primary offline path — ZBar WASM (inlined; no network). Handles Code 128 well. */
async function decodeWithZbar(imageData: ImageData): Promise<DecodedBarcode[]> {
  const symbols = await scanImageData(imageData)
  return symbols
    .map((s) => {
      const value = (typeof s.decode === 'function' ? s.decode() : '').trim()
      return { format: zbarTypeLabel(s.typeName || 'unknown'), value }
    })
    .filter((c) => c.value.length > 0)
}

function buildZxingHints(): Map<DecodeHintType, unknown> {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.PDF_417,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.AZTEC,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ],
    ],
  ])
}

/** Secondary offline path for formats ZBar may miss (PDF417 / Aztec / etc.). */
function decodeWithZxing(imageData: ImageData): DecodedBarcode[] {
  const reader = new MultiFormatReader()
  const luminance = new RGBLuminanceSource(imageData.data, imageData.width, imageData.height)
  const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminance))
  try {
    const result = reader.decode(binaryBitmap, buildZxingHints())
    const value = result.getText()?.trim()
    if (!value) return []
    return [{ format: barcodeFormatLabel(result.getBarcodeFormat()), value }]
  } catch (err) {
    if (err instanceof NotFoundException) return []
    throw err
  }
}

async function decodeWithBarcodeDetector(file: File): Promise<DecodedBarcode[]> {
  const Detector = window.BarcodeDetector
  if (!Detector) return []

  const bitmap = await createImageBitmap(file)
  try {
    const detector = new Detector()
    const codes = await detector.detect(bitmap)
    return codes
      .filter((c) => c.rawValue?.trim())
      .map((c) => ({ format: c.format, value: c.rawValue.trim() }))
  } finally {
    bitmap.close?.()
  }
}

/** Read 1D/2D barcodes from a local image file (fully offline). */
export async function decodeBarcodesFromImageFile(file: File): Promise<DecodedBarcode[]> {
  const imageData = await fileToImageData(file)

  try {
    const zbar = await decodeWithZbar(imageData)
    if (zbar.length > 0) return zbar
  } catch {
    // Fall through
  }

  try {
    const zxing = decodeWithZxing(imageData)
    if (zxing.length > 0) return zxing
  } catch {
    // Fall through
  }

  try {
    return await decodeWithBarcodeDetector(file)
  } catch {
    return []
  }
}
