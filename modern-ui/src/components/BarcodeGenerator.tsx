import { useState, useRef, useCallback, type ComponentProps } from 'react'
import Barcode from 'react-barcode'
import { QRCodeSVG } from 'qrcode.react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Download, Copy, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown, Upload, FileText, Loader2, Package, ScanLine, Layers, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { QrCodeGenerator } from './QrCodeGenerator'
import { ZplViewerTab } from './ZplViewerTab'
import JSZip from 'jszip'

const BATCH_FORMATS = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar'] as const
type BarcodeFormat = (typeof BATCH_FORMATS)[number]

// Compile-time check: every BarcodeFormat must be assignable to react-barcode's `format` prop.
type _AssertSupported = BarcodeFormat extends NonNullable<ComponentProps<typeof Barcode>['format']> ? true : never
const _assertSupported: _AssertSupported = true
void _assertSupported

interface BarcodeConfig {
  id: string
  text: string
  format: BarcodeFormat
  height: number
}

const FORMAT_EXAMPLES: Record<BarcodeFormat, string> = {
  CODE128: 'ZEUS-12345',
  EAN13: '5901234123457',
  EAN8: '55123457',
  UPC: '036000291452',
  CODE39: 'ZEUS39',
  ITF14: '10012345000017',
  MSI: '1234567',
  pharmacode: '12345',
  codabar: 'A40156B',
}

function getFormatHelp(format: BarcodeFormat) {
  switch (format) {
    case 'EAN13':
      return 'Use 12 or 13 digits'
    case 'EAN8':
      return 'Use 7 or 8 digits'
    case 'UPC':
      return 'Use 11 or 12 digits'
    case 'CODE39':
      return 'Use uppercase letters, numbers, spaces, and - . $ / + %'
    case 'ITF14':
      return 'Use 13 or 14 digits'
    case 'MSI':
      return 'Use digits only'
    case 'pharmacode':
      return 'Use a numeric value between 3 and 131070'
    case 'codabar':
      return 'Start and end with A-D, with digits or - $ : / . + inside'
    case 'CODE128':
    default:
      return 'Use any text or numbers'
  }
}

function normalizeBarcodeValue(value: string, format: BarcodeFormat) {
  const trimmed = value.trim()

  switch (format) {
    case 'EAN13':
    case 'EAN8':
    case 'UPC':
    case 'ITF14':
    case 'MSI':
    case 'pharmacode':
      return trimmed.replace(/\D/g, '')
    case 'CODE39':
      return trimmed.toUpperCase().replace(/[^0-9A-Z \-.$/+%]/g, '')
    case 'codabar':
      return trimmed.toUpperCase().replace(/[^0-9A-D\-:$/.+]/g, '')
    case 'CODE128':
    default:
      return trimmed
  }
}

function isBarcodeValueValid(value: string, format: BarcodeFormat) {
  if (!value) return false

  switch (format) {
    case 'EAN13':
      return /^\d{12,13}$/.test(value)
    case 'EAN8':
      return /^\d{7,8}$/.test(value)
    case 'UPC':
      return /^\d{11,12}$/.test(value)
    case 'CODE39':
      return /^[0-9A-Z \-.$/+%]+$/.test(value)
    case 'ITF14':
      return /^\d{13,14}$/.test(value)
    case 'MSI':
      return /^\d+$/.test(value)
    case 'pharmacode': {
      if (!/^\d+$/.test(value)) return false
      const numericValue = Number(value)
      return numericValue >= 3 && numericValue <= 131070
    }
    case 'codabar':
      return /^[A-D][0-9\-:$/.+]+[A-D]$/.test(value) && value.length >= 3
    case 'CODE128':
    default:
      return value.length > 0
  }
}

function getBarcodeIssue(value: string, format: BarcodeFormat) {
  const normalizedValue = normalizeBarcodeValue(value, format)
  if (isBarcodeValueValid(normalizedValue, format)) return null
  return `${format} is invalid. ${getFormatHelp(format)}.`
}

function generateRandomValue(format: BarcodeFormat) {
  const randomDigits = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')

  switch (format) {
    case 'EAN13':
      return randomDigits(13)
    case 'EAN8':
      return randomDigits(8)
    case 'UPC':
      return randomDigits(12)
    case 'CODE39':
      return Math.random().toString(36).substring(2, 9).toUpperCase().replace(/[^0-9A-Z]/g, '')
    case 'ITF14':
      return randomDigits(14)
    case 'MSI':
      return randomDigits(8)
    case 'pharmacode':
      return String(Math.floor(Math.random() * 50000) + 3)
    case 'codabar':
      return `A${randomDigits(6)}B`
    case 'CODE128':
    default:
      return Math.random().toString(36).substring(2, 10).toUpperCase()
  }
}

export function BarcodeGenerator() {
  const [barcodes, setBarcodes] = useState<BarcodeConfig[]>([
    { id: '1', text: 'ZEUS-12345', format: 'CODE128', height: 100 }
  ])
  const [width, setWidth] = useState(2)
  const [displayValue, setDisplayValue] = useState(true)
  const barcodeRef = useRef<HTMLDivElement>(null)
  const totalCharacters = barcodes.reduce((sum, barcode) => sum + barcode.text.length, 0)
  const invalidCount = barcodes.filter((barcode) => getBarcodeIssue(barcode.text, barcode.format)).length
  const hasInvalidBarcodes = invalidCount > 0

  const generateRandom = (id: string) => {
    const barcode = barcodes.find((item) => item.id === id)
    if (!barcode) return

    updateBarcode(id, { text: generateRandomValue(barcode.format) })
  }

  const addBarcode = () => {
    setBarcodes(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        text: 'NEW-BARCODE',
        format: 'CODE128',
        height: 100
      }
    ])
  }

  const removeBarcode = (id: string) => {
    if (barcodes.length <= 1) {
      toast.error("At least one barcode is required")
      return
    }
    setBarcodes(prev => prev.filter(b => b.id !== id))
  }

  const updateBarcode = (id: string, updates: Partial<BarcodeConfig>) => {
    setBarcodes(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
  }

  const handleFormatChange = (id: string, format: BarcodeFormat) => {
    const barcode = barcodes.find((item) => item.id === id)
    if (!barcode) return

    const normalizedValue = normalizeBarcodeValue(barcode.text, format)
    const nextText = isBarcodeValueValid(normalizedValue, format)
      ? normalizedValue
      : FORMAT_EXAMPLES[format]

    updateBarcode(id, { format, text: nextText })

    if (nextText !== barcode.text) {
      toast.info(`Adjusted value for ${format}. ${getFormatHelp(format)}.`)
    }
  }

  const moveBarcode = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === barcodes.length - 1)
    ) return

    const newBarcodes = [...barcodes]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const [moved] = newBarcodes.splice(index, 1)
    newBarcodes.splice(targetIndex, 0, moved)
    setBarcodes(newBarcodes)
  }

  const getCanvasFromSvgs = async (): Promise<HTMLCanvasElement | null> => {
    if (!barcodeRef.current) return null

    const svgs = barcodeRef.current.querySelectorAll('svg')
    if (svgs.length === 0) return null

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const spacing = 32
    const padding = 20

    const loadSvg = (svg: SVGSVGElement): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const svgData = new XMLSerializer().serializeToString(svg)
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
      })
    }

    try {
      const images = await Promise.all(Array.from(svgs).map(loadSvg))
      
      let maxWidth = 0
      let totalHeight = 0
      
      images.forEach((img, i) => {
        maxWidth = Math.max(maxWidth, img.width)
        totalHeight += img.height
        if (i < images.length - 1) totalHeight += spacing
      })
      
      canvas.width = maxWidth + (padding * 2)
      canvas.height = totalHeight + (padding * 2)

      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      let currentY = padding
      images.forEach((img) => {
        const x = (canvas.width - img.width) / 2
        ctx.drawImage(img, x, currentY)
        currentY += img.height + spacing
      })

      return canvas
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const downloadBarcode = async () => {
    if (hasInvalidBarcodes) {
      toast.error('Fix invalid barcode values before downloading.')
      return
    }

    const canvas = await getCanvasFromSvgs()
    if (canvas) {
      const pngFile = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.download = `barcodes-${barcodes.length}.png`
      downloadLink.href = pngFile
      downloadLink.click()
      toast.success('Barcodes downloaded successfully')
    } else {
      toast.error('Failed to generate image')
    }
  }

  const copyToClipboard = async () => {
    if (hasInvalidBarcodes) {
      toast.error('Fix invalid barcode values before copying.')
      return
    }

    const canvas = await getCanvasFromSvgs()
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          const item = new ClipboardItem({ 'image/png': blob })
          navigator.clipboard.write([item])
          toast.success('Barcodes copied to clipboard')
        }
      })
    } else {
      toast.error('Failed to generate image')
    }
  }

  return (
    <div className="h-full">
      <Tabs defaultValue="barcode" className="h-full flex flex-col">
        <div className="mb-4 px-2">
          <TabsList className="mx-auto grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4 gap-1 p-1" data-tour="tour-gen-modes">
            <TabsTrigger value="barcode" className="w-full px-2 sm:px-3">
              Barcodes
            </TabsTrigger>
            <TabsTrigger value="qrcode" className="w-full px-2 sm:px-3">
              QR Codes
            </TabsTrigger>
            <TabsTrigger value="zpl" className="w-full px-2 sm:px-3">
              ZPL
            </TabsTrigger>
            <TabsTrigger value="batch" className="w-full px-2 sm:px-3" data-tour="tour-gen-batch-tab">
              Batch Export
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="barcode" className="flex-1 mt-0">
          <div className="grid gap-6 md:grid-cols-2 h-full overflow-hidden">
            <div className="space-y-6 overflow-y-auto pr-2">
              <Card className="overflow-hidden border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm" data-tour="tour-gen-config">
                <CardHeader className="pb-4">
                  <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ScanLine className="h-4 w-4 text-primary" />
                          Barcode Creator
                        </div>
                        <CardTitle className="text-2xl">Barcode builder</CardTitle>
                        <CardDescription className="max-w-md text-sm leading-6">
                          Create barcodes and stack them, you can also check the other Batch Export...for batch barcodes exports...
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                          {barcodes.length} item{barcodes.length === 1 ? '' : 's'}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-3 py-1 bg-background/70">
                          {totalCharacters} chars
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm font-medium text-foreground">Global style</Label>
                        <p className="text-xs text-muted-foreground">These settings apply across the full preview sheet.</p>
                      </div>
                      <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                        Shared controls
                      </Badge>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                      <div className="space-y-3 rounded-xl border border-border/40 bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-sm font-medium">Bar width</Label>
                          <span className="text-sm font-medium text-primary">{width}px</span>
                        </div>
                        <Slider
                          value={[width]}
                          min={1}
                          max={3}
                          step={0.5}
                          onValueChange={([v]: number[]) => setWidth(v)}
                        />
                        <p className="text-xs text-muted-foreground">Increase width for a bolder scan profile.</p>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/70 p-4">
                        <div className="space-y-1">
                          <Label className="text-sm font-medium">Human readable text</Label>
                          <p className="text-xs text-muted-foreground">Show the encoded value under each barcode.</p>
                        </div>
                        <Switch checked={displayValue} onCheckedChange={setDisplayValue} aria-label="Toggle barcode text" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-foreground">Barcode stack</Label>
                        <p className="text-xs text-muted-foreground">Reorder cards to control the final sheet layout.</p>
                      </div>
                      <Button size="sm" onClick={addBarcode} className="h-9 rounded-full px-4 shadow-sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Barcode
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {barcodes.map((barcode, index) => (
                        <div key={barcode.id} className="relative space-y-4 rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-md">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 font-mono text-[11px]">
                                  #{String(index + 1).padStart(2, '0')}
                                </Badge>
                                <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                                  {barcode.format}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">Label configuration</p>
                                <p className="text-xs text-muted-foreground">Set the content, symbology, and print height.</p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-full text-destructive hover:text-destructive" 
                              title="Remove barcode"
                              aria-label={`Remove barcode ${index + 1}`}
                              onClick={() => removeBarcode(barcode.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                            <div className="space-y-2">
                              <Label>Content</Label>
                              <div className="flex gap-2">
                                <Input 
                                  value={barcode.text} 
                                  onChange={(e) => updateBarcode(barcode.id, { text: e.target.value })} 
                                  placeholder="Enter text..."
                                  className="h-11 rounded-xl border-border/50 bg-background/80"
                                />
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-11 w-11 rounded-xl"
                                  onClick={() => generateRandom(barcode.id)} 
                                  title="Generate Random"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2 sm:w-[180px]">
                              <Label>Format</Label>
                              <Select value={barcode.format} onValueChange={(value) => handleFormatChange(barcode.id, value as BarcodeFormat)}>
                                <SelectTrigger className="h-11 rounded-xl border-border/50 bg-background/80">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {BATCH_FORMATS.map((format) => (
                                    <SelectItem key={format} value={format}>
                                      {format}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">{getFormatHelp(barcode.format)}</p>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                            <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
                              <div className="flex items-center justify-between gap-2">
                                <Label>Height</Label>
                                <span className="text-sm font-medium text-primary">{barcode.height}px</span>
                              </div>
                              <Slider 
                                value={[barcode.height]} 
                                min={30} 
                                max={200} 
                                step={5} 
                                onValueChange={([v]: number[]) => updateBarcode(barcode.id, { height: v })} 
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-10 w-10 rounded-xl"
                                disabled={index === 0}
                                onClick={() => moveBarcode(index, 'up')}
                                title="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-10 w-10 rounded-xl border border-border/50"
                                disabled={index === barcodes.length - 1}
                                onClick={() => moveBarcode(index, 'down')}
                                title="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <p className={`text-xs ${getBarcodeIssue(barcode.text, barcode.format) ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {getBarcodeIssue(barcode.text, barcode.format) ?? `Preview ready. Example: ${FORMAT_EXAMPLES[barcode.format]}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="h-full flex flex-col overflow-hidden border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm" data-tour="tour-gen-preview">
                <CardHeader className="border-b border-border/50 pb-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Layers className="h-4 w-4 text-primary" />
                        Live composition
                      </div>
                      <CardTitle className="text-2xl">Preview Section</CardTitle>
                      <CardDescription className="max-w-md">
                        Review spacing, readability, and the final export stack before saving.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {displayValue ? 'Text visible' : 'Text hidden'}
                      </Badge>
                      <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                        Scale {width}px
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-0">
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sheet</p>
                      <p className="mt-2 text-2xl font-semibold">{barcodes.length}</p>
                      <p className="text-xs text-muted-foreground">barcode layers</p>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Symbology</p>
                      <p className="mt-2 text-lg font-semibold">{barcodes[0]?.format ?? 'CODE128'}</p>
                      <p className="text-xs text-muted-foreground">first active format</p>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                      <div className={`mt-2 flex items-center gap-2 text-sm font-medium ${hasInvalidBarcodes ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        <Sparkles className="h-4 w-4" />
                        {hasInvalidBarcodes ? `${invalidCount} issue${invalidCount === 1 ? '' : 's'} to fix` : 'Ready to export'}
                      </div>
                      <p className="text-xs text-muted-foreground">updates in real time</p>
                    </div>
                  </div>
                  <div className="mt-6 flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-3xl border border-border/50 bg-muted/20">
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4">
                      <div
                        ref={barcodeRef}
                        className="flex min-w-[280px] flex-col items-center gap-8 rounded-[28px] border border-border/40 bg-white px-8 py-10 shadow-2xl transition-all duration-200"
                      >
                        {barcodes.map((barcode) => (
                          <div key={barcode.id} className="flex flex-col items-center">
                            {getBarcodeIssue(barcode.text, barcode.format) ? (
                              <div className="flex min-h-[140px] w-full min-w-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-5 text-center">
                                <p className="text-sm font-medium text-destructive">{barcode.format} needs a compatible value</p>
                                <p className="mt-2 text-xs text-muted-foreground">{getFormatHelp(barcode.format)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Example: {FORMAT_EXAMPLES[barcode.format]}</p>
                              </div>
                            ) : (
                              <Barcode
                                value={normalizeBarcodeValue(barcode.text, barcode.format)}
                                format={barcode.format}
                                width={width}
                                height={barcode.height}
                                displayValue={displayValue}
                                background="#ffffff"
                                lineColor="#000000"
                                margin={8}
                                textMargin={6}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="flex flex-col gap-3 p-6 pt-0 sm:flex-row sm:justify-center">
                  <Button className="w-full sm:w-auto rounded-full px-5" onClick={downloadBarcode} disabled={hasInvalidBarcodes}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PNG
                  </Button>
                  <Button variant="outline" className="w-full rounded-full px-5 sm:w-auto" onClick={copyToClipboard} disabled={hasInvalidBarcodes}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Image
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="qrcode" className="flex-1 mt-0">
          <QrCodeGenerator />
        </TabsContent>

        <TabsContent value="zpl" className="flex-1 mt-0 min-h-0">
          <ZplViewerTab />
        </TabsContent>

        <TabsContent value="batch" className="flex-1 mt-0">
          <BatchExport />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function svgToPngBlob(svg: SVGSVGElement, padding = 10): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width + padding * 2
      canvas.height = img.height + padding * 2
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, padding, padding)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to convert canvas to blob'))
      }, 'image/png')
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  })
}

function BatchExport() {
  const [csvText, setCsvText] = useState('')
  const [batchType, setBatchType] = useState<'barcode' | 'qr'>('barcode')
  const [batchFormat, setBatchFormat] = useState<BarcodeFormat>('CODE128')
  const [batchHeight, setBatchHeight] = useState(80)
  const [batchWidth, setBatchWidth] = useState(2)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const renderRef = useRef<HTMLDivElement>(null)

  const values = csvText.split('\n').map((l) => l.trim()).filter(Boolean)

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => setCsvText((ev.target?.result as string) || '')
      reader.readAsText(file)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => setCsvText((ev.target?.result as string) || '')
      reader.readAsText(file)
    }
  }, [])

  const generateZip = useCallback(async () => {
    if (values.length === 0) return

    const preparedValues = batchType === 'barcode'
      ? values.map((value) => normalizeBarcodeValue(value, batchFormat))
      : values

    if (batchType === 'barcode') {
      const invalidValues = preparedValues.filter((value) => !isBarcodeValueValid(value, batchFormat))
      if (invalidValues.length > 0) {
        toast.error(`${invalidValues.length} value(s) do not match ${batchFormat}. ${getFormatHelp(batchFormat)}.`)
        return
      }
    }

    setGenerating(true)
    setProgress(0)

    const zip = new JSZip()

    try {
      for (let i = 0; i < preparedValues.length; i++) {
        const val = preparedValues[i]
        const container = document.createElement('div')
        container.style.position = 'absolute'
        container.style.left = '-9999px'
        container.style.top = '-9999px'
        document.body.appendChild(container)

        if (batchType === 'qr') {
          const { createRoot } = await import('react-dom/client')
          const root = createRoot(container)
          root.render(
            <QRCodeSVG value={val} size={Math.max(128, batchHeight)} level="M" includeMargin />
          )
          await new Promise((r) => setTimeout(r, 50))
          const svg = container.querySelector('svg')
          if (svg) {
            const blob = await svgToPngBlob(svg)
            zip.file(`${String(i + 1).padStart(3, '0')}_${val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.png`, blob)
          }
          root.unmount()
        } else {
          const { createRoot } = await import('react-dom/client')
          const root = createRoot(container)
          root.render(
            <Barcode
              value={val}
              format={batchFormat}
              width={batchWidth}
              height={batchHeight}
              displayValue
              background="#ffffff"
              lineColor="#000000"
              margin={8}
              textMargin={6}
              renderer="svg"
            />
          )
          await new Promise((r) => setTimeout(r, 50))
          const svg = container.querySelector('svg')
          if (svg) {
            const blob = await svgToPngBlob(svg as SVGSVGElement)
            zip.file(`${String(i + 1).padStart(3, '0')}_${val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.png`, blob)
          }
          root.unmount()
        }

        document.body.removeChild(container)
        setProgress(Math.round(((i + 1) / preparedValues.length) * 100))
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${batchType}-batch-${values.length}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Generated ${values.length} ${batchType === 'qr' ? 'QR codes' : 'barcodes'} in ZIP`)
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message || 'Unknown error'}`)
    } finally {
      setGenerating(false)
      setProgress(0)
    }
  }, [values, batchType, batchFormat, batchHeight, batchWidth])

  return (
    <div className="grid gap-6 md:grid-cols-2 h-full overflow-hidden">
      <div className="space-y-6 overflow-y-auto pr-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Batch Export</CardTitle>
            <CardDescription>Upload a list of values, generate a ZIP of barcodes or QR codes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={batchType} onValueChange={(v) => setBatchType(v as 'barcode' | 'qr')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="barcode">Barcode</SelectItem>
                  <SelectItem value="qr">QR Code</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {batchType === 'barcode' && (
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={batchFormat} onValueChange={(v) => setBatchFormat(v as BarcodeFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BATCH_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{getFormatHelp(batchFormat)}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {batchType === 'barcode' && (
                <div className="space-y-2">
                  <Label>Bar Width: {batchWidth}px</Label>
                  <Slider value={[batchWidth]} min={1} max={3} step={0.5} onValueChange={([v]: number[]) => setBatchWidth(v)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Height: {batchHeight}px</Label>
                <Slider value={[batchHeight]} min={40} max={256} step={8} onValueChange={([v]: number[]) => setBatchHeight(v)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Values (one per line)</Label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="relative"
              >
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={"ZEUS-001\nZEUS-002\nZEUS-003\n...\n\nOr drag & drop a CSV/text file here"}
                  rows={10}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                />
                <label className="absolute bottom-2 right-2 flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-white/10 transition-colors">
                  <Upload className="w-3 h-3" />
                  Upload
                  <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileSelect} />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="h-full flex flex-col border-border/50">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Review and generate your batch export</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-muted-foreground/25 bg-white/5 p-6">
              {values.length === 0 ? (
                <div className="text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">Paste or upload values to get started</p>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-4xl font-bold tabular-nums">{values.length}</p>
                    <p className="text-sm text-muted-foreground mt-1">{batchType === 'qr' ? 'QR codes' : 'barcodes'} to generate</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 text-center">
                    <p>Type: <span className="font-medium text-foreground">{batchType === 'qr' ? 'QR Code' : batchFormat}</span></p>
                    <p>Height: <span className="font-medium text-foreground">{batchHeight}px</span></p>
                    {batchType === 'barcode' && <p>Width: <span className="font-medium text-foreground">{batchWidth}px</span></p>}
                    <p>Output: <span className="font-medium text-foreground">ZIP (PNG files)</span></p>
                  </div>
                  {values.length <= 5 && (
                    <div className="w-full text-xs font-mono text-muted-foreground bg-muted/30 rounded-lg p-2 max-h-24 overflow-auto">
                      {values.map((v, i) => <div key={i} className="truncate">{i + 1}. {v}</div>)}
                    </div>
                  )}
                  {values.length > 5 && (
                    <div className="w-full text-xs font-mono text-muted-foreground bg-muted/30 rounded-lg p-2">
                      {values.slice(0, 3).map((v, i) => <div key={i} className="truncate">{i + 1}. {v}</div>)}
                      <div className="text-center opacity-50">... {values.length - 3} more</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {generating && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Generating...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </CardContent>
          <div className="p-6 pt-0 flex justify-center">
            <Button className="w-full sm:w-auto gap-2" onClick={generateZip} disabled={generating || values.length === 0}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {generating ? `Generating (${progress}%)` : `Generate ZIP (${values.length} items)`}
            </Button>
          </div>
        </Card>
      </div>

      <div ref={renderRef} className="hidden" />
    </div>
  )
}
