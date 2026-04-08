import { useState, useRef, useCallback, type ComponentProps } from 'react'
import Barcode from 'react-barcode'
import { QRCodeSVG } from 'qrcode.react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Download, Copy, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown, Upload, FileText, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { QrCodeGenerator } from './QrCodeGenerator'
import JSZip from 'jszip'

type BarcodeFormat = NonNullable<ComponentProps<typeof Barcode>['format']>

interface BarcodeConfig {
  id: string
  text: string
  format: BarcodeFormat
  height: number
}

export function BarcodeGenerator() {
  const [barcodes, setBarcodes] = useState<BarcodeConfig[]>([
    { id: '1', text: 'ZEUS-12345', format: 'CODE128', height: 100 }
  ])
  const [width, setWidth] = useState(2)
  const [displayValue, setDisplayValue] = useState(true)
  const barcodeRef = useRef<HTMLDivElement>(null)

  const generateRandom = (id: string) => {
    const random = Math.random().toString(36).substring(2, 10).toUpperCase()
    updateBarcode(id, { text: random })
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
          <TabsList className="mx-auto grid w-full max-w-2xl grid-cols-3 gap-1 p-1" data-tour="tour-gen-modes">
            <TabsTrigger value="barcode" className="w-full px-2 sm:px-3">
              Barcodes
            </TabsTrigger>
            <TabsTrigger value="qrcode" className="w-full px-2 sm:px-3">
              QR Codes
            </TabsTrigger>
            <TabsTrigger value="batch" className="w-full px-2 sm:px-3" data-tour="tour-gen-batch-tab">
              Batch Export
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="barcode" className="flex-1 mt-0">
          <div className="grid gap-6 md:grid-cols-2 h-full overflow-hidden">
            <div className="space-y-6 overflow-y-auto pr-2">
              <Card className="border-border/50" data-tour="tour-gen-config">
                <CardHeader className="pb-3">
                  <CardTitle>Configuration</CardTitle>
                  <CardDescription>Customize your barcode settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Global Settings */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                    <Label className="text-muted-foreground">Global Settings</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Width (Scale): {width}px</Label>
                        <Slider 
                          value={[width]} 
                          min={1} 
                          max={3} 
                          step={0.5} 
                          onValueChange={([v]: number[]) => setWidth(v)} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Show Text</Label>
                        <Select value={displayValue ? "yes" : "no"} onValueChange={(v) => setDisplayValue(v === "yes")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Barcodes</Label>
                      <Button size="sm" onClick={addBarcode} className="h-8">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Barcode
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {barcodes.map((barcode, index) => (
                        <div key={barcode.id} className="p-4 border rounded-lg bg-card space-y-4 relative">
                          <div className="absolute right-2 top-2 flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6" 
                              disabled={index === 0}
                              onClick={() => moveBarcode(index, 'up')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              disabled={index === barcodes.length - 1}
                              onClick={() => moveBarcode(index, 'down')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => removeBarcode(barcode.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label>Content</Label>
                            <div className="flex gap-2">
                              <Input 
                                value={barcode.text} 
                                onChange={(e) => updateBarcode(barcode.id, { text: e.target.value })} 
                                placeholder="Enter text..."
                              />
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => generateRandom(barcode.id)} 
                                title="Generate Random"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Height: {barcode.height}px</Label>
                            <Slider 
                              value={[barcode.height]} 
                              min={30} 
                              max={200} 
                              step={5} 
                              onValueChange={([v]: number[]) => updateBarcode(barcode.id, { height: v })} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="h-full flex flex-col border-border/50" data-tour="tour-gen-preview">
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>Live preview of your generated barcodes</CardDescription>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-0">
                  <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-lg border border-dashed border-muted-foreground/25 bg-white/5">
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4">
                      <div
                        ref={barcodeRef}
                        className="flex flex-col items-center gap-8 rounded-lg bg-white p-8 shadow-lg transition-all duration-200"
                      >
                        {barcodes.map((barcode) => (
                          <div key={barcode.id} className="flex flex-col items-center">
                            <Barcode
                              value={barcode.text}
                              format={barcode.format}
                              width={width}
                              height={barcode.height}
                              displayValue={displayValue}
                              background="#ffffff"
                              lineColor="#000000"
                              margin={0}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
                <div className="p-6 pt-0 flex justify-center gap-4">
                  <Button className="w-full sm:w-auto" onClick={downloadBarcode}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PNG
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={copyToClipboard}>
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

        <TabsContent value="batch" className="flex-1 mt-0">
          <BatchExport />
        </TabsContent>
      </Tabs>
    </div>
  )
}

const BATCH_FORMATS: BarcodeFormat[] = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar']

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
    setGenerating(true)
    setProgress(0)

    const zip = new JSZip()

    try {
      for (let i = 0; i < values.length; i++) {
        const val = values[i]
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
              margin={0}
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
        setProgress(Math.round(((i + 1) / values.length) * 100))
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
