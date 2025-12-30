import { useState, useRef } from 'react'
import Barcode from 'react-barcode'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Download, Copy, RefreshCw, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'

interface BarcodeConfig {
  id: string
  text: string
  format: string
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
    <div className="grid gap-6 md:grid-cols-2 h-full">
      <div className="space-y-6 overflow-y-auto pr-2 max-h-[calc(100vh-12rem)]">
        <Card>
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
                  <div key={barcode.id} className="p-4 border rounded-lg bg-card space-y-4 relative group">
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Live preview of your generated barcodes</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-white/5 rounded-lg m-6 border-2 border-dashed border-muted-foreground/20 overflow-y-auto">
            <div ref={barcodeRef} className="p-8 bg-white rounded-lg shadow-lg transition-all duration-200 flex flex-col gap-8 items-center">
              {barcodes.map((barcode) => (
                <div key={barcode.id} className="flex flex-col items-center">
                   {/* @ts-ignore */}
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
  )
}
