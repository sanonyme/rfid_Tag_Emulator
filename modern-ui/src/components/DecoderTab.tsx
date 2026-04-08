import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { EPCDecoder, EPCEncoder, uidToEpcSerial } from '../lib/decoder'
import { ArrowDown, ArrowUp, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"

const PARTITION_TABLE = [
  { companyBits: 40, itemBits: 4 },
  { companyBits: 37, itemBits: 7 },
  { companyBits: 34, itemBits: 10 },
  { companyBits: 30, itemBits: 14 },
  { companyBits: 27, itemBits: 17 },
  { companyBits: 24, itemBits: 20 },
  { companyBits: 20, itemBits: 24 },
]

const BIT_SEGMENTS = [
  { label: 'Header', bits: 8, color: 'bg-blue-500', text: 'text-blue-200' },
  { label: 'Filter', bits: 3, color: 'bg-emerald-500', text: 'text-emerald-200' },
  { label: 'Partition', bits: 3, color: 'bg-amber-500', text: 'text-amber-200' },
  { label: 'Company', bits: 0, color: 'bg-violet-500', text: 'text-violet-200' },
  { label: 'Item Ref', bits: 0, color: 'bg-rose-500', text: 'text-rose-200' },
  { label: 'Serial', bits: 38, color: 'bg-cyan-500', text: 'text-cyan-200' },
]

function EpcBitVisualizer({ decoded }: {
  decoded: { filter?: number; partition?: number; companyPrefix?: string; itemReference?: string; serial?: string }
}) {
  const partition = decoded.partition ?? 0
  const rule = PARTITION_TABLE[partition] || PARTITION_TABLE[0]

  const segments = BIT_SEGMENTS.map((seg, i) => {
    let bits = seg.bits
    let value = ''
    if (i === 3) { bits = rule.companyBits; value = decoded.companyPrefix || '' }
    else if (i === 4) { bits = rule.itemBits; value = decoded.itemReference || '' }
    else if (i === 0) value = '0x30'
    else if (i === 1) value = String(decoded.filter ?? '')
    else if (i === 2) value = String(decoded.partition ?? '')
    else if (i === 5) value = decoded.serial || ''
    return { ...seg, bits, value }
  })

  const totalBits = 96

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">SGTIN-96 Bit Structure</p>
      <div className="flex rounded-lg overflow-hidden h-10 border border-border/50">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} relative flex items-center justify-center overflow-hidden transition-all group`}
            style={{ width: `${(seg.bits / totalBits) * 100}%` }}
            title={`${seg.label}: ${seg.bits} bits — ${seg.value}`}
          >
            {seg.bits >= 8 && (
              <span className="text-[10px] font-bold text-white truncate px-1 drop-shadow-sm">
                {seg.label}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex rounded-lg overflow-hidden h-7 border border-border/50 bg-muted/30">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex items-center justify-center overflow-hidden border-r border-border/20 last:border-0"
            style={{ width: `${(seg.bits / totalBits) * 100}%` }}
          >
            <span className="text-[9px] font-mono truncate px-0.5 text-muted-foreground">
              {seg.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
            <span className="text-[10px] text-muted-foreground">{seg.label} ({seg.bits}b)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DecoderTab() {
  // Decode State
  const [epcInput, setEpcInput] = useState('')
  const [decodedResult, setDecodedResult] = useState<{
    gtin?: string
    serial?: string
    error?: string
    companyPrefix?: string
    itemReference?: string
    filter?: number
    partition?: number
  } | null>(null)

  // Encode State
  const [gtinInput, setGtinInput] = useState('')
  const [serialInput, setSerialInput] = useState('')
  const [companyPrefixLen, setCompanyPrefixLen] = useState('6') // Default to 6
  const [filterValue, setFilterValue] = useState('0') // Default to 0 (All Others)
  const [encodedResult, setEncodedResult] = useState<{
    epc?: string
    error?: string
  } | null>(null)

  const [copied, setCopied] = useState(false)
  const [serialIsUid, setSerialIsUid] = useState(false)

  const handleDecode = () => {
    if (!epcInput.trim()) {
      setDecodedResult(null)
      return
    }

    try {
      // Remove spaces or colons if user pasted formatted hex
      const cleanEpc = epcInput.replace(/[^0-9A-Fa-f]/g, '')
      const result = EPCDecoder.decodeSgtin96(cleanEpc)
      setDecodedResult(result)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('EPC Decoded successfully')
      }
    } catch (e) {
      setDecodedResult({ error: 'Invalid EPC format' })
      toast.error('Invalid EPC format')
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
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('EPC Encoded successfully')
      }
    } catch (e) {
      setEncodedResult({ error: 'Encoding failed' })
      toast.error('Encoding failed')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-full flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Decoder Section */}
        <Card className="flex flex-col h-full border-border/50 bg-card" data-tour="tour-decoder-decode">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDown className="w-5 h-5 text-primary" />
              EPC Decoder
            </CardTitle>
            <CardDescription>
              Convert Hex EPC to GTIN + Serial
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="space-y-2">
              <Label>EPC (Hex)</Label>
              <Textarea 
                placeholder="e.g. 3034257BF400B40000000123" 
                value={epcInput}
                onChange={(e) => setEpcInput(e.target.value)}
                className="font-mono"
                rows={3}
              />
              <Button onClick={handleDecode} className="w-full">Decode</Button>
            </div>

            {decodedResult && (
              <div className={`mt-4 p-4 rounded-lg border ${decodedResult.error ? 'bg-destructive/10 border-destructive/50' : 'bg-secondary/50 border-secondary'}`}>
                {decodedResult.error ? (
                  <p className="text-destructive font-medium">{decodedResult.error}</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">GTIN-14:</span>
                      <span className="col-span-2 font-mono font-medium">{decodedResult.gtin}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Check Digit:</span>
                      <span className="col-span-2 font-mono text-primary font-bold">{decodedResult.gtin?.slice(-1)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Serial:</span>
                      <span className="col-span-2 font-mono font-medium">{decodedResult.serial}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Filter:</span>
                      <span className="col-span-2 font-mono">{decodedResult.filter}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Partition:</span>
                      <span className="col-span-2 font-mono">{decodedResult.partition}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Company:</span>
                      <span className="col-span-2 font-mono">{decodedResult.companyPrefix}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">Item Ref:</span>
                      <span className="col-span-2 font-mono">{decodedResult.itemReference}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {decodedResult && !decodedResult.error && (
              <EpcBitVisualizer decoded={decodedResult} />
            )}
          </CardContent>
        </Card>

        {/* Encoder Section */}
        <Card className="flex flex-col h-full border-border/50 bg-card" data-tour="tour-decoder-encode">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUp className="w-5 h-5 text-primary" />
              EPC Encoder
            </CardTitle>
            <CardDescription>
              Convert GTIN + Serial to Hex EPC
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="space-y-2">
              <Label>GTIN / UPC</Label>
              <Input 
                placeholder="e.g. 1234567890123" 
                value={gtinInput}
                onChange={(e) => setGtinInput(e.target.value)}
                className="font-mono"
              />
              {(() => {
                const digits = gtinInput.replace(/[^0-9]/g, '')
                if (digits.length === 13) {
                  const check = EPCDecoder.calculateCheckDigit(digits)
                  return (
                    <p className="text-xs text-muted-foreground">
                      Calculated Check Digit: <span className="text-primary font-bold">{check}</span>
                    </p>
                  )
                }
                if (digits.length === 14) {
                  const payload = digits.slice(0, 13)
                  const providedCheck = digits.slice(-1)
                  const calcCheck = EPCDecoder.calculateCheckDigit(payload)
                  const isValid = providedCheck === calcCheck
                  return (
                    <p className={`text-xs ${isValid ? 'text-primary' : 'text-destructive'}`}>
                      Check Digit: {isValid ? 'Valid' : `Invalid (Expected ${calcCheck})`}
                    </p>
                  )
                }
                return null
              })()}
            </div>
            
            <div className="space-y-2">
              <Label>Serial Number</Label>
              <Input 
                placeholder={serialIsUid ? "e.g. E0167801034E89FC" : "e.g. 12345"} 
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                className="font-mono"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="serial-is-uid"
                  checked={serialIsUid}
                  onChange={(e) => setSerialIsUid(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="serial-is-uid" className="text-xs font-normal cursor-pointer">
                  Input is UID (E016 + 12 hex)
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Prefix Length</Label>
                <Select value={companyPrefixLen} onValueChange={setCompanyPrefixLen}>
                  <SelectTrigger>
                    <SelectValue placeholder="Length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 Digits</SelectItem>
                    <SelectItem value="7">7 Digits</SelectItem>
                    <SelectItem value="8">8 Digits</SelectItem>
                    <SelectItem value="9">9 Digits</SelectItem>
                    <SelectItem value="10">10 Digits</SelectItem>
                    <SelectItem value="11">11 Digits</SelectItem>
                    <SelectItem value="12">12 Digits</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Filter Value</Label>
                <Select value={filterValue} onValueChange={setFilterValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - All Others (Retail)</SelectItem>
                    <SelectItem value="1">1 - POS Trade Item</SelectItem>
                    <SelectItem value="2">2 - Full Case Transport</SelectItem>
                    <SelectItem value="3">3 - Reserved</SelectItem>
                    <SelectItem value="4">4 - Inner Pack</SelectItem>
                    <SelectItem value="5">5 - Reserved</SelectItem>
                    <SelectItem value="6">6 - Unit Load</SelectItem>
                    <SelectItem value="7">7 - Component</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleEncode} variant="secondary" className="w-full mt-2">Encode</Button>

            {encodedResult && (
              <div className={`mt-4 p-4 rounded-lg border ${encodedResult.error ? 'bg-destructive/10 border-destructive/50' : 'bg-primary/10 border-primary/20'}`}>
                {encodedResult.error ? (
                  <p className="text-destructive font-medium">{encodedResult.error}</p>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Generated EPC (Hex)</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block p-2 rounded bg-background/50 border font-mono text-sm break-all">
                        {encodedResult.epc}
                      </code>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => encodedResult.epc && copyToClipboard(encodedResult.epc)}
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
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
