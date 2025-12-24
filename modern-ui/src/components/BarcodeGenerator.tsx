import { useState, useRef } from 'react'
import Barcode from 'react-barcode'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Download, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function BarcodeGenerator() {
  const [text, setText] = useState('ZEUS-12345')
  const [format, setFormat] = useState('CODE128')
  const [width, setWidth] = useState(2)
  const [height, setHeight] = useState(100)
  const [displayValue, setDisplayValue] = useState(true)
  const barcodeRef = useRef<HTMLDivElement>(null)

  const downloadBarcode = () => {
    const svg = barcodeRef.current?.querySelector('svg')
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        if (ctx) {
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          
          const pngFile = canvas.toDataURL('image/png')
          const downloadLink = document.createElement('a')
          downloadLink.download = `barcode-${text}.png`
          downloadLink.href = pngFile
          downloadLink.click()
          toast.success('Barcode downloaded successfully')
        }
      }
      
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    }
  }

  const copyToClipboard = () => {
    const svg = barcodeRef.current?.querySelector('svg')
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        if (ctx) {
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          
          canvas.toBlob((blob) => {
            if (blob) {
              const item = new ClipboardItem({ 'image/png': blob })
              navigator.clipboard.write([item])
              toast.success('Barcode copied to clipboard')
            }
          })
        }
      }
      
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    }
  }

  const generateRandom = () => {
    const random = Math.random().toString(36).substring(2, 10).toUpperCase()
    setText(random)
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 h-full">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Customize your barcode settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Content</Label>
              <div className="flex gap-2">
                <Input 
                  value={text} 
                  onChange={(e) => setText(e.target.value)} 
                  placeholder="Enter text to encode..."
                />
                <Button variant="outline" size="icon" onClick={generateRandom} title="Generate Random">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CODE128">Code 128</SelectItem>
                    <SelectItem value="CODE39">Code 39</SelectItem>
                    <SelectItem value="EAN13">EAN-13</SelectItem>
                    <SelectItem value="UPC">UPC</SelectItem>
                    <SelectItem value="ITF14">ITF-14</SelectItem>
                    <SelectItem value="MSI">MSI</SelectItem>
                  </SelectContent>
                </Select>
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

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Width (Scale)</Label>
                  <span className="text-xs text-muted-foreground">{width}px</span>
                </div>
                <Slider 
                  value={[width]} 
                  min={1} 
                  max={3} 
                  step={0.5} 
                  onValueChange={([v]: number[]) => setWidth(v)} 
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Height</Label>
                  <span className="text-xs text-muted-foreground">{height}px</span>
                </div>
                <Slider 
                  value={[height]} 
                  min={30} 
                  max={200} 
                  step={5} 
                  onValueChange={([v]: number[]) => setHeight(v)} 
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Live preview of your generated barcode</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-white/5 rounded-lg m-6 border-2 border-dashed border-muted-foreground/20">
            {text ? (
              <div ref={barcodeRef} className="p-8 bg-white rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
                {/* @ts-ignore - react-barcode types are tricky with recent React versions */}
                <Barcode 
                  value={text}
                  format={format}
                  width={width}
                  height={height}
                  displayValue={displayValue}
                  background="#ffffff"
                  lineColor="#000000"
                  margin={10}
                />
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Enter text to generate barcode</div>
            )}
          </CardContent>
          <div className="p-6 pt-0 flex justify-center gap-4">
            <Button className="w-full sm:w-auto" onClick={downloadBarcode} disabled={!text}>
              <Download className="mr-2 h-4 w-4" />
              Download PNG
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={copyToClipboard} disabled={!text}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Image
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

