import { useMemo, useState } from 'react'
import { Shirt } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { toast } from 'sonner'
import {
  type InditexBrandName,
  type InditexEpcFields,
  type InditexEpcVersion,
  INDITEX_BRAND_ID,
  INDITEX_V2_EXAMPLE,
  TEMPE_V1_EXAMPLE,
  TEMPE_V2_EXAMPLE,
  brandNameFromId,
  buildInditexUpc,
  decodeInditexEpc,
  generateInditexEpcs,
  incrementInditexSeed,
  parseTempeQrJson,
} from '@/lib/inditex-epc'

interface InditexTempeGeneratorProps {
  onGenerated: (epcs: string) => void
  variant?: 'default' | 'compact'
}

type GenerateMode = 'fields' | 'seed'

function fieldsFromForm(values: {
  brandId: string
  version: InditexEpcVersion
  inventoryTag: 0 | 1
  productType: string
  model: string
  quality: string
  color: string
  size: string
  tagSupplierId: string
  tagType: string
  startSerial: string
}): InditexEpcFields {
  const fallback = values.version === 1 ? TEMPE_V1_EXAMPLE : TEMPE_V2_EXAMPLE
  const num = (raw: string, backup: number) => {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : backup
  }
  return {
    version: values.version,
    brand: num(values.brandId, fallback.brand),
    productType: num(values.productType, fallback.productType),
    model: num(values.model, fallback.model),
    quality: num(values.quality, fallback.quality),
    color: num(values.color, fallback.color),
    size: num(values.size, fallback.size),
    inventoryTag: values.inventoryTag,
    tagSupplierId: num(values.tagSupplierId, fallback.tagSupplierId),
    tagType: num(values.tagType, values.version === 1 ? 1 : fallback.tagType),
    serial: num(values.startSerial, 1),
  }
}

export function InditexTempeGenerator({ onGenerated, variant = 'default' }: InditexTempeGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<GenerateMode>('fields')
  const [brand, setBrand] = useState<InditexBrandName>('tempe')
  const [brandId, setBrandId] = useState(String(TEMPE_V2_EXAMPLE.brand))
  const [version, setVersion] = useState<InditexEpcVersion>(2)
  const [inventoryTag, setInventoryTag] = useState<0 | 1>(1)
  const [productType, setProductType] = useState(String(TEMPE_V2_EXAMPLE.productType))
  const [model, setModel] = useState(String(TEMPE_V2_EXAMPLE.model))
  const [quality, setQuality] = useState(String(TEMPE_V2_EXAMPLE.quality))
  const [color, setColor] = useState(String(TEMPE_V2_EXAMPLE.color))
  const [size, setSize] = useState(String(TEMPE_V2_EXAMPLE.size))
  const [tagSupplierId, setTagSupplierId] = useState(String(TEMPE_V2_EXAMPLE.tagSupplierId))
  const [tagType, setTagType] = useState(String(TEMPE_V2_EXAMPLE.tagType))
  const [count, setCount] = useState('6')
  const [startSerial, setStartSerial] = useState(String(TEMPE_V2_EXAMPLE.serial))
  const [seedEpc, setSeedEpc] = useState('1048C088004C3250027282210414F641')
  const [qrText, setQrText] = useState('')

  const applyExample = (nextBrand: InditexBrandName, nextVersion: InditexEpcVersion) => {
    const example =
      nextVersion === 1 ? TEMPE_V1_EXAMPLE : nextBrand === 'inditex' ? INDITEX_V2_EXAMPLE : TEMPE_V2_EXAMPLE
    setBrand(nextBrand)
    setBrandId(String(example.brand))
    setVersion(nextVersion)
    setInventoryTag(example.inventoryTag)
    setProductType(String(example.productType))
    setModel(String(example.model))
    setQuality(String(example.quality))
    setColor(String(example.color))
    setSize(String(example.size))
    setTagSupplierId(String(example.tagSupplierId))
    setTagType(String(example.tagType))
    setStartSerial(String(example.serial))
    setCount(nextVersion === 1 ? '123' : nextBrand === 'inditex' ? '7' : '6')
    if (nextBrand === 'inditex') {
      setSeedEpc(INDITEX_V2_EXAMPLE.serial === example.serial ? '1028C09E004A34B3470F820A19EF8548' : '')
    } else if (nextVersion === 1) {
      setSeedEpc('09CA359DB64CFE401EE2ADE9992005E3')
    } else {
      setSeedEpc('1048C088004C3250027282210414F641')
    }
  }

  const generated = useMemo<{ epcs: string[]; upc?: string; error?: string }>(() => {
    try {
      const qty = Math.max(0, parseInt(count, 10) || 0)
      if (mode === 'seed') {
        return { epcs: incrementInditexSeed(seedEpc, qty) }
      }
      const fields = fieldsFromForm({
        brandId,
        version,
        inventoryTag,
        productType,
        model,
        quality,
        color,
        size,
        tagSupplierId,
        tagType,
        startSerial,
      })
      return { epcs: generateInditexEpcs(fields, qty), upc: buildInditexUpc(fields) }
    } catch (err) {
      return { epcs: [], error: err instanceof Error ? err.message : 'Invalid input' }
    }
  }, [
    mode,
    seedEpc,
    brandId,
    version,
    inventoryTag,
    productType,
    model,
    quality,
    color,
    size,
    tagSupplierId,
    tagType,
    startSerial,
    count,
  ])

  const handleLoadQr = () => {
    try {
      const qr = parseTempeQrJson(qrText)
      if (qr.brand != null) setBrandId(String(qr.brand))
      if (qr.productType != null) setProductType(String(qr.productType))
      if (qr.model != null) setModel(String(qr.model))
      if (qr.quality != null) setQuality(String(qr.quality))
      if (qr.color != null) setColor(String(qr.color))
      if (qr.size != null) setSize(String(qr.size))
      if (qr.quantity != null) setCount(String(qr.quantity))
      setMode('fields')
      toast.success('Loaded product fields from QR JSON')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid QR JSON')
    }
  }

  const handleLoadEpc = () => {
    try {
      const decoded = decodeInditexEpc(seedEpc)
      setVersion(decoded.version)
      setBrand(brandNameFromId(decoded.brand) ?? (decoded.brand === INDITEX_BRAND_ID.inditex ? 'inditex' : 'tempe'))
      setBrandId(String(decoded.brand))
      setInventoryTag(decoded.inventoryTag)
      setProductType(String(decoded.productType))
      setModel(String(decoded.model))
      setQuality(String(decoded.quality))
      setColor(String(decoded.color))
      setSize(String(decoded.size))
      setTagSupplierId(String(decoded.tagSupplierId))
      setTagType(String(decoded.tagType))
      setStartSerial(String(decoded.serial))
      setMode('fields')
      toast.success(`Loaded ${decoded.version === 1 ? 'V1' : 'V2'} tag (UPC ${decoded.upc})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decode EPC')
    }
  }

  const handleAppend = () => {
    if (generated.error) {
      toast.error(generated.error)
      return
    }
    if (generated.epcs.length === 0) {
      toast.error('Nothing to generate — check your inputs')
      return
    }
    onGenerated(generated.epcs.join('\n'))
    toast.success(`Appended ${generated.epcs.length} Inditex/Tempe EPC${generated.epcs.length === 1 ? '' : 's'}`)
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={variant === 'compact' ? 'h-7 gap-1 rounded-md px-2 text-xs' : 'h-7 gap-1.5 rounded-md px-2 text-xs'}
        onClick={() => setOpen(true)}
        title="Generate Inditex / Tempe 128-bit EPCs"
      >
        <Shirt className="h-3.5 w-3.5" />
        {variant !== 'compact' && <span>Inditex / Tempe</span>}
        {variant === 'compact' && <span>Inditex</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Generate Inditex / Tempe EPCs</DialogTitle>
            <DialogDescription>
              Proprietary 128-bit tags (32 hex), decoded by Edge IND11/13/14. Brand 1 = Inditex,
              brand 2 = Tempe. V2 inventory 1 is counted; inventory 0 is an alarm tag and is skipped
              from pack validation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Brand</Label>
                <Select
                  value={brand}
                  onValueChange={(v) => applyExample(v as InditexBrandName, v === 'inditex' ? 2 : version)}
                >
                  <SelectTrigger className="h-9 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tempe" className="text-sm">
                      Tempe (brand 2)
                    </SelectItem>
                    <SelectItem value="inditex" className="text-sm">
                      Inditex (brand 1)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EPC version</Label>
                <Select
                  value={String(version)}
                  onValueChange={(v) => applyExample(brand, Number(v) as InditexEpcVersion)}
                >
                  <SelectTrigger className="h-9 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2" className="text-sm">
                      V2 (current)
                    </SelectItem>
                    <SelectItem value="1" className="text-sm">
                      V1 (legacy packed SKU)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">How to generate</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as GenerateMode)}>
                  <SelectTrigger className="h-9 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fields" className="text-sm">
                      From product fields
                    </SelectItem>
                    <SelectItem value="seed" className="text-sm">
                      Increment a seed EPC
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {version === 2 && mode === 'fields' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Inventory tag</Label>
                  <Select
                    value={String(inventoryTag)}
                    onValueChange={(v) => setInventoryTag(Number(v) as 0 | 1)}
                  >
                    <SelectTrigger className="h-9 rounded-md text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-sm">
                        1 (counted SKU)
                      </SelectItem>
                      <SelectItem value="0" className="text-sm">
                        0 (alarm tag)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div />
              )}
            </div>

            {mode === 'fields' && (
              <>
                <div className="grid grid-cols-5 gap-2">
                  {(
                    [
                      ['Type', productType, setProductType],
                      ['Model', model, setModel],
                      ['Quality', quality, setQuality],
                      ['Color', color, setColor],
                      ['Size', size, setSize],
                    ] as const
                  ).map(([label, value, setter]) => (
                    <div key={label} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="h-9 rounded-md font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Brand ID</Label>
                    <Input
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                      className="h-9 rounded-md font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tag supplier ID</Label>
                    <Input
                      value={tagSupplierId}
                      onChange={(e) => setTagSupplierId(e.target.value)}
                      className="h-9 rounded-md font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tag type</Label>
                    <Input
                      value={tagType}
                      onChange={(e) => setTagType(e.target.value)}
                      className="h-9 rounded-md font-mono text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Seed EPC (32 hex)</Label>
              <Input
                value={seedEpc}
                onChange={(e) => setSeedEpc(e.target.value)}
                placeholder="1048C088004C3250027282210414F641"
                className="h-9 rounded-md font-mono text-sm"
              />
              {mode === 'seed' && (
                <p className="text-[11px] text-muted-foreground">
                  Each copy adds 1 to the 128-bit value (same as incrementing the last hex digits).
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Count</Label>
                <Input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-9 rounded-md font-mono text-sm"
                />
              </div>
              {mode === 'fields' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Start serial</Label>
                  <Input
                    type="number"
                    min={0}
                    value={startSerial}
                    onChange={(e) => setStartSerial(e.target.value)}
                    className="h-9 rounded-md font-mono text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Paste Tempe QR JSON (optional)</Label>
              <Textarea
                value={qrText}
                onChange={(e) => setQrText(e.target.value)}
                placeholder='{"03":"1","04":"1253","05":"640","06":"100","07":"38","10":"6"}'
                className="min-h-[72px] rounded-md font-mono text-[11px]"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleLoadQr}>
                  Load QR fields
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleLoadEpc} disabled={!seedEpc.trim()}>
                  Decode seed into fields
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyExample(brand, version)}
                >
                  Reset example
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border/40 bg-muted/15 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Preview (first {Math.min(5, generated.epcs.length)})
                </span>
                {generated.upc && (
                  <span className="font-mono text-[11px] text-muted-foreground">UPC {generated.upc}</span>
                )}
                {generated.error && <span className="text-[11px] text-destructive">{generated.error}</span>}
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre font-mono text-[11px] text-foreground/90">
                {generated.epcs.slice(0, 5).join('\n') || '—'}
                {generated.epcs.length > 5 ? `\n…and ${generated.epcs.length - 5} more` : ''}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAppend} disabled={!!generated.error}>
              Append to EPC list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
