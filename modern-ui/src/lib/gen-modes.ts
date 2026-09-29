import {
  ScanLine,
  QrCode,
  FileText,
  Package,
  type LucideIcon,
} from 'lucide-react'

export type GenMode = 'barcode' | 'qrcode' | 'zpl' | 'batch'

export const GEN_MODE_OPTIONS: {
  value: GenMode
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    value: 'barcode',
    label: 'Barcodes',
    description: '1D barcode builder',
    icon: ScanLine,
  },
  {
    value: 'qrcode',
    label: 'QR Codes',
    description: 'QR code designer',
    icon: QrCode,
  },
  {
    value: 'zpl',
    label: 'ZPL',
    description: 'Label printer preview',
    icon: FileText,
  },
  {
    value: 'batch',
    label: 'Batch Export',
    description: 'ZIP many barcodes at once',
    icon: Package,
  },
]

export function isGenMode(v: unknown): v is GenMode {
  return GEN_MODE_OPTIONS.some((o) => o.value === v)
}
