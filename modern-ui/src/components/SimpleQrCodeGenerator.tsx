import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import {
  Download,
  Copy,
  Link2,
  QrCode,
  Sparkles,
  Wifi,
  User,
  AlignLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import { Badge } from './ui/badge'
import { Reveal } from './Reveal'
import { cn } from '@/lib/utils'
import {
  indicatorSpring,
  prefersReducedMotion,
  SLIDE_TAB_ATTR,
  SlidingHighlight,
  useSlidingIndicator,
} from '@/lib/motion'

type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

const ERROR_LEVELS: { value: ErrorLevel; label: string; hint: string }[] = [
  { value: 'L', label: 'Low', hint: '7%' },
  { value: 'M', label: 'Med', hint: '15%' },
  { value: 'Q', label: 'Q', hint: '25%' },
  { value: 'H', label: 'High', hint: '30%' },
]

const QUICK_PRESETS = [
  { id: 'url', label: 'URL', icon: Link2, value: 'https://' },
  { id: 'text', label: 'Text', icon: AlignLeft, value: 'Hello world' },
  {
    id: 'wifi',
    label: 'Wi‑Fi',
    icon: Wifi,
    value: 'WIFI:T:WPA;S:NetworkName;P:password;;',
  },
  {
    id: 'vcard',
    label: 'vCard',
    icon: User,
    value: 'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nTEL:+1234567890\nEND:VCARD',
  },
] as const

function exportQrPng(svg: SVGSVGElement, padding = 24): Promise<Blob | null> {
  return new Promise((resolve) => {
    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width + padding * 2
      canvas.height = img.height + padding * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, padding, padding)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    }
    img.onerror = () => resolve(null)
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  })
}

export function SimpleQrCodeGenerator() {
  const [content, setContent] = useState('https://example.com')
  const [size, setSize] = useState(280)
  const [level, setLevel] = useState<ErrorLevel>('M')
  const [includeMargin, setIncludeMargin] = useState(true)
  const qrRef = useRef<HTMLDivElement>(null)
  const reduced = prefersReducedMotion()
  const errorLevelNav = useSlidingIndicator(level)

  const trimmed = content.trim()
  const hasContent = trimmed.length > 0
  const isUrl = /^https?:\/\//i.test(trimmed)

  const getSvg = () => qrRef.current?.querySelector('svg') ?? null

  const downloadQrCode = async () => {
    const svg = getSvg()
    if (!svg) return
    const blob = await exportQrPng(svg)
    if (!blob) {
      toast.error('Failed to generate image')
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `qrcode-${Date.now()}.png`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
    toast.success('QR code downloaded')
  }

  const copyToClipboard = async () => {
    const svg = getSvg()
    if (!svg) return
    const blob = await exportQrPng(svg)
    if (!blob) {
      toast.error('Failed to generate image')
      return
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('QR code copied to clipboard')
    } catch {
      toast.error('Could not copy image')
    }
  }

  const copyText = async () => {
    if (!trimmed) return
    try {
      await navigator.clipboard.writeText(trimmed)
      toast.success('Content copied')
    } catch {
      toast.error('Could not copy text')
    }
  }

  return (
    <Reveal stagger className="grid h-full min-h-0 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* Editor */}
      <Card className="flex min-h-0 flex-col overflow-hidden border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
        <CardHeader className="shrink-0 pb-4">
          <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-info/12 via-info/5 to-transparent p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="h-4 w-4 text-info" />
                  Instant encoder
                </div>
                <CardTitle className="text-2xl tracking-tight">Text & URL</CardTitle>
                <CardDescription className="max-w-md text-sm leading-6">
                  Type anything — links, plain text, Wi‑Fi credentials, or contact cards. The preview
                  updates live.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="info" className="rounded-full px-3 py-1">
                  <Sparkles className="h-3 w-3" />
                  Live
                </Badge>
                <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1 font-mono">
                  {trimmed.length} chars
                </Badge>
                {isUrl && (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    URL
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6">
          <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/15 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="qr-content" className="text-sm font-medium">
                  Payload
                </Label>
                <p className="text-xs text-muted-foreground">Raw string encoded into the QR matrix.</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => void copyText()}
                disabled={!hasContent}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <Textarea
              id="qr-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="https://example.com or any text…"
              className="min-h-[128px] resize-none rounded-xl border-border/50 bg-background/80 font-mono text-sm leading-relaxed shadow-inner"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick presets
            </Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((preset) => {
                const Icon = preset.icon
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setContent(preset.value)}
                    className={cn(
                      'smooth-press inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-sm transition-colors hover:border-info/40 hover:bg-info/5 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 text-info/80" />
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/15 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Output settings</Label>
                <p className="text-xs text-muted-foreground">Tune density, recovery, and quiet zone.</p>
              </div>
              <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1 font-mono text-[11px]">
                {size}px
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border/40 bg-background/70 p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Render size</Label>
                  <span className="font-mono text-sm font-medium text-info">{size}px</span>
                </div>
                <Slider
                  value={[size]}
                  onValueChange={([v]) => setSize(v)}
                  min={160}
                  max={512}
                  step={8}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-border/40 bg-background/70 p-4">
                <Label className="text-sm font-medium">Error correction</Label>
                <div
                  ref={errorLevelNav.containerRef}
                  className="relative grid grid-cols-4 gap-1 rounded-lg bg-muted/40 p-1 ring-1 ring-border/25"
                >
                  <SlidingHighlight
                    rect={errorLevelNav.rect}
                    ready={errorLevelNav.ready}
                    className="rounded-md"
                    transition={reduced ? { duration: 0 } : indicatorSpring}
                  />
                  {ERROR_LEVELS.map((opt) => {
                    const active = level === opt.value
                    return (
                      <button
                        key={opt.value}
                        {...{ [SLIDE_TAB_ATTR]: opt.value }}
                        type="button"
                        onClick={() => setLevel(opt.value)}
                        className={cn(
                          'relative z-[1] rounded-md px-1 py-2 text-center transition-colors',
                          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <span className="block text-[11px] font-semibold">{opt.label}</span>
                        <span className="block text-[9px] text-muted-foreground">{opt.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/70 p-4">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor="qr-margin" className="text-sm font-medium">
                    Quiet zone
                  </Label>
                  <p className="text-xs text-muted-foreground">Standard margin around the code.</p>
                </div>
                <Switch
                  id="qr-margin"
                  checked={includeMargin}
                  onCheckedChange={setIncludeMargin}
                  className="shrink-0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="flex min-h-0 flex-col overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/10 shadow-sm">
        <CardHeader className="shrink-0 border-b border-border/30 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Preview</CardTitle>
              <CardDescription>Export-ready PNG with white backing</CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full font-mono text-[10px]">
              ECC {level}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="edge-mesh-bg relative flex min-h-[320px] flex-1 flex-col items-center justify-center overflow-hidden p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, hsl(var(--border) / 0.35) 1px, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            />

            <AnimatePresence mode="wait">
              {hasContent ? (
                <motion.div
                  key={`${trimmed.slice(0, 32)}-${size}-${level}`}
                  initial={reduced ? false : { opacity: 0, scale: 0.94, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                  ref={qrRef}
                  className="relative rounded-2xl bg-white p-6 shadow-elev-lg ring-1 ring-black/5"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-3 rounded-3xl bg-info/10 blur-2xl"
                  />
                  <QRCodeSVG
                    value={trimmed}
                    size={Math.min(size, 360)}
                    level={level}
                    includeMargin={includeMargin}
                    className="relative z-10"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-3 text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/40">
                    <QrCode className="h-8 w-8 text-muted-foreground/60" />
                  </div>
                  <p className="max-w-[220px] text-sm text-muted-foreground">
                    Start typing on the left — your code appears here instantly.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 flex-wrap justify-center gap-3 border-t border-border/30 bg-muted/10 p-5">
            <Button
              className="min-w-[140px] rounded-full px-6 shadow-sm"
              onClick={() => void downloadQrCode()}
              disabled={!hasContent}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PNG
            </Button>
            <Button
              variant="outline"
              className="min-w-[140px] rounded-full bg-background/80 px-6"
              onClick={() => void copyToClipboard()}
              disabled={!hasContent}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy image
            </Button>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  )
}
