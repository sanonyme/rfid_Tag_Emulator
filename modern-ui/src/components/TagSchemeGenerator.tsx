import { useMemo, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
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
  type EpcScheme,
  EPC_SCHEME_LABELS,
  generateSgtin96,
  generateSgtin198,
  generateSscc96,
  generateSgln96,
  generateGiai96,
  generateGrai96,
} from '@/lib/epc-encoders'

interface TagSchemeGeneratorProps {
  /** Called with newline-separated EPCs after the user generates and accepts them. */
  onGenerated: (epcs: string) => void
  variant?: 'default' | 'compact'
}

const SCHEMES: EpcScheme[] = ['sgtin-96', 'sgtin-198', 'sscc-96', 'sgln-96', 'giai-96', 'grai-96']

const SCHEME_HELP: Record<EpcScheme, string> = {
  'sgtin-96': 'Serialized GTIN: identifies individual product instances. Most common retail scheme.',
  'sgtin-198': 'SGTIN with a 20-char ASCII serial. Use when serials contain letters.',
  'sscc-96': 'Serial Shipping Container Code. Identifies logistics units (cartons, pallets).',
  'sgln-96': 'Serialized Global Location Number. Identifies physical locations.',
  'giai-96': 'Global Individual Asset Identifier. Identifies fixed assets.',
  'grai-96': 'Global Returnable Asset Identifier. Identifies returnable assets.',
}

export function TagSchemeGenerator({ onGenerated, variant = 'default' }: TagSchemeGeneratorProps) {
  const [open, setOpen] = useState(false)
  const [scheme, setScheme] = useState<EpcScheme>('sgtin-198')
  const [filter, setFilter] = useState('0')
  const [count, setCount] = useState('5')
  const [startSerial, setStartSerial] = useState('1')

  // SGTIN
  const [gtin, setGtin] = useState('00012345678905')
  const [companyPrefixLength, setCompanyPrefixLength] = useState('6')
  const [serialPrefix, setSerialPrefix] = useState('')
  // SSCC / SGLN / GIAI / GRAI
  const [companyPrefix, setCompanyPrefix] = useState('012345')
  const [otherField, setOtherField] = useState('') // serial-ref / location-ref / asset-ref / asset-type

  const preview = useMemo<{ epcs: string[]; error?: string }>(() => {
    try {
      const qty = Math.max(0, Math.min(50, parseInt(count, 10) || 0))
      const startN = Math.max(0, parseInt(startSerial, 10) || 0)
      const filterN = Math.max(0, Math.min(7, parseInt(filter, 10) || 0))
      const cpl = Math.max(6, Math.min(12, parseInt(companyPrefixLength, 10) || 6))
      switch (scheme) {
        case 'sgtin-96':
          return { epcs: generateSgtin96(gtin, qty, startN, cpl, filterN) }
        case 'sgtin-198':
          return { epcs: generateSgtin198(gtin, qty, startN, serialPrefix, cpl, filterN) }
        case 'sscc-96':
          return { epcs: generateSscc96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'sgln-96':
          return { epcs: generateSgln96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'giai-96':
          return { epcs: generateGiai96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'grai-96':
          return { epcs: generateGrai96(companyPrefix, otherField || '0', qty, startN, filterN) }
      }
    } catch (err) {
      return { epcs: [], error: err instanceof Error ? err.message : 'Invalid input' }
    }
  }, [scheme, gtin, companyPrefix, otherField, count, startSerial, filter, companyPrefixLength, serialPrefix])

  const fullEpcs = useMemo<{ epcs: string[]; error?: string }>(() => {
    try {
      const qty = Math.max(0, parseInt(count, 10) || 0)
      const startN = Math.max(0, parseInt(startSerial, 10) || 0)
      const filterN = Math.max(0, Math.min(7, parseInt(filter, 10) || 0))
      const cpl = Math.max(6, Math.min(12, parseInt(companyPrefixLength, 10) || 6))
      switch (scheme) {
        case 'sgtin-96':
          return { epcs: generateSgtin96(gtin, qty, startN, cpl, filterN) }
        case 'sgtin-198':
          return { epcs: generateSgtin198(gtin, qty, startN, serialPrefix, cpl, filterN) }
        case 'sscc-96':
          return { epcs: generateSscc96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'sgln-96':
          return { epcs: generateSgln96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'giai-96':
          return { epcs: generateGiai96(companyPrefix, otherField || '0', qty, startN, filterN) }
        case 'grai-96':
          return { epcs: generateGrai96(companyPrefix, otherField || '0', qty, startN, filterN) }
      }
    } catch (err) {
      return { epcs: [], error: err instanceof Error ? err.message : 'Invalid input' }
    }
  }, [scheme, gtin, companyPrefix, otherField, count, startSerial, filter, companyPrefixLength, serialPrefix])

  const isGtinScheme = scheme === 'sgtin-96' || scheme === 'sgtin-198'

  const otherFieldLabel: Record<EpcScheme, string> = {
    'sgtin-96': '',
    'sgtin-198': '',
    'sscc-96': 'Serial reference (digits)',
    'sgln-96': 'Location reference (digits)',
    'giai-96': 'Asset reference (digits)',
    'grai-96': 'Asset type (digits)',
  }

  const handleAppend = () => {
    if (fullEpcs.error) {
      toast.error(fullEpcs.error)
      return
    }
    if (fullEpcs.epcs.length === 0) {
      toast.error('Nothing to generate — check your inputs')
      return
    }
    onGenerated(fullEpcs.epcs.join('\n'))
    toast.success(`Appended ${fullEpcs.epcs.length} EPC${fullEpcs.epcs.length === 1 ? '' : 's'} to EPC list`)
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={variant === 'compact' ? 'h-7 gap-1 rounded-md px-2 text-xs' : 'h-7 gap-1.5 rounded-md px-2 text-xs'}
        onClick={() => setOpen(true)}
        title="Generate EPCs for SSCC / SGLN / GIAI / GRAI / SGTIN-198"
      >
        <Wand2 className="h-3.5 w-3.5" />
        {variant !== 'compact' && <span>More schemes</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Generate EPCs (other schemes)</DialogTitle>
            <DialogDescription>
              Generate hex EPCs from a non-SGTIN-96 GS1 identity (SSCC, SGLN, GIAI, GRAI) or a long
              ASCII serial (SGTIN-198), and append them to the Direct EPC list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Scheme</Label>
                <Select value={scheme} onValueChange={(v) => setScheme(v as EpcScheme)}>
                  <SelectTrigger className="h-9 rounded-md text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEMES.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm">
                        {EPC_SCHEME_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Filter (0–7)</Label>
                <Input
                  type="number"
                  min={0}
                  max={7}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-9 rounded-md font-mono text-sm"
                />
              </div>
            </div>

            <p className="rounded-md bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {SCHEME_HELP[scheme]}
            </p>

            {isGtinScheme ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">GTIN-14 (UPC will be left-padded)</Label>
                  <Input
                    value={gtin}
                    onChange={(e) => setGtin(e.target.value)}
                    placeholder="00012345678905"
                    className="h-9 rounded-md font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Company prefix length</Label>
                    <Select value={companyPrefixLength} onValueChange={setCompanyPrefixLength}>
                      <SelectTrigger className="h-9 rounded-md text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <SelectItem key={n} value={String(n)} className="text-sm">
                            {n} digits (partition {12 - n})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {scheme === 'sgtin-198' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Serial prefix (optional)</Label>
                      <Input
                        value={serialPrefix}
                        onChange={(e) => setSerialPrefix(e.target.value)}
                        placeholder="e.g. SN-"
                        className="h-9 rounded-md font-mono text-sm"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Company prefix (digits)</Label>
                  <Input
                    value={companyPrefix}
                    onChange={(e) => setCompanyPrefix(e.target.value)}
                    placeholder="012345"
                    className="h-9 rounded-md font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{otherFieldLabel[scheme]}</Label>
                  <Input
                    value={otherField}
                    onChange={(e) => setOtherField(e.target.value)}
                    placeholder="0"
                    className="h-9 rounded-md font-mono text-sm"
                  />
                </div>
              </>
            )}

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
              <div className="space-y-1.5">
                <Label className="text-xs">Start serial / extension</Label>
                <Input
                  type="number"
                  min={0}
                  value={startSerial}
                  onChange={(e) => setStartSerial(e.target.value)}
                  className="h-9 rounded-md font-mono text-sm"
                />
              </div>
            </div>

            <div className="rounded-md border border-border/40 bg-muted/15 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Preview (first {preview.epcs.length})
                </span>
                {preview.error && (
                  <span className="text-[11px] text-destructive">{preview.error}</span>
                )}
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre font-mono text-[11px] text-foreground/90">
                {preview.epcs.slice(0, 5).join('\n') || '—'}
                {preview.epcs.length > 5 ? `\n…and ${preview.epcs.length - 5} more` : ''}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAppend} disabled={!!fullEpcs.error}>
              Append to EPC list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
