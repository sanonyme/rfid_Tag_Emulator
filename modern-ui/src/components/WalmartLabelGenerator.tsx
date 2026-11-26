import { useState, useRef, useMemo } from 'react'
import Barcode from 'react-barcode'
import { toPng } from 'html-to-image'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { Download, Copy, Printer, RefreshCw, Tag, RotateCcw, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface WalmartLabelData {
  poNumber: string
  itfNumber: string
  toCountry: string
  toCode: string
  deptNumber: string
  deptCategory: string
  itemNumber: string
  supplierStk: string
  blackBorder: boolean
}

const DEFAULT_LABEL: WalmartLabelData = {
  poNumber: '0869795258',
  itfNumber: '00884968531383',
  toCountry: 'US',
  toCode: '001734',
  deptNumber: '00023',
  deptCategory: 'APPAREL',
  itemNumber: '0673388553',
  supplierStk: 'AW35100139371B',
  blackBorder: true,
}

function randomDigits(len: number): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('')
}

/** Standard GS1 Mod-10 check digit for 13-digit GTIN/ITF-14 payload. */
function computeMod10CheckDigit(digits13: string): string {
  let sum = 0
  for (let i = 0; i < digits13.length; i++) {
    const d = Number(digits13[i])
    sum += i % 2 === 0 ? d * 3 : d
  }
  return String((10 - (sum % 10)) % 10)
}

export function WalmartLabelGenerator() {
  const [data, setData] = useState<WalmartLabelData>(DEFAULT_LABEL)
  const [exporting, setExporting] = useState(false)
  const labelRef = useRef<HTMLDivElement>(null)

  const update = <K extends keyof WalmartLabelData>(key: K, value: WalmartLabelData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  const poClean = data.poNumber.trim()
  const itfDigits = useMemo(() => data.itfNumber.replace(/\D/g, ''), [data.itfNumber])

  const poValid = poClean.length > 0
  // ITF requires an even number of digits (at least 2); Walmart carton GTIN is typically 14 digits
  const itfValid = itfDigits.length >= 2 && itfDigits.length % 2 === 0
  const canExport = poValid && itfValid

  const handleRandomize = () => {
    const base13 = '00' + randomDigits(11)
    const gtin14 = base13 + computeMod10CheckDigit(base13)
    setData((prev) => ({
      ...prev,
      poNumber: '0' + randomDigits(9),
      itfNumber: gtin14,
      toCode: '00' + randomDigits(4),
      deptNumber: '000' + randomDigits(2),
      itemNumber: '0' + randomDigits(9),
      supplierStk: `AW${randomDigits(11)}B`,
    }))
  }

  const handleReset = () => {
    setData(DEFAULT_LABEL)
  }

  const renderPngDataUrl = async (): Promise<string> => {
    if (!labelRef.current) throw new Error('Label preview not ready')
    return toPng(labelRef.current, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: data.blackBorder ? '#111111' : '#ffffff',
    })
  }

  const handleDownloadPng = async () => {
    if (!canExport) {
      toast.error('Fix barcode fields before downloading')
      return
    }
    setExporting(true)
    try {
      const dataUrl = await renderPngDataUrl()
      const a = document.createElement('a')
      a.download = `walmart-label-PO-${poClean}.png`
      a.href = dataUrl
      a.click()
      toast.success('Walmart label PNG downloaded')
    } catch (err) {
      toast.error('Failed to export PNG', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const handleCopyImage = async () => {
    if (!canExport) {
      toast.error('Fix barcode fields before copying')
      return
    }
    setExporting(true)
    try {
      const dataUrl = await renderPngDataUrl()
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('Walmart label copied to clipboard')
    } catch (err) {
      toast.error('Failed to copy image', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = async () => {
    if (!canExport) {
      toast.error('Fix barcode fields before printing')
      return
    }
    setExporting(true)
    try {
      const dataUrl = await renderPngDataUrl()
      const win = window.open('', '_blank', 'width=720,height=800')
      if (!win) {
        toast.error('Pop-up blocked — allow pop-ups or download PNG to print')
        return
      }
      win.document.write(`<!doctype html>
<html>
  <head>
    <title>Walmart Label — PO ${poClean}</title>
    <style>
      html, body { margin: 0; padding: 0; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      img { max-width: 92vw; max-height: 92vh; height: auto; }
      @media print {
        body { min-height: auto; }
        img { max-width: 100%; max-height: 100%; }
      }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" onload="setTimeout(() => { window.print(); }, 150)" />
  </body>
</html>`)
      win.document.close()
    } catch (err) {
      toast.error('Failed to open print preview', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,430px)_1fr] h-full overflow-hidden">
      {/* Left: Configuration Form */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        <Card className="flex flex-1 flex-col overflow-hidden border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
          <CardHeader className="shrink-0 pb-3 pt-4 px-5">
            <div className="rounded-xl border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    Carton Shipping Label
                  </div>
                  <CardTitle className="text-lg">Walmart Label</CardTitle>
                  <CardDescription className="text-xs leading-snug">
                    Generate Walmart-style labels.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-full bg-background/70 font-mono text-[10px]">
                  Code128 + ITF
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto space-y-3.5 px-5 pb-5 pt-0">
            {/* Barcodes section */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Barcodes
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRandomize}
                    className="h-7 gap-1.5 px-2 text-xs"
                    title="Generate random valid values"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Random
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 gap-1.5 px-2 text-xs"
                    title="Reset to sample label"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Sample
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wm-po" className="text-xs font-medium">
                    PO# (Top Barcode — CODE128 &amp; PO Row)
                  </Label>
                  <span className="font-mono text-[10px] text-muted-foreground">CODE128</span>
                </div>
                <Input
                  id="wm-po"
                  value={data.poNumber}
                  onChange={(e) => update('poNumber', e.target.value)}
                  placeholder="0869795258"
                  className="h-9 font-mono text-sm"
                />
                {!poValid && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> PO# is required for the Code128 barcode.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wm-itf" className="text-xs font-medium">
                    GTIN / Carton Code (Second Barcode — ITF)
                  </Label>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    ITF ({itfDigits.length} digits)
                  </span>
                </div>
                <Input
                  id="wm-itf"
                  value={data.itfNumber}
                  onChange={(e) => update('itfNumber', e.target.value.replace(/\D/g, ''))}
                  placeholder="00884968531383"
                  className="h-9 font-mono text-sm"
                />
                {!itfValid && (
                  <p className="flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> ITF requires an even number of digits (e.g. 14 digits).
                  </p>
                )}
              </div>
            </div>

            {/* Destination & Dept */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Label Fields
              </span>

              <div className="grid grid-cols-[5.5rem_1fr] gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="wm-to-country" className="text-xs font-medium">
                    TO:
                  </Label>
                  <Input
                    id="wm-to-country"
                    value={data.toCountry}
                    onChange={(e) => update('toCountry', e.target.value.toUpperCase())}
                    placeholder="US"
                    className="h-9 font-mono text-sm uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wm-to-code" className="text-xs font-medium">
                    Facility / DC Code
                  </Label>
                  <Input
                    id="wm-to-code"
                    value={data.toCode}
                    onChange={(e) => update('toCode', e.target.value)}
                    placeholder="001734"
                    className="h-9 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[7.5rem_1fr] gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="wm-dept" className="text-xs font-medium">
                    DEPT #
                  </Label>
                  <Input
                    id="wm-dept"
                    value={data.deptNumber}
                    onChange={(e) => update('deptNumber', e.target.value)}
                    placeholder="00023"
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wm-cat" className="text-xs font-medium">
                    Category Badge
                  </Label>
                  <Input
                    id="wm-cat"
                    value={data.deptCategory}
                    onChange={(e) => update('deptCategory', e.target.value.toUpperCase())}
                    placeholder="APPAREL"
                    className="h-9 font-mono text-sm uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="wm-item" className="text-xs font-medium">
                    ITEM #
                  </Label>
                  <Input
                    id="wm-item"
                    value={data.itemNumber}
                    onChange={(e) => update('itemNumber', e.target.value)}
                    placeholder="0673388553"
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wm-stk" className="text-xs font-medium">
                    SUPPLIER STK
                  </Label>
                  <Input
                    id="wm-stk"
                    value={data.supplierStk}
                    onChange={(e) => update('supplierStk', e.target.value.toUpperCase())}
                    placeholder="AW35100139371B"
                    className="h-9 font-mono text-sm uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Frame toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5">
              <div>
                <Label htmlFor="wm-border" className="text-xs font-medium cursor-pointer">
                  Heavy black outer frame
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Matches the thick black border around the printed label.
                </p>
              </div>
              <Switch
                id="wm-border"
                checked={data.blackBorder}
                onCheckedChange={(v) => update('blackBorder', v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Live Exact-Format Label Preview + Export */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        <Card className="flex flex-1 flex-col overflow-hidden border-border/50 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Live Label Preview</CardTitle>
                <CardDescription className="text-xs">
                  Scannable Code128 (top) + ITF (bottom) in exact Walmart carton format.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopyImage()}
                  disabled={!canExport || exporting}
                  className="h-8 gap-1.5 rounded-lg text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePrint()}
                  disabled={!canExport || exporting}
                  className="h-8 gap-1.5 rounded-lg text-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleDownloadPng()}
                  disabled={!canExport || exporting}
                  className="h-8 gap-1.5 rounded-lg text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  PNG
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-6">
            {/* Printable / Exportable Walmart Label Surface */}
            <div
              ref={labelRef}
              style={{
                backgroundColor: data.blackBorder ? '#111111' : '#ffffff',
                padding: data.blackBorder ? '44px 36px 56px 36px' : '16px',
                fontFamily: '"Arial Narrow", "Helvetica Neue", Arial, Helvetica, sans-serif',
                color: '#000000',
                width: data.blackBorder ? '540px' : '468px',
                boxSizing: 'border-box',
              }}
              className="shadow-xl select-none shrink-0"
            >
              {/* Inner White Label Sheet */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: data.blackBorder ? 'none' : '1px solid #d4d4d4',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {/* Section 1: Top PO# Code128 Barcode */}
                <div
                  style={{
                    padding: '6px 14px 4px 14px',
                    borderBottom: '2px solid #000000',
                    position: 'relative',
                  }}
                >
                  <div className="flex justify-center">
                    {poValid ? (
                      <Barcode
                        value={poClean}
                        format="CODE128"
                        width={2.05}
                        height={46}
                        displayValue={false}
                        background="#ffffff"
                        lineColor="#000000"
                        margin={0}
                      />
                    ) : (
                      <div className="flex h-[46px] items-center text-xs text-red-600">
                        Enter PO# for Code128
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr 48px',
                      alignItems: 'baseline',
                      marginTop: '3px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                        color: '#000000',
                      }}
                    >
                      PO#
                    </span>
                    <span
                      style={{
                        textAlign: 'center',
                        fontSize: '23px',
                        fontWeight: 500,
                        lineHeight: 1.05,
                        letterSpacing: '0.03em',
                        color: '#000000',
                      }}
                    >
                      {poClean || '—'}
                    </span>
                    <span />
                  </div>
                </div>

                {/* Section 2: Second ITF Barcode */}
                <div
                  style={{
                    padding: '8px 14px 4px 14px',
                    borderBottom: '2px solid #000000',
                  }}
                >
                  <div className="flex justify-center">
                    {itfValid ? (
                      <Barcode
                        value={itfDigits}
                        format="ITF"
                        width={2.35}
                        height={74}
                        displayValue={false}
                        background="#ffffff"
                        lineColor="#000000"
                        margin={0}
                      />
                    ) : (
                      <div className="flex h-[74px] items-center text-xs text-red-600">
                        ITF requires an even number of digits
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '26px',
                      fontWeight: 500,
                      lineHeight: 1.1,
                      letterSpacing: '0.02em',
                      marginTop: '3px',
                      color: '#000000',
                    }}
                  >
                    {itfDigits || '—'}
                  </div>
                </div>

                {/* Section 3: TO: US   001734 */}
                <div
                  style={{
                    padding: '5px 14px 4px 14px',
                    borderBottom: '2px solid #000000',
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px' }}>
                    <span
                      style={{
                        fontSize: '21px',
                        fontWeight: 800,
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      TO:
                    </span>
                    <span
                      style={{
                        fontSize: '34px',
                        fontWeight: 800,
                        lineHeight: 0.95,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {data.toCountry}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '28px',
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: '0.01em',
                      marginRight: '46px',
                    }}
                  >
                    {data.toCode}
                  </span>
                </div>

                {/* Section 4: DEPT / PO / ITEM / SUPPLIER STK */}
                <div
                  style={{
                    padding: '6px 12px 8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  {/* Row 1: [DEPT] 00023 [APPAREL] */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          backgroundColor: '#000000',
                          color: '#ffffff',
                          fontSize: '42px',
                          fontWeight: 900,
                          lineHeight: 0.92,
                          padding: '3px 6px 2px 6px',
                          letterSpacing: '-0.03em',
                          display: 'inline-block',
                          transform: 'scaleX(0.92)',
                          transformOrigin: 'left center',
                        }}
                      >
                        DEPT
                      </span>
                      <span
                        style={{
                          fontSize: '50px',
                          fontWeight: 900,
                          lineHeight: 0.9,
                          letterSpacing: '-0.02em',
                          color: '#000000',
                          marginLeft: '-4px',
                        }}
                      >
                        {data.deptNumber}
                      </span>
                    </div>

                    {data.deptCategory.trim() && (
                      <span
                        style={{
                          backgroundColor: '#000000',
                          color: '#ffffff',
                          fontSize: '24px',
                          fontWeight: 800,
                          lineHeight: 1,
                          padding: '5px 8px',
                          letterSpacing: '0.01em',
                          display: 'inline-block',
                          alignSelf: 'flex-start',
                          marginTop: '4px',
                        }}
                      >
                        {data.deptCategory}
                      </span>
                    )}
                  </div>

                  {/* Row 2: PO 0869795258 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '14px',
                      marginTop: '1px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '54px',
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.04em',
                        transform: 'scaleX(0.86)',
                        transformOrigin: 'left center',
                        display: 'inline-block',
                        minWidth: '64px',
                      }}
                    >
                      PO
                    </span>
                    <span
                      style={{
                        fontSize: '54px',
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.03em',
                        transform: 'scaleX(0.88)',
                        transformOrigin: 'left center',
                        display: 'inline-block',
                      }}
                    >
                      {poClean}
                    </span>
                  </div>

                  {/* Row 3: ITEM 0673388553 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '12px',
                      marginTop: '1px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '54px',
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.04em',
                        transform: 'scaleX(0.84)',
                        transformOrigin: 'left center',
                        display: 'inline-block',
                      }}
                    >
                      ITEM
                    </span>
                    <span
                      style={{
                        fontSize: '54px',
                        fontWeight: 900,
                        lineHeight: 0.92,
                        letterSpacing: '-0.03em',
                        transform: 'scaleX(0.86)',
                        transformOrigin: 'left center',
                        display: 'inline-block',
                        marginLeft: '-12px',
                      }}
                    >
                      {data.itemNumber}
                    </span>
                  </div>

                  {/* Row 4: SUPPLIER STK   AW35100139371B */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '26px',
                      marginTop: '6px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        letterSpacing: '0.01em',
                      }}
                    >
                      SUPPLIER STK
                    </span>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {data.supplierStk}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
