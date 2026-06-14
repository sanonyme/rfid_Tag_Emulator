import { useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Textarea } from './ui/textarea'
import { Download, Copy, RefreshCw, Trash2, Boxes, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { SegmentedTabs } from './SegmentedTabs'
import { SimpleQrCodeGenerator } from './SimpleQrCodeGenerator'
import { Badge } from './ui/badge'
import { Reveal } from './Reveal'

const FIELD_MAPPINGS: Record<string, string> = {
  "00": "Version",
  "01": "Type",
  "02": "Section_Type",
  "03": "Product_Type",
  "04": "Model",
  "05": "Quality / Grade",
  "06": "Color",
  "07": "Size",
  "08": "Season",
  "09": "Units",
  "10": "UnitsQ / Quantity",
  "11": "UXL",
  "12": "Provider_ID",
  "13": "Order_PO",
  "14": "Destination",
  "15": "Bulk",
  "16": "Batch",
  "17": "Total_Lumps",
  "18": "Bulk_ID",
  "19": "Packing_ID",
  "20": "Size_ID"
};

const DEFAULT_VALUES: Record<string, string> = {
  "10": "6",
  "11": "1",
  "12": "872818",
  "13": "94828-P/2",
  "14": "10079",
  "15": "216",
  "16": "0",
  "17": "416",
  "18": "389734475",
  "19": "0",
  "20": "38",
  "00": "1",
  "01": "1",
  "02": "2/1",
  "03": "1",
  "04": "1253",
  "05": "640",
  "06": "100",
  "07": "38",
  "08": "W2025",
  "09": "6"
};

export function QrCodeGenerator() {
  const [generatorMode, setGeneratorMode] = useState<'box' | 'simple'>('box')

  return (
    <Tabs
      value={generatorMode}
      onValueChange={(v) => setGeneratorMode(v as 'box' | 'simple')}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="mb-5 shrink-0 px-2">
        <SegmentedTabs
          value={generatorMode}
          layoutId="qr-gen-mode"
          className="mx-auto max-w-lg grid-cols-2"
          items={[
            { value: 'box', label: 'Box Fields', icon: <Boxes className="h-3.5 w-3.5" /> },
            { value: 'simple', label: 'Text / URL', icon: <QrCode className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      <TabsContent value="box" className="mt-0 min-h-0 flex-1">
        <BoxQrCodeGenerator />
      </TabsContent>

      <TabsContent value="simple" className="mt-0 min-h-0 flex-1">
        <SimpleQrCodeGenerator />
      </TabsContent>
    </Tabs>
  )
}

function BoxQrCodeGenerator() {
  const [formData, setFormData] = useState<Record<string, string>>(DEFAULT_VALUES)
  const [jsonInput, setJsonInput] = useState(JSON.stringify(DEFAULT_VALUES, null, 2))
  const qrSize = 256
  const qrRef = useRef<HTMLDivElement>(null)

  // Update JSON input when form data changes
  const updateFormData = (key: string, value: string) => {
    const newData = { ...formData, [key]: value }
    setFormData(newData)
    setJsonInput(JSON.stringify(newData, null, 2))
  }

  // Update form data when JSON input changes
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setJsonInput(value)
    try {
      const parsed = JSON.parse(value)
      setFormData(parsed)
    } catch (error) {
      // Invalid JSON, don't update form data yet
    }
  }

  const resetToDefault = () => {
    setFormData(DEFAULT_VALUES)
    setJsonInput(JSON.stringify(DEFAULT_VALUES, null, 2))
  }

  const clearAll = () => {
    const empty: Record<string, string> = {}
    Object.keys(FIELD_MAPPINGS).forEach(key => empty[key] = "")
    setFormData(empty)
    setJsonInput(JSON.stringify(empty, null, 2))
  }

  const downloadQrCode = () => {
    if (!qrRef.current) return
    
    const svg = qrRef.current.querySelector('svg')
    if (!svg) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    const svgData = new XMLSerializer().serializeToString(svg)
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    
    img.onload = () => {
      canvas.width = img.width + 40 // Add padding
      canvas.height = img.height + 40
      
      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 20, 20)
        
        const pngFile = canvas.toDataURL('image/png')
        const downloadLink = document.createElement('a')
        downloadLink.download = `qrcode-${Date.now()}.png`
        downloadLink.href = pngFile
        downloadLink.click()
        toast.success('QR Code downloaded successfully')
      }
    }
  }

  const copyToClipboard = () => {
    if (!qrRef.current) return
    
    const svg = qrRef.current.querySelector('svg')
    if (!svg) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    
    const svgData = new XMLSerializer().serializeToString(svg)
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    
    img.onload = () => {
      canvas.width = img.width + 40
      canvas.height = img.height + 40
      
      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 20, 20)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const item = new ClipboardItem({ 'image/png': blob })
            navigator.clipboard.write([item])
            toast.success('QR Code copied to clipboard')
          }
        })
      }
    }
  }

  return (
    <Reveal stagger className="grid h-full min-h-0 gap-5 overflow-hidden lg:grid-cols-2">
      <div className="min-h-0 overflow-y-auto pr-1">
        <Card className="border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
          <CardHeader className="pb-4">
            <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Boxes className="h-4 w-4 text-primary" />
                    Structured payload
                  </div>
                  <CardTitle className="text-2xl tracking-tight">Box QR editor</CardTitle>
                  <CardDescription className="max-w-md text-sm leading-6">
                    Fill numbered logistics fields or paste raw JSON — both stay in sync.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1 font-mono">
                  {Object.keys(formData).length} fields
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            <Tabs defaultValue="editor" className="w-full">
              <TabsList className="mb-4 grid h-auto w-full grid-cols-2 rounded-xl bg-muted/40 p-1 ring-1 ring-border/30">
                <TabsTrigger value="editor" className="rounded-lg text-xs">
                  Field editor
                </TabsTrigger>
                <TabsTrigger value="json" className="rounded-lg text-xs">
                  Raw JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="space-y-4">
                <div className="mb-2 flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="rounded-full" onClick={resetToDefault}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Reset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-destructive hover:text-destructive"
                    onClick={clearAll}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Clear
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(FIELD_MAPPINGS)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, label]) => (
                      <div
                        key={key}
                        className="space-y-1.5 rounded-xl border border-border/40 bg-background/60 p-2.5"
                      >
                        <Label htmlFor={`field-${key}`} className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono text-muted-foreground">{key}</span>
                          <span className="truncate font-medium">{label}</span>
                        </Label>
                        <Input
                          id={`field-${key}`}
                          value={formData[key] || ''}
                          onChange={(e) => updateFormData(key, e.target.value)}
                          className="h-8 rounded-lg border-border/50 bg-background/90 text-sm"
                        />
                      </div>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="json">
                <div className="space-y-2 rounded-2xl border border-border/50 bg-muted/15 p-4">
                  <Label>JSON data</Label>
                  <Textarea
                    value={jsonInput}
                    onChange={handleJsonChange}
                    className="min-h-[300px] rounded-xl border-border/50 bg-background/80 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Directly edit the JSON object here.</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-col overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/10 shadow-sm">
        <CardHeader className="shrink-0 border-b border-border/30 pb-4">
          <CardTitle className="text-lg">Preview</CardTitle>
          <CardDescription>Encoded box payload as QR</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="edge-mesh-bg relative flex min-h-[300px] flex-1 flex-col items-center justify-center overflow-hidden p-8">
            <div ref={qrRef} className="relative rounded-2xl bg-white p-8 shadow-elev-lg ring-1 ring-black/5">
              <QRCodeSVG
                value={JSON.stringify(formData)}
                size={qrSize}
                level="M"
                includeMargin
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-3 border-t border-border/30 bg-muted/10 p-5">
            <Button className="min-w-[140px] rounded-full px-6 shadow-sm" onClick={downloadQrCode}>
              <Download className="mr-2 h-4 w-4" />
              Download PNG
            </Button>
            <Button variant="outline" className="min-w-[140px] rounded-full bg-background/80 px-6" onClick={copyToClipboard}>
              <Copy className="mr-2 h-4 w-4" />
              Copy image
            </Button>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  )
}
