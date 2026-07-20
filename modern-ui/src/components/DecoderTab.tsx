import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toBlob, toPng } from 'html-to-image'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { EPCDecoder, uidToEpcSerial } from '../lib/decoder'
import {
  buildTdtAiJson,
  buildTdtBareIdentifier,
  prewarmTdt,
  tdtAutodetect,
  tdtDecode,
  tdtEncode,
  tdtGetSchemeInputs,
  tdtListSchemes,
  type TdtDecodeResult,
  type TdtDetectedScheme,
  type TdtOutputLevel,
  type TdtSchemeInputs,
} from '../lib/tdt'
import { ArrowDown, ArrowUp, Copy, Check, Loader2, Sparkles, Download } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { sectionCard as SECTION_CARD } from '@/lib/ui-tokens'

const PARTITION_TABLE = [
  { companyBits: 40, itemBits: 4 },
  { companyBits: 37, itemBits: 7 },
  { companyBits: 34, itemBits: 10 },
  { companyBits: 30, itemBits: 14 },
  { companyBits: 27, itemBits: 17 },
  { companyBits: 24, itemBits: 20 },
  { companyBits: 20, itemBits: 24 },
]

/** Options for exporting only the SGTIN-96 bit-layout div (not surrounding UI). */
const BIT_LAYOUT_IMAGE_OPTS = {
  pixelRatio: 2,
  backgroundColor: '#fafafa',
  cacheBust: true,
} as const

const BIT_SEGMENTS = [
  { label: 'Header', bits: 8, color: 'bg-blue-500/90 dark:bg-blue-600/90', text: 'text-white' },
  { label: 'Filter', bits: 3, color: 'bg-emerald-500/90 dark:bg-emerald-600/90', text: 'text-white' },
  { label: 'Partition', bits: 3, color: 'bg-amber-500/90 dark:bg-amber-600/90', text: 'text-white' },
  { label: 'Company', bits: 0, color: 'bg-violet-500/90 dark:bg-violet-600/90', text: 'text-white' },
  { label: 'Item Ref', bits: 0, color: 'bg-rose-500/90 dark:bg-rose-600/90', text: 'text-white' },
  { label: 'Serial', bits: 38, color: 'bg-cyan-500/90 dark:bg-cyan-600/90', text: 'text-white' },
]

// Pretty labels for the output levels (mirrors the upstream sanonyme/TDT demo)
const OUTPUT_LABELS: Record<TdtOutputLevel, string> = {
  BINARY: 'Binary encoded TDS data',
  HEX: 'Hex encoded TDS data',
  PURE_IDENTITY: 'EPC Pure URI',
  TAG_ENCODING: 'EPC Tag URI',
  LEGACY: 'Legacy',
  GS1_DIGITAL_LINK: 'GS1 Digital Link URI',
  GS1_AI_JSON: 'GS1 AI String (JSON)',
  BARE_IDENTIFIER: 'Bare Identifier',
  TEI: 'Text Element Identifier',
}

// Order in which we render the output rows
const OUTPUT_ORDER: TdtOutputLevel[] = [
  'PURE_IDENTITY',
  'TAG_ENCODING',
  'GS1_DIGITAL_LINK',
  'GS1_AI_JSON',
  'BARE_IDENTIFIER',
  'TEI',
  'HEX',
  'BINARY',
  'LEGACY',
]

// Canonical examples taken from the upstream sanonyme/TDT demo —
// each one is a known-valid input at a different level.
const EXAMPLE_EPCS: Array<{ label: string; value: string }> = [
  { label: 'SGTIN-96 (hex)', value: '3034257BF400B40000000123' },
  { label: 'Hex (TDS 2.x)', value: 'F73095212341234538566CB0AFC4' },
  { label: 'AI JSON', value: '{"01":"09521234123453","21":"32a/b"}' },
  { label: 'Digital Link', value: 'https://id.gs1.org/01/09521234123453/21/32a%2Fb' },
  { label: 'EPC Tag URI', value: 'urn:epc:tag:sgtin-198:0.9521234.012345.32a%2F' },
  { label: 'EPC Pure URI', value: 'urn:epc:id:sgtin:9521234.012345.32a%2Fb' },
  { label: 'Bare ID', value: 'gtin=09521234123453;serial=32a/b' },
]

/** Identifier-level examples for TDT encode → HEX (not hex-in-hex). */
const EXAMPLE_ENCODE: Array<{ label: string; value: string }> = [
  { label: 'AI JSON', value: '{"01":"09521234123453","21":"32a/b"}' },
  { label: 'Digital Link', value: 'https://id.gs1.org/01/09521234123453/21/32a%2Fb' },
  { label: 'EPC Pure URI', value: 'urn:epc:id:sgtin:9521234.012345.32a%2Fb' },
  { label: 'EPC Tag URI', value: 'urn:epc:tag:sgtin-198:0.9521234.012345.32a%2F' },
  { label: 'Bare ID', value: 'gtin=09521234123453;serial=32a/b' },
]

function buildSgtinAiJson(
  gtin: string,
  serial: string,
  serialIsUid: boolean,
): { input?: string; error?: string } {
  let serialVal = serial.trim()
  if (serialIsUid) {
    const parsed = uidToEpcSerial(serialVal)
    if (parsed.error) return { error: parsed.error }
    serialVal = parsed.serial
  }
  const digits = gtin.replace(/\D/g, '')
  let gtin14: string
  if (digits.length === 13) {
    gtin14 = digits + EPCDecoder.calculateCheckDigit(digits)
  } else if (digits.length === 14) {
    gtin14 = digits
  } else {
    return { error: 'GTIN must be 13 or 14 digits' }
  }
  return { input: JSON.stringify({ '01': gtin14, '21': serialVal }) }
}

/** Strips the tag-length / variant suffix from a TDT scheme name, e.g. "SGTIN-96" / "SGTIN+" → "SGTIN". */
function schemeFamily(scheme: string): string {
  const trimmed = scheme.trim()
  if (!trimmed) return ''
  return trimmed.replace(/[-+].*$/, '').toUpperCase()
}

/**
 * Validates/derives a GS1 self-check-digit key (GTIN, SSCC, GLN, GSRN, …).
 * Accepts either the bare body (no check digit) or the body + check digit,
 * optionally prefixed with a fixed literal digit before the checksum is computed
 * (e.g. GRAI's leading "0").
 */
function selfCheckDigits(
  raw: string,
  bodyLen: number,
  label: string,
  fixedPrefix = '',
): { value?: string; error?: string } {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === bodyLen) {
    return { value: digits + EPCDecoder.calculateCheckDigit(fixedPrefix + digits) }
  }
  if (digits.length === bodyLen + 1) {
    const body = digits.slice(0, bodyLen)
    const provided = digits.slice(-1)
    const calc = EPCDecoder.calculateCheckDigit(fixedPrefix + body)
    if (provided !== calc) {
      return { error: `${label} check digit mismatch (expected ${calc})` }
    }
    return { value: digits }
  }
  return { error: `${label} must be ${bodyLen} or ${bodyLen + 1} digits` }
}

interface QuickField {
  key: string
  label: string
  placeholder: string
  /** When set, renders a live check-digit hint under the field (GTIN-style self-check keys). */
  checkDigit?: { bodyLen: number; fixedPrefix?: string }
  optional?: boolean
}

interface QuickSchemeConfig {
  title: string
  fields: QuickField[]
  usesCompanyPrefixLength: boolean
  usesFilter: boolean
  usesUidToggle?: boolean
  build: (values: Record<string, string>, ctx: { serialIsUid: boolean }) => { input?: string; error?: string }
}

/** Per-scheme-family quick-encode field sets, so the form fits whichever scheme is selected. */
const QUICK_SCHEME_CONFIGS: Record<string, QuickSchemeConfig> = {
  SGTIN: {
    title: 'Quick SGTIN',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    usesUidToggle: true,
    fields: [
      { key: 'gtin', label: 'GTIN / UPC', placeholder: 'e.g. 1234567890123', checkDigit: { bodyLen: 13 } },
      { key: 'serial', label: 'Serial number', placeholder: 'e.g. 12345' },
    ],
    build: (v, ctx) => buildSgtinAiJson(v.gtin || '', v.serial || '', ctx.serialIsUid),
  },
  SSCC: {
    title: 'Quick SSCC',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'sscc', label: 'SSCC', placeholder: 'e.g. 106141412345678908', checkDigit: { bodyLen: 17 } },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.sscc || '', 17, 'SSCC')
      if (r.error) return { error: r.error }
      return { input: JSON.stringify({ '00': r.value }) }
    },
  },
  SGLN: {
    title: 'Quick SGLN',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'gln', label: 'GLN', placeholder: 'e.g. 0614141000005', checkDigit: { bodyLen: 12 } },
      { key: 'serial', label: 'Extension / serial (optional)', placeholder: 'e.g. 32a/b', optional: true },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.gln || '', 12, 'GLN')
      if (r.error) return { error: r.error }
      const serial = (v.serial || '').trim()
      const obj: Record<string, string> = { '414': r.value! }
      if (serial) obj['254'] = serial
      return { input: JSON.stringify(obj) }
    },
  },
  GRAI: {
    title: 'Quick GRAI',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'grai', label: 'Company prefix + asset type', placeholder: '12 digits, e.g. 061414100000', checkDigit: { bodyLen: 12, fixedPrefix: '0' } },
      { key: 'serial', label: 'Serial', placeholder: 'e.g. 12345' },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.grai || '', 12, 'GRAI', '0')
      if (r.error) return { error: r.error }
      const serial = (v.serial || '').trim()
      if (!serial) return { error: 'Serial is required for GRAI' }
      return { input: JSON.stringify({ '8003': '0' + r.value + serial }) }
    },
  },
  GDTI: {
    title: 'Quick GDTI',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'gdti', label: 'Company prefix + document type', placeholder: '12 digits, e.g. 061414100000', checkDigit: { bodyLen: 12 } },
      { key: 'serial', label: 'Serial', placeholder: 'e.g. 12345' },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.gdti || '', 12, 'GDTI')
      if (r.error) return { error: r.error }
      const serial = (v.serial || '').trim()
      if (!serial) return { error: 'Serial is required for GDTI' }
      return { input: JSON.stringify({ '253': r.value + serial }) }
    },
  },
  GSRN: {
    title: 'Quick GSRN',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'gsrn', label: 'GSRN', placeholder: '17 or 18 digits', checkDigit: { bodyLen: 17 } },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.gsrn || '', 17, 'GSRN')
      if (r.error) return { error: r.error }
      return { input: JSON.stringify({ '8018': r.value }) }
    },
  },
  GSRNP: {
    title: 'Quick GSRN — Provider',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'gsrnp', label: 'GSRN — Provider', placeholder: '17 or 18 digits', checkDigit: { bodyLen: 17 } },
    ],
    build: (v) => {
      const r = selfCheckDigits(v.gsrnp || '', 17, 'GSRN')
      if (r.error) return { error: r.error }
      return { input: JSON.stringify({ '8017': r.value }) }
    },
  },
  GIAI: {
    title: 'Quick GIAI',
    usesCompanyPrefixLength: true,
    usesFilter: true,
    fields: [
      { key: 'giai', label: 'GIAI', placeholder: 'company prefix + asset ref, e.g. 06141410012345' },
    ],
    build: (v) => {
      const digits = (v.giai || '').replace(/\D/g, '')
      if (digits.length < 13) return { error: 'GIAI (company prefix + asset reference) must be at least 13 digits' }
      return { input: JSON.stringify({ '8004': digits }) }
    },
  },
  GID: {
    title: 'Quick GID',
    usesCompanyPrefixLength: false,
    usesFilter: false,
    fields: [
      { key: 'generalManager', label: 'General manager number', placeholder: 'e.g. 95100000' },
      { key: 'objectClass', label: 'Object class', placeholder: 'e.g. 12345' },
      { key: 'serial', label: 'Serial', placeholder: 'e.g. 400' },
    ],
    build: (v) => {
      const gm = (v.generalManager || '').replace(/\D/g, '')
      const oc = (v.objectClass || '').replace(/\D/g, '')
      const serial = (v.serial || '').replace(/\D/g, '')
      if (!gm || !oc || !serial) return { error: 'General manager, object class, and serial are all required' }
      return { input: `generalmanager=${gm};objectclass=${oc};serial=${serial}` }
    },
  },
  USDOD: {
    title: 'Quick USDOD',
    usesCompanyPrefixLength: false,
    usesFilter: true,
    fields: [
      { key: 'cage', label: 'CAGE / DoDAAC', placeholder: 'e.g. ABC12' },
      { key: 'serial', label: 'Serial', placeholder: 'e.g. 12345' },
    ],
    build: (v) => {
      const cage = (v.cage || '').trim().toUpperCase()
      const serial = (v.serial || '').replace(/\D/g, '')
      if (!/^[0-9A-HJ-NP-Z]{5,6}$/.test(cage)) return { error: 'CAGE/DoDAAC must be 5-6 chars, no I or O' }
      if (!serial) return { error: 'Serial is required' }
      return { input: `cageordodaac=${cage};serial=${serial}` }
    },
  },
}

/** Check-digit hint metadata for common TDT field names. */
const TDT_CHECK_DIGIT: Record<string, { bodyLen: number; fixedPrefix?: string }> = {
  gtin: { bodyLen: 13 },
  sscc: { bodyLen: 17 },
  gln: { bodyLen: 12 },
  gsrn: { bodyLen: 17 },
  gsrnp: { bodyLen: 17 },
}

/** Build a QuickSchemeConfig from live TDT artefact fields (covers every scheme). */
function quickConfigFromTdt(meta: TdtSchemeInputs): QuickSchemeConfig {
  const fieldNames = new Set(meta.fields.map((f) => f.name))
  return {
    title: `Quick ${meta.scheme}`,
    usesCompanyPrefixLength: meta.requiresGcpLength,
    usesFilter: meta.hasFilter,
    usesUidToggle: fieldNames.has('serial') && fieldNames.has('gtin'),
    fields: meta.fields.map((f) => ({
      key: f.name,
      label: f.label,
      placeholder: f.placeholder,
      checkDigit: TDT_CHECK_DIGIT[f.name],
    })),
    build: (values, ctx) => {
      const vals: Record<string, string> = {}
      for (const f of meta.fields) {
        let v = (values[f.name] ?? '').trim()
        if (!v) continue
        if (f.name === 'gtin') {
          const digits = v.replace(/\D/g, '')
          if (digits.length === 13) v = digits + EPCDecoder.calculateCheckDigit(digits)
          else if (digits.length === 14) v = digits
          else return { error: 'GTIN must be 13 or 14 digits' }
        }
        if (f.name === 'serial' && ctx.serialIsUid) {
          const parsed = uidToEpcSerial(v)
          if (parsed.error) return { error: parsed.error }
          v = parsed.serial
        }
        vals[f.name] = v
      }
      if (!Object.keys(vals).length) {
        return { error: 'Fill the quick fields below or paste an identifier above' }
      }
      const ai = buildTdtAiJson(meta.aiSequence, meta.fields, vals)
      if (ai) return { input: ai }
      const bare = buildTdtBareIdentifier(vals)
      if (!bare) return { error: 'Fill the quick fields below or paste an identifier above' }
      return { input: bare }
    },
  }
}

const SCHEME_AUTO = '__auto__'

function TdtSchemeSelect({
  value,
  onValueChange,
  detected,
  allSchemes,
  id,
}: {
  value: string
  onValueChange: (scheme: string) => void
  detected: TdtDetectedScheme[]
  allSchemes: string[]
  id?: string
}) {
  const detectedNames = new Set(detected.map((d) => d.scheme))
  const rest = allSchemes.filter((s) => !detectedNames.has(s)).sort((a, b) => a.localeCompare(b))
  const autoHint = detected[0]?.scheme

  return (
    <Select value={value || SCHEME_AUTO} onValueChange={(v) => onValueChange(v === SCHEME_AUTO ? '' : v)}>
      <SelectTrigger id={id} className="h-9 rounded-lg border-border/50 bg-background/80">
        <SelectValue placeholder="Scheme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SCHEME_AUTO}>
          Auto-detect{autoHint ? ` · ${autoHint}` : ''}
        </SelectItem>
        {detected.length > 0 && (
          <SelectGroup>
            <SelectLabel>Detected</SelectLabel>
            {detected.map((d) => (
              <SelectItem key={`d-${d.scheme}-${d.level}`} value={d.scheme}>
                {d.scheme}
                <span className="ml-2 text-xs text-muted-foreground">{d.level}</span>
                {typeof d.detectedGCPLength === 'number' && d.detectedGCPLength > 0 && (
                  <span className="ml-2 text-[10px] text-muted-foreground">GCP {d.detectedGCPLength}</span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {rest.length > 0 && (
          <SelectGroup>
            <SelectLabel>All schemes</SelectLabel>
            {rest.map((s) => (
              <SelectItem key={`a-${s}`} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

function EpcBitVisualizer({
  decoded,
  epcHex,
}: {
  decoded: {
    filter?: number
    partition?: number
    companyPrefix?: string
    itemReference?: string
    serial?: string
  }
  /** Used in the downloaded filename (optional). */
  epcHex?: string
}) {
  /** Only this element is rasterized — not the toolbar below it. */
  const layoutCaptureRef = useRef<HTMLDivElement>(null)
  const [savingImage, setSavingImage] = useState(false)
  const [copyingImage, setCopyingImage] = useState(false)

  const partition = decoded.partition ?? 0
  const rule = PARTITION_TABLE[partition] || PARTITION_TABLE[0]

  const segments = BIT_SEGMENTS.map((seg, i) => {
    let bits = seg.bits
    let value = ''
    if (i === 3) {
      bits = rule.companyBits
      value = decoded.companyPrefix || ''
    } else if (i === 4) {
      bits = rule.itemBits
      value = decoded.itemReference || ''
    } else if (i === 0) value = '0x30'
    else if (i === 1) value = String(decoded.filter ?? '')
    else if (i === 2) value = String(decoded.partition ?? '')
    else if (i === 5) value = decoded.serial || ''
    return { ...seg, bits, value }
  })

  const totalBits = 96

  const getLayoutPngBlob = useCallback(async (): Promise<Blob> => {
    const node = layoutCaptureRef.current
    if (!node) throw new Error('Missing layout node')
    const blob = await toBlob(node, { ...BIT_LAYOUT_IMAGE_OPTS })
    if (!blob) throw new Error('Empty image')
    return blob
  }, [])

  const copyLayoutImage = useCallback(async () => {
    const node = layoutCaptureRef.current
    if (!node) return
    setCopyingImage(true)
    try {
      const blob = await getLayoutPngBlob()
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        toast.error('Copying images is not supported in this environment')
        return
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('Image copied — paste where you need it')
    } catch {
      toast.error('Could not copy image')
    } finally {
      setCopyingImage(false)
    }
  }, [getLayoutPngBlob])

  const saveDeconstructionImage = useCallback(async () => {
    const node = layoutCaptureRef.current
    if (!node) return
    setSavingImage(true)
    try {
      const dataUrl = await toPng(node, { ...BIT_LAYOUT_IMAGE_OPTS, style: { transform: 'scale(1)' } })
      const slug = (epcHex || '')
        .replace(/[^0-9A-Fa-f]/g, '')
        .slice(0, 24)
        .toLowerCase()
      const name = slug ? `sgtin96-deconstruction-${slug}.png` : `sgtin96-deconstruction-${Date.now()}.png`
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = name
      a.click()
      toast.success('Saved bit layout as PNG')
    } catch {
      toast.error('Could not save image')
    } finally {
      setSavingImage(false)
    }
  }, [epcHex])

  const exportBusy = savingImage || copyingImage

  return (
    <div className="mt-1 space-y-2">
      <div
        ref={layoutCaptureRef}
        className="space-y-3 rounded-xl border border-border/35 bg-muted/10 p-4 ring-1 ring-border/15"
        data-export="sgtin96-bit-layout"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">SGTIN-96 bit layout</p>
          <Badge variant="outline" className="text-[10px] font-normal tabular-nums text-muted-foreground">
            96 bits
          </Badge>
        </div>
        <div className="flex h-10 overflow-hidden rounded-lg ring-1 ring-border/35">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={cn(
                'relative flex items-center justify-center overflow-hidden transition-colors',
                seg.color,
                seg.bits < 8 && 'min-w-[2px]'
              )}
              style={{ width: `${(seg.bits / totalBits) * 100}%` }}
              title={`${seg.label}: ${seg.bits} bits — ${seg.value}`}
            >
              {seg.bits >= 8 && (
                <span className={cn('truncate px-1 text-[10px] font-semibold drop-shadow-sm', seg.text)}>
                  {seg.label}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex h-8 overflow-hidden rounded-lg border border-border/40 bg-background/70 ring-1 ring-border/15">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="flex items-center justify-center overflow-hidden border-r border-border/30 last:border-0"
              style={{ width: `${(seg.bits / totalBits) * 100}%` }}
            >
              <span className="truncate px-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                {seg.value}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn('h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10 dark:ring-white/10', seg.color)} />
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {seg.label} ({seg.bits}b)
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-border/50 px-3 text-xs font-medium"
          onClick={() => void copyLayoutImage()}
          disabled={exportBusy}
        >
          {copyingImage ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          Copy image
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-border/50 px-3 text-xs font-medium"
          onClick={() => void saveDeconstructionImage()}
          disabled={exportBusy}
        >
          {savingImage ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Save PNG
        </Button>
      </div>
    </div>
  )
}

function ResultRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/30 bg-background/50 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-32 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  )
}

function CopyButton({ text, size = 'icon' }: { text?: string; size?: 'icon' | 'sm' }) {
  const [copied, setCopied] = useState(false)
  const onClick = () => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      className={cn('shrink-0 rounded-lg border-border/50', size === 'icon' && 'h-8 w-8')}
      onClick={onClick}
      disabled={!text}
      title="Copy"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}

/** Live check-digit feedback for GS1 self-check keys (GTIN, SSCC, GLN, GSRN, GRAI, GDTI, …). */
function CheckDigitHint({
  raw,
  bodyLen,
  fixedPrefix = '',
}: {
  raw: string
  bodyLen: number
  fixedPrefix?: string
}) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === bodyLen) {
    const check = EPCDecoder.calculateCheckDigit(fixedPrefix + digits)
    return (
      <p className="m-0 text-[11px] leading-normal text-muted-foreground">
        Calculated check digit{' '}
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/15">
          {check}
        </span>
      </p>
    )
  }
  if (digits.length === bodyLen + 1) {
    const body = digits.slice(0, bodyLen)
    const providedCheck = digits.slice(-1)
    const calcCheck = EPCDecoder.calculateCheckDigit(fixedPrefix + body)
    const isValid = providedCheck === calcCheck
    return (
      <div
        className={cn(
          'flex items-center rounded-lg border px-2.5 py-1.5 text-[11px] leading-normal ring-1',
          isValid
            ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-800 ring-emerald-500/15 dark:text-emerald-300'
            : 'border-destructive/40 bg-destructive/[0.06] text-destructive ring-destructive/10'
        )}
      >
        <span className="m-0">
          {isValid ? 'Check digit is valid.' : `Check digit mismatch (expected ${calcCheck}).`}
        </span>
      </div>
    )
  }
  return null
}

function OutputRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
        <CopyButton text={value} />
      </div>
      <code className="block max-h-32 overflow-auto break-all rounded-lg border border-border/40 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed ring-1 ring-border/15 sm:text-xs">
        {value}
      </code>
    </div>
  )
}

export function DecoderTab() {
  // -------- Decode state --------
  const [epcInput, setEpcInput] = useState('')
  const [forcedScheme, setForcedScheme] = useState<string>('') // empty = auto
  const [tdtResult, setTdtResult] = useState<TdtDecodeResult | null>(null)
  const [sgtinResult, setSgtinResult] = useState<{
    gtin?: string
    serial?: string
    error?: string
    companyPrefix?: string
    itemReference?: string
    filter?: number
    partition?: number
  } | null>(null)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [decoding, setDecoding] = useState(false)
  const [decodeDetected, setDecodeDetected] = useState<TdtDetectedScheme[]>([])
  const [allTdtSchemes, setAllTdtSchemes] = useState<string[]>([])

  // -------- Encode (TDT → HEX) --------
  const [encodeInput, setEncodeInput] = useState('')
  const [encodeScheme, setEncodeScheme] = useState('')
  const [encodeDetected, setEncodeDetected] = useState<TdtDetectedScheme[]>([])
  const [tdtSchemeInputs, setTdtSchemeInputs] = useState<TdtSchemeInputs | null>(null)
  const [quickValues, setQuickValues] = useState<Record<string, string>>({})
  const [companyPrefixLen, setCompanyPrefixLen] = useState('6')
  const [filterValue, setFilterValue] = useState('0')
  const [encodedResult, setEncodedResult] = useState<{
    value?: string
    scheme?: string
    error?: string
  } | null>(null)
  const [serialIsUid, setSerialIsUid] = useState(false)
  const [encoding, setEncoding] = useState(false)

  // Prefer handcrafted family forms when available; otherwise use live TDT field defs.
  const activeFamily = schemeFamily(encodeScheme) || 'SGTIN'
  const quickConfig = useMemo(() => {
    const family = QUICK_SCHEME_CONFIGS[activeFamily]
    if (family) return family
    if (tdtSchemeInputs) return quickConfigFromTdt(tdtSchemeInputs)
    return null
  }, [activeFamily, tdtSchemeInputs])

  const setQuickValue = (key: string, value: string) => {
    setQuickValues((prev) => ({ ...prev, [key]: value }))
  }

  // Pre-warm the TDT translator + artefacts when this tab mounts.
  useEffect(() => {
    prewarmTdt()
    void tdtListSchemes().then(setAllTdtSchemes).catch(() => {})
  }, [])

  // Load TDT field definitions for the selected scheme (fallback for families without a handcrafted form).
  useEffect(() => {
    const scheme = encodeScheme || 'SGTIN-96'
    let cancelled = false
    void tdtGetSchemeInputs(scheme)
      .then((meta) => {
        if (cancelled) return
        setTdtSchemeInputs(meta)
        setQuickValues((prev) => {
          const next: Record<string, string> = {}
          const keys = QUICK_SCHEME_CONFIGS[schemeFamily(scheme)]?.fields.map((f) => f.key)
            ?? meta?.fields.map((f) => f.name)
            ?? []
          for (const key of keys) next[key] = prev[key] ?? ''
          return next
        })
      })
      .catch(() => {
        if (!cancelled) setTdtSchemeInputs(null)
      })
    return () => {
      cancelled = true
    }
  }, [encodeScheme])

  useEffect(() => {
    const raw = epcInput.trim()
    if (!raw) {
      setDecodeDetected([])
      return
    }
    void tdtAutodetect(raw).then(setDecodeDetected)
  }, [epcInput])

  useEffect(() => {
    const raw = encodeInput.trim()
    if (!raw) {
      setEncodeDetected([])
      return
    }
    void tdtAutodetect(raw).then(setEncodeDetected)
  }, [encodeInput])

  const handleDecode = async (overrides?: { scheme?: string }) => {
    const raw = epcInput.trim()
    if (!raw) {
      setTdtResult(null)
      setSgtinResult(null)
      setDecodeError(null)
      return
    }

    setDecoding(true)
    setDecodeError(null)
    try {
      const cleanHex = raw.replace(/[^0-9A-Fa-f]/g, '')

      // Run SGTIN-96 fast path (used for the bit visualizer when applicable).
      const sgtin = cleanHex.length === 24 ? EPCDecoder.decodeSgtin96(cleanHex) : { error: 'Not 24 hex chars' }
      setSgtinResult(sgtin.error ? null : sgtin)

      // Always run TDT translation (handles all schemes including SGTIN-96).
      const r = await tdtDecode(raw, { scheme: overrides?.scheme || forcedScheme || undefined })
      if (!r.ok) {
        setTdtResult(null)
        setDecodeError(r.error)
        toast.error(r.error)
        return
      }
      setTdtResult(r.result)
      toast.success(`Decoded as ${r.result.scheme}`)
    } catch (e) {
      const msg = (e as Error).message || 'Decoding failed'
      setDecodeError(msg)
      toast.error(msg)
    } finally {
      setDecoding(false)
    }
  }

  useEffect(() => {
    const onClipboard = (ev: Event) => {
      const detail = (ev as CustomEvent<{ text?: string }>).detail
      const text = (detail?.text || '').trim()
      if (!text) {
        toast.error('Clipboard is empty')
        return
      }
      setEpcInput(text)
      window.setTimeout(() => {
        void (async () => {
          setDecoding(true)
          setDecodeError(null)
          try {
            const cleanHex = text.replace(/[^0-9A-Fa-f]/g, '')
            const sgtin = cleanHex.length === 24 ? EPCDecoder.decodeSgtin96(cleanHex) : { error: 'Not 24 hex chars' }
            setSgtinResult(sgtin.error ? null : sgtin)
            const r = await tdtDecode(text, { scheme: forcedScheme || undefined })
            if (!r.ok) {
              setTdtResult(null)
              setDecodeError(r.error)
              toast.error(r.error)
              return
            }
            setTdtResult(r.result)
            toast.success(`Decoded as ${r.result.scheme}`)
          } catch (e) {
            const msg = (e as Error).message || 'Decoding failed'
            setDecodeError(msg)
            toast.error(msg)
          } finally {
            setDecoding(false)
          }
        })()
      }, 50)
    }
    window.addEventListener('zeus:decode-clipboard', onClipboard)
    return () => window.removeEventListener('zeus:decode-clipboard', onClipboard)
  }, [forcedScheme])

  const handleSchemeChange = (scheme: string) => {
    setForcedScheme(scheme)
    if (epcInput.trim()) {
      void handleDecode({ scheme })
    }
  }

  const handleEncode = async () => {
    let raw = encodeInput.trim()
    let fromQuickPanel = false
    if (!raw) {
      if (!quickConfig) {
        const msg = `Loading TDT fields for ${encodeScheme || activeFamily}… try again in a moment, or paste an identifier above`
        setEncodedResult({ error: msg })
        return
      }
      const built = quickConfig.build(quickValues, { serialIsUid })
      if (built.error) {
        setEncodedResult({ error: built.error })
        toast.error(built.error)
        return
      }
      raw = built.input!
      fromQuickPanel = true
    }

    setEncoding(true)
    setEncodedResult(null)
    try {
      const r = await tdtEncode(raw, 'HEX', {
        scheme: encodeScheme || undefined,
        filter: parseInt(filterValue, 10) || 0,
        ...(fromQuickPanel && quickConfig!.usesCompanyPrefixLength ? { gcpLength: parseInt(companyPrefixLen, 10) || 6 } : {}),
      })
      if (!r.ok) {
        setEncodedResult({ error: r.error })
        toast.error(r.error)
        return
      }
      setEncodedResult({ value: r.value, scheme: r.scheme })
      toast.success(`Encoded as ${r.scheme}`)
    } catch {
      setEncodedResult({ error: 'Encoding failed' })
      toast.error('Encoding failed')
    } finally {
      setEncoding(false)
    }
  }

  const handleClear = () => {
    setEpcInput('')
    setForcedScheme('')
    setTdtResult(null)
    setSgtinResult(null)
    setDecodeError(null)
    setDecodeDetected([])
    setEncodeInput('')
    setEncodeScheme('')
    setEncodeDetected([])
    setQuickValues({})
    setCompanyPrefixLen('6')
    setFilterValue('0')
    setEncodedResult(null)
    setSerialIsUid(false)
  }

  // Decide if we should render the SGTIN-96 bit visualizer
  const showSgtinViz = !!sgtinResult && tdtResult?.scheme === 'SGTIN-96'

  return (
    <div className="stagger-children flex min-h-full flex-col gap-5">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-2">
        {/* ----------------- Decoder Section ----------------- */}
        <Card className={cn('flex h-full flex-col', SECTION_CARD)} data-tour="tour-decoder-decode">
          <CardHeader className="px-5 pb-3 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                <ArrowDown className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">EPC decoder</CardTitle>
                  <Badge variant="secondary" className="font-normal text-muted-foreground">
                    GS1 TDT
                  </Badge>
                  {tdtResult?.scheme && (
                    <Badge variant="outline" className="font-mono text-[10px] font-normal">
                      {tdtResult.scheme}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs leading-relaxed">
                  Hex / binary / URN / Digital Link → all GS1 TDT representations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5 px-5 pb-5 pt-0">
            <div className="space-y-2">
              <Label htmlFor="decoder-epc" className="text-sm font-medium">
                EPC input
              </Label>
              <Textarea
                id="decoder-epc"
                placeholder="e.g. 3034257BF400B40000000123 — or urn:epc:tag:sgtin-96:... — or https://id.gs1.org/01/..."
                value={epcInput}
                onChange={(e) => setEpcInput(e.target.value)}
                className="min-h-[5.5rem] resize-y rounded-lg border-border/50 bg-background/80 font-mono text-sm"
                rows={3}
              />

              {/* Quick examples */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3" /> examples
                </span>
                {EXAMPLE_EPCS.map((ex) => (
                  <button
                    key={ex.value}
                    type="button"
                    onClick={() => setEpcInput(ex.value)}
                    className="rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleDecode()}
                  className="h-10 min-w-0 flex-1 rounded-lg font-medium"
                  disabled={decoding}
                >
                  {decoding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Decoding…
                    </>
                  ) : (
                    'Decode'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 rounded-lg px-4"
                  onClick={handleClear}
                  disabled={decoding || encoding}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="decode-scheme" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Scheme
              </Label>
              <TdtSchemeSelect
                id="decode-scheme"
                value={forcedScheme}
                onValueChange={handleSchemeChange}
                detected={decodeDetected}
                allSchemes={allTdtSchemes}
              />
            </div>

            {/* Error */}
            {decodeError && !tdtResult && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/[0.06] p-4 ring-1 ring-destructive/10">
                <p className="text-sm font-medium text-destructive">{decodeError}</p>
              </div>
            )}

            {/* Result */}
            {tdtResult && (
              <div className="space-y-4">
                {/* Summary header */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[11px] font-normal">
                    Parsed
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {tdtResult.scheme}
                    {typeof tdtResult.detectedGCPLength === 'number' && tdtResult.detectedGCPLength > 0 && (
                      <> · GCP {tdtResult.detectedGCPLength}</>
                    )}
                  </span>
                </div>

                {/* SGTIN-96 friendly fields when available */}
                {showSgtinViz && sgtinResult && (
                  <div className="space-y-2 rounded-xl border border-border/35 bg-muted/15 p-4 ring-1 ring-border/15">
                    <ResultRow label="GTIN-14">
                      <span className="font-mono text-sm font-medium tabular-nums">{sgtinResult.gtin}</span>
                    </ResultRow>
                    <ResultRow label="Check digit">
                      <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                        {sgtinResult.gtin?.slice(-1)}
                      </span>
                    </ResultRow>
                    <ResultRow label="Serial">
                      <span className="break-all font-mono text-sm font-medium">{sgtinResult.serial}</span>
                    </ResultRow>
                    <ResultRow label="Filter">{sgtinResult.filter}</ResultRow>
                    <ResultRow label="Partition">{sgtinResult.partition}</ResultRow>
                    <ResultRow label="Company">
                      <span className="font-mono text-sm">{sgtinResult.companyPrefix}</span>
                    </ResultRow>
                    <ResultRow label="Item ref">
                      <span className="font-mono text-sm">{sgtinResult.itemReference}</span>
                    </ResultRow>
                  </div>
                )}

                {/* GS1 AI breakdown */}
                {tdtResult.ais.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-border/35 bg-muted/15 p-4 ring-1 ring-border/15">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        GS1 application identifiers
                      </Label>
                      <Badge variant="outline" className="text-[10px] font-normal tabular-nums text-muted-foreground">
                        {tdtResult.ais.length} AIs
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {tdtResult.ais.map((ai) => (
                        <div
                          key={ai.ai}
                          className="flex flex-col gap-0.5 rounded-lg border border-border/30 bg-background/60 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                        >
                          <div className="flex w-32 shrink-0 items-center gap-2">
                            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary ring-1 ring-primary/15">
                              {ai.ai}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {ai.label}
                            </span>
                          </div>
                          <span className="min-w-0 flex-1 break-all font-mono text-xs sm:text-sm">{ai.value}</span>
                          <CopyButton text={ai.value} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All output levels */}
                <div className="space-y-3 rounded-xl border border-border/35 bg-muted/10 p-4 ring-1 ring-border/15">
                  <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    All representations
                  </Label>
                  <div className="grid grid-cols-1 gap-3">
                    {OUTPUT_ORDER.map((level) => (
                      <OutputRow key={level} label={OUTPUT_LABELS[level]} value={tdtResult.outputs[level]} />
                    ))}
                  </div>
                </div>

                {/* SGTIN-96 visualizer */}
                {showSgtinViz && sgtinResult && (
                  <EpcBitVisualizer
                    decoded={sgtinResult}
                    epcHex={epcInput.replace(/[^0-9A-Fa-f]/g, '')}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----------------- Encoder Section ----------------- */}
        <Card className={cn('flex h-full flex-col', SECTION_CARD)} data-tour="tour-decoder-encode">
          <CardHeader className="px-5 pb-3 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400">
                <ArrowUp className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold tracking-tight">EPC encoder</CardTitle>
                  <Badge variant="secondary" className="font-normal text-muted-foreground">
                    TDT → HEX
                  </Badge>
                </div>
                <CardDescription className="text-xs leading-relaxed">
                  AI JSON, Digital Link, URI, or bare ID → hex EPC (all TDT schemes)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5 px-5 pb-5 pt-0">
            <div className="space-y-2">
              <Label htmlFor="encoder-input" className="text-sm font-medium">
                Identifier input
              </Label>
              <Textarea
                id="encoder-input"
                placeholder='e.g. {"01":"09521234123453","21":"123"} or Digital Link / EPC URI'
                value={encodeInput}
                onChange={(e) => setEncodeInput(e.target.value)}
                className="min-h-[4.5rem] resize-y rounded-lg border-border/50 bg-background/80 font-mono text-sm"
                rows={2}
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3" /> examples
                  {tdtSchemeInputs?.scheme ? ` · ${tdtSchemeInputs.scheme}` : ''}
                </span>
                {(tdtSchemeInputs?.examples?.length ? tdtSchemeInputs.examples : EXAMPLE_ENCODE).map((ex) => (
                  <button
                    key={`${ex.label}-${ex.value}`}
                    type="button"
                    onClick={() => setEncodeInput(ex.value)}
                    className="rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="encode-scheme" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Scheme
              </Label>
              <TdtSchemeSelect
                id="encode-scheme"
                value={encodeScheme}
                onValueChange={setEncodeScheme}
                detected={encodeDetected}
                allSchemes={allTdtSchemes}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/35 bg-muted/15 px-3 py-3 ring-1 ring-border/15">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {quickConfig ? `Or ${quickConfig.title.toLowerCase()}` : 'Quick fields'}
                </p>
                <Badge variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
                  {tdtSchemeInputs?.scheme || encodeScheme || activeFamily}
                </Badge>
              </div>

              {quickConfig ? (
                <>
                  {quickConfig.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`quick-${field.key}`} className="text-sm font-medium">
                        {field.label}
                      </Label>
                      <Input
                        id={`quick-${field.key}`}
                        placeholder={
                          field.key === 'serial' && quickConfig.usesUidToggle && serialIsUid
                            ? 'e.g. E0167801034E89FC'
                            : field.placeholder
                        }
                        value={quickValues[field.key] || ''}
                        onChange={(e) => setQuickValue(field.key, e.target.value)}
                        className="h-10 rounded-lg border-border/50 bg-background/80 font-mono text-sm"
                      />
                      {field.checkDigit && (
                        <CheckDigitHint
                          raw={quickValues[field.key] || ''}
                          bodyLen={field.checkDigit.bodyLen}
                          fixedPrefix={field.checkDigit.fixedPrefix}
                        />
                      )}
                      {field.key === 'serial' && quickConfig.usesUidToggle && (
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/35 bg-muted/20 px-3 py-2.5 ring-1 ring-border/15">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <Label htmlFor="serial-is-uid" className="text-sm font-medium leading-snug">
                              UID input
                            </Label>
                            <p className="text-[11px] leading-relaxed text-muted-foreground">E016 + 12 hex → EPC serial</p>
                          </div>
                          <Switch id="serial-is-uid" className="mt-0.5 shrink-0" checked={serialIsUid} onCheckedChange={setSerialIsUid} />
                        </div>
                      )}
                    </div>
                  ))}

                  {(quickConfig.usesCompanyPrefixLength || quickConfig.usesFilter) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {quickConfig.usesCompanyPrefixLength && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Company prefix length</Label>
                          <Select value={companyPrefixLen} onValueChange={setCompanyPrefixLen}>
                            <SelectTrigger className="h-10 rounded-lg border-border/50 bg-background/80">
                              <SelectValue placeholder="Length" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="6">6 digits</SelectItem>
                              <SelectItem value="7">7 digits</SelectItem>
                              <SelectItem value="8">8 digits</SelectItem>
                              <SelectItem value="9">9 digits</SelectItem>
                              <SelectItem value="10">10 digits</SelectItem>
                              <SelectItem value="11">11 digits</SelectItem>
                              <SelectItem value="12">12 digits</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {quickConfig.usesFilter && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Filter value</Label>
                          <Select value={filterValue} onValueChange={setFilterValue}>
                            <SelectTrigger className="h-10 rounded-lg border-border/50 bg-background/80">
                              <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0 — All others (retail)</SelectItem>
                              <SelectItem value="1">1 — POS trade item</SelectItem>
                              <SelectItem value="2">2 — Full case transport</SelectItem>
                              <SelectItem value="3">3 — Reserved</SelectItem>
                              <SelectItem value="4">4 — Inner pack</SelectItem>
                              <SelectItem value="5">5 — Reserved</SelectItem>
                              <SelectItem value="6">6 — Unit load</SelectItem>
                              <SelectItem value="7">7 — Component</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Loading TDT field definitions for{' '}
                  <span className="font-mono text-foreground">{encodeScheme || 'SGTIN-96'}</span>…
                </p>
              )}
            </div>

            <Button
              onClick={() => void handleEncode()}
              variant="outline"
              disabled={encoding}
              className="mt-auto h-10 w-full rounded-lg border-primary/35 bg-primary/[0.04] font-medium text-primary hover:bg-primary/[0.08] hover:text-primary"
            >
              {encoding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Encoding…
                </>
              ) : (
                'Encode'
              )}
            </Button>

            {encodedResult && (
              <div
                className={cn(
                  'space-y-3 rounded-xl border p-4 ring-1',
                  encodedResult.error
                    ? 'border-destructive/40 bg-destructive/[0.06] ring-destructive/10'
                    : 'border-primary/25 bg-primary/[0.06] ring-primary/10'
                )}
              >
                {encodedResult.error ? (
                  <p className="text-sm font-medium text-destructive">{encodedResult.error}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Generated EPC (hex)
                      </Label>
                      {encodedResult.scheme && (
                        <Badge variant="outline" className="font-mono text-[10px] font-normal">
                          {encodedResult.scheme}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-stretch gap-2">
                      <code className="block min-h-[2.75rem] flex-1 break-all rounded-lg border border-border/40 bg-background/80 p-3 font-mono text-xs leading-relaxed ring-1 ring-border/15 sm:text-sm">
                        {encodedResult.value}
                      </code>
                      <CopyButton text={encodedResult.value} />
                    </div>
                    {encodedResult.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (encodedResult.value) {
                            setEpcInput(encodedResult.value)
                            void handleDecode()
                          }
                        }}
                      >
                        <ArrowDown className="mr-1.5 h-3 w-3" />
                        Send to decoder
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
