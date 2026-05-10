import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toBlob, toPng } from 'html-to-image'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { EPCDecoder, EPCEncoder, uidToEpcSerial } from '../lib/decoder'
import {
  prewarmTdt,
  tdtDecode,
  type TdtDecodeResult,
  type TdtOutputLevel,
} from '../lib/tdt'
import { ArrowDown, ArrowUp, Copy, Check, Loader2, Sparkles, Download } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

const SECTION_CARD =
  'rounded-xl border-border/40 bg-card/95 shadow-sm ring-1 ring-border/20 backdrop-blur-sm'

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

  // -------- Encode state (SGTIN-96) --------
  const [gtinInput, setGtinInput] = useState('')
  const [serialInput, setSerialInput] = useState('')
  const [companyPrefixLen, setCompanyPrefixLen] = useState('6')
  const [filterValue, setFilterValue] = useState('0')
  const [encodedResult, setEncodedResult] = useState<{ epc?: string; error?: string } | null>(null)
  const [serialIsUid, setSerialIsUid] = useState(false)

  // Pre-warm the TDT translator + artefacts when this tab mounts.
  useEffect(() => {
    prewarmTdt()
  }, [])

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
      // If user hadn't explicitly forced a scheme, sync the picker with detection.
      if (!forcedScheme && !overrides?.scheme) {
        setForcedScheme(r.result.scheme)
      }
      toast.success(`Decoded as ${r.result.scheme}`)
    } catch (e) {
      const msg = (e as Error).message || 'Decoding failed'
      setDecodeError(msg)
      toast.error(msg)
    } finally {
      setDecoding(false)
    }
  }

  const handleSchemeChange = (scheme: string) => {
    setForcedScheme(scheme)
    if (epcInput.trim()) {
      void handleDecode({ scheme })
    }
  }

  const handleEncode = () => {
    if (!gtinInput.trim() || !serialInput.trim()) {
      setEncodedResult({ error: 'Please enter both GTIN and Serial' })
      return
    }
    try {
      let serial = serialInput.trim()
      if (serialIsUid) {
        const parsed = uidToEpcSerial(serial)
        if (parsed.error) {
          setEncodedResult({ error: parsed.error })
          toast.error(parsed.error)
          return
        }
        serial = parsed.serial
      }
      const length = parseInt(companyPrefixLen)
      const filter = parseInt(filterValue)
      const result = EPCEncoder.encodeSgtin96(gtinInput, serial, length, filter)
      setEncodedResult(result)
      if (result.error) toast.error(result.error)
      else toast.success('EPC Encoded successfully')
    } catch {
      setEncodedResult({ error: 'Encoding failed' })
      toast.error('Encoding failed')
    }
  }

  const gtinDigits = gtinInput.replace(/[^0-9]/g, '')
  const gtinHint = useMemo(() => {
    if (gtinDigits.length === 13) {
      const check = EPCDecoder.calculateCheckDigit(gtinDigits)
      return (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Calculated check digit{' '}
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/15">
            {check}
          </span>
        </p>
      )
    }
    if (gtinDigits.length === 14) {
      const payload = gtinDigits.slice(0, 13)
      const providedCheck = gtinDigits.slice(-1)
      const calcCheck = EPCDecoder.calculateCheckDigit(payload)
      const isValid = providedCheck === calcCheck
      return (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-[11px] leading-snug ring-1',
            isValid
              ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-800 ring-emerald-500/15 dark:text-emerald-300'
              : 'border-destructive/40 bg-destructive/[0.06] text-destructive ring-destructive/10'
          )}
        >
          {isValid ? 'Check digit is valid.' : `Check digit mismatch (expected ${calcCheck}).`}
        </div>
      )
    }
    return null
  }, [gtinDigits])

  const detectedSchemes = tdtResult?.detectedSchemes ?? []
  const hasMultipleSchemes = detectedSchemes.length > 1

  // Decide if we should render the SGTIN-96 bit visualizer
  const showSgtinViz = !!sgtinResult && tdtResult?.scheme === 'SGTIN-96'

  return (
    <div className="flex min-h-full flex-col gap-5">
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

              <Button
                onClick={() => handleDecode()}
                className="h-10 w-full rounded-lg font-medium"
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
            </div>

            {/* Scheme picker (only when multiple are detected) */}
            {hasMultipleSchemes && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Detected schemes ({detectedSchemes.length})
                </Label>
                <Select value={forcedScheme} onValueChange={handleSchemeChange}>
                  <SelectTrigger className="h-9 rounded-lg border-border/50 bg-background/80">
                    <SelectValue placeholder="Pick a scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {detectedSchemes.map((d) => (
                      <SelectItem key={`${d.scheme}-${d.level}`} value={d.scheme}>
                        {d.scheme}
                        <span className="ml-2 text-xs text-muted-foreground">{d.level}</span>
                        {typeof d.detectedGCPLength === 'number' && d.detectedGCPLength > 0 && (
                          <span className="ml-2 text-[10px] text-muted-foreground">GCP {d.detectedGCPLength}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                    SGTIN-96
                  </Badge>
                </div>
                <CardDescription className="text-xs leading-relaxed">
                  GTIN + serial → 96-bit hex EPC (filter &amp; prefix length configurable)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5 px-5 pb-5 pt-0">
            <div className="space-y-2">
              <Label htmlFor="encoder-gtin" className="text-sm font-medium">
                GTIN / UPC
              </Label>
              <Input
                id="encoder-gtin"
                placeholder="e.g. 1234567890123"
                value={gtinInput}
                onChange={(e) => setGtinInput(e.target.value)}
                className="h-10 rounded-lg border-border/50 bg-background/80 font-mono text-sm"
              />
              {gtinHint}
            </div>

            <div className="space-y-3">
              <Label htmlFor="encoder-serial" className="text-sm font-medium">
                Serial number
              </Label>
              <Input
                id="encoder-serial"
                placeholder={serialIsUid ? 'e.g. E0167801034E89FC' : 'e.g. 12345'}
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                className="h-10 rounded-lg border-border/50 bg-background/80 font-mono text-sm"
              />
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/35 bg-muted/20 px-3 py-2.5 ring-1 ring-border/15">
                <div className="space-y-0.5">
                  <Label htmlFor="serial-is-uid" className="text-sm font-medium leading-snug">
                    UID input
                  </Label>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">E016 + 12 hex → EPC serial</p>
                </div>
                <Switch id="serial-is-uid" checked={serialIsUid} onCheckedChange={setSerialIsUid} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <Button
              onClick={handleEncode}
              variant="outline"
              className="mt-auto h-10 w-full rounded-lg border-primary/35 bg-primary/[0.04] font-medium text-primary hover:bg-primary/[0.08] hover:text-primary"
            >
              Encode
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
                      <Badge variant="outline" className="font-mono text-[10px] font-normal">
                        24 hex chars
                      </Badge>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <code className="block min-h-[2.75rem] flex-1 break-all rounded-lg border border-border/40 bg-background/80 p-3 font-mono text-xs leading-relaxed ring-1 ring-border/15 sm:text-sm">
                        {encodedResult.epc}
                      </code>
                      <CopyButton text={encodedResult.epc} />
                    </div>
                    {encodedResult.epc && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-full text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (encodedResult.epc) {
                            setEpcInput(encodedResult.epc)
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
