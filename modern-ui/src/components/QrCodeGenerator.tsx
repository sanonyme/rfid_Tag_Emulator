import { useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Textarea } from './ui/textarea'
import { Download, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

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
    <div className="grid gap-6 md:grid-cols-2 h-full overflow-hidden">
      <div className="space-y-6 overflow-y-auto pr-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle>QR Content Editor</CardTitle>
            <CardDescription>Edit the fields to generate the QR code</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="editor" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="editor">Field Editor</TabsTrigger>
                <TabsTrigger value="json">Raw JSON</TabsTrigger>
              </TabsList>
              
              <TabsContent value="editor" className="space-y-4">
                <div className="flex justify-end gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={resetToDefault}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Reset
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAll} className="text-destructive hover:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Clear
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(FIELD_MAPPINGS)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`field-${key}`} className="text-xs flex items-center gap-1.5">
                        <span className="font-mono text-muted-foreground">{key}</span>
                        <span className="font-medium truncate">{label}</span>
                      </Label>
                      <Input
                        id={`field-${key}`}
                        value={formData[key] || ''}
                        onChange={(e) => updateFormData(key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="json">
                <div className="space-y-2">
                  <Label>JSON Data</Label>
                  <Textarea 
                    value={jsonInput} 
                    onChange={handleJsonChange}
                    className="font-mono text-sm min-h-[300px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Directly edit the JSON object here.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="h-full flex flex-col border-border/50">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Live preview of your QR code</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-0">
            <div className="flex min-h-[300px] flex-1 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-muted-foreground/25 bg-white/5 p-8">
              <div ref={qrRef} className="rounded-lg bg-white p-8 shadow-lg">
                <QRCodeSVG
                  value={JSON.stringify(formData)}
                  size={qrSize}
                  level={"M"}
                  includeMargin={true}
                />
              </div>
            </div>
          </CardContent>
          <div className="p-6 pt-0 flex justify-center gap-4">
            <Button className="w-full sm:w-auto" onClick={downloadQrCode}>
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
  )
}
