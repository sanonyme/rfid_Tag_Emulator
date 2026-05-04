import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Slider } from './ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { toast } from 'sonner'
import { renderZplToBlob, type LabelaryDpmm } from '@/lib/labelary'
import {
  Copy,
  Download,
  Loader2,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  FileCode2,
} from 'lucide-react'

const DEFAULT_ZPL = `^XA
^FO40,40^A0N,40,40^FDZPL preview^FS
^FO40,100^BY3
^BCN,120,Y,N,N
^FD1234567890^FS
^XZ`

const LABEL_PRESETS: { w: number; h: number; label: string }[] = [
  { w: 4, h: 6, label: '4×6' },
  { w: 4, h: 3, label: '4×3' },
  { w: 3, h: 2, label: '3×2' },
  { w: 2, h: 1, label: '2×1' },
  { w: 1, h: 1, label: '1×1' },
]

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function ZplViewerTab() {
  const [zpl, setZpl] = useState(DEFAULT_ZPL)
  const [dpmm, setDpmm] = useState<LabelaryDpmm>(8)
  const [widthIn, setWidthIn] = useState('4')
  const [heightIn, setHeightIn] = useState('6')
  const [scale, setScale] = useState(1)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const refresh = useCallback(async () => {
    const w = parseFloat(widthIn)
    const h = parseFloat(heightIn)
    if (!zpl.trim()) {
      setError(null)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setPreviewBlob(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const blob = await renderZplToBlob(zpl, { dpmm, widthIn: w, heightIn: h })
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
      setPreviewBlob(blob)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setPreviewBlob(null)
    } finally {
      setLoading(false)
    }
  }, [zpl, dpmm, widthIn, heightIn])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh()
    }, 450)
    return () => clearTimeout(t)
  }, [refresh])

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const lastFitKey = useRef('')

  const fitToWidth = useCallback(() => {
    const vp = viewportRef.current
    const img = imgRef.current
    if (!vp || !img?.naturalWidth) return
    const pad = 48
    const next = (vp.clientWidth - pad) / img.naturalWidth
    setScale(clamp(next, 0.15, 5))
  }, [])

  const onImgLoad = useCallback(() => {
    const key = `${widthIn}x${heightIn}-${dpmm}`
    if (lastFitKey.current !== key) {
      lastFitKey.current = key
      requestAnimationFrame(() => fitToWidth())
    }
  }, [dpmm, fitToWidth, heightIn, widthIn])

  const applyPreset = (w: number, h: number) => {
    setWidthIn(String(w))
    setHeightIn(String(h))
  }

  const copyZpl = () => {
    void navigator.clipboard.writeText(zpl)
    toast.success('ZPL copied')
  }

  const downloadPng = () => {
    if (!previewBlob) {
      toast.error('Nothing to download yet')
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(previewBlob)
    a.download = `zpl-label-${widthIn}x${heightIn}-${dpmm}dpmm.png`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('PNG saved')
  }

  const copyImage = async () => {
    if (!previewBlob) {
      toast.error('Nothing to copy')
      return
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ [previewBlob.type]: previewBlob })])
      toast.success('Image copied')
    } catch {
      toast.error('Copy image not supported in this context')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 h-full min-h-0 overflow-hidden">
      <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
        <Card className="border-border/50 shrink-0">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileCode2 className="h-5 w-5 text-primary" />
                  ZPL editor
                </CardTitle>
                <CardDescription>
                  Live preview via Labelary (network). Set label size and resolution to match your printer.
                </CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0">
                {dpmm} dpmm
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>ZPL</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={copyZpl}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy ZPL
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setZpl(DEFAULT_ZPL)}
                  >
                    Sample
                  </Button>
                </div>
              </div>
              <Textarea
                value={zpl}
                onChange={(e) => setZpl(e.target.value)}
                className="min-h-[220px] font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Dots per mm</Label>
                <Select
                  value={String(dpmm)}
                  onValueChange={(v) => setDpmm(parseInt(v, 10) as LabelaryDpmm)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 dpmm</SelectItem>
                    <SelectItem value="8">8 dpmm (common)</SelectItem>
                    <SelectItem value="12">12 dpmm</SelectItem>
                    <SelectItem value="24">24 dpmm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label size (inches)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="font-mono"
                    value={widthIn}
                    onChange={(e) => setWidthIn(e.target.value)}
                    aria-label="Width inches"
                  />
                  <span className="text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="font-mono"
                    value={heightIn}
                    onChange={(e) => setHeightIn(e.target.value)}
                    aria-label="Height inches"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Presets</Label>
              <div className="flex flex-wrap gap-2">
                {LABEL_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => applyPreset(p.w, p.h)}
                  >
                    {p.label} in
                  </Button>
                ))}
              </div>
            </div>

            <Button type="button" className="w-full gap-2" variant="secondary" onClick={() => void refresh()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh preview
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="flex flex-col border-border/50 min-h-0 overflow-hidden">
        <CardHeader className="pb-3 shrink-0 border-b border-border/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Viewer</CardTitle>
              <CardDescription>
                Scroll the preview with the mouse wheel. Use the slider or ± buttons to zoom.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9"
                title="Zoom out"
                onClick={() => setScale((s) => clamp(s / 1.12, 0.15, 5))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9"
                title="Zoom in"
                onClick={() => setScale((s) => clamp(s * 1.12, 0.15, 5))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={fitToWidth} title="Fit to panel width">
                <Maximize2 className="h-3.5 w-3.5 mr-1" />
                Fit width
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setScale(1)}>
                100%
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3">
            <span className="text-xs text-muted-foreground w-10 tabular-nums">{Math.round(scale * 100)}%</span>
            <Slider
              value={[scale]}
              min={0.15}
              max={5}
              step={0.02}
              onValueChange={([v]) => setScale(v)}
              className="flex-1"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <div
            ref={viewportRef}
            className="flex-1 min-h-[320px] overflow-auto bg-muted/30 rounded-b-lg relative touch-pan-x touch-pan-y"
          >
            <div className="min-w-full min-h-full p-6 flex items-start justify-center">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
              )}
              {error && !loading && (
                <div className="max-w-lg rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}
              {!error && previewUrl && (
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top center',
                  }}
                  className="inline-block shadow-xl rounded-sm border border-border/40 bg-white"
                >
                  <img
                    ref={imgRef}
                    src={previewUrl}
                    alt="ZPL label preview"
                    className="block max-w-none"
                    onLoad={onImgLoad}
                    draggable={false}
                  />
                </div>
              )}
              {!loading && !error && !previewUrl && zpl.trim() && (
                <p className="text-sm text-muted-foreground py-16">Rendering…</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center p-4 border-t border-border/50 bg-card/50">
            <Button type="button" variant="outline" size="sm" onClick={downloadPng} disabled={!previewBlob}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download PNG
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyImage()} disabled={!previewBlob}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy image
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
