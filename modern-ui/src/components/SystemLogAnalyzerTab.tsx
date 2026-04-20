import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  parseSystemInfoCsv,
  CPU_SERIES,
  MEM_SERIES,
  SERIES_COLORS,
  MAX_CHART_POINTS,
  downsampleIndices,
  type ParseResult,
  type SystemLogRow,
} from '@/lib/system-log'
import { exportSystemLogXlsx } from '@/lib/system-log-export'
import {
  Activity,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  LineChart as LineChartIcon,
  MemoryStick,
  RefreshCw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Small, dependency-free SVG line chart
// ---------------------------------------------------------------------------

interface SeriesDef {
  key: string
  color: string
  values: number[]
}

interface LineChartProps {
  xLabels: string[]
  series: SeriesDef[]
  height?: number
  yFormat?: (n: number) => string
  emptyMessage?: string
  /** Drag-select to zoom: receives normalized [0..1] start/end fractions within the visible window. */
  onZoomSelection?: (startFrac: number, endFrac: number) => void
  /** Wheel zoom: factor < 1 zooms in, > 1 zooms out. centerFrac is where the cursor was. */
  onZoomDelta?: (factor: number, centerFrac: number) => void
  /** Shift+wheel / horizontal wheel: positive = pan right. Units are "fraction of visible window". */
  onPanDelta?: (deltaFrac: number) => void
  /** Double-click to reset zoom. */
  onResetZoom?: () => void
}

function defaultFormatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (abs >= 10_000) return (n / 1_000).toFixed(1) + 'K'
  if (abs >= 1) return n.toFixed(abs >= 100 ? 0 : 2)
  return n.toFixed(3)
}

function LineChart({
  xLabels,
  series,
  height = 320,
  yFormat = defaultFormatNumber,
  emptyMessage = 'No data to display',
  onZoomSelection,
  onZoomDelta,
  onPanDelta,
  onResetZoom,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(320, Math.floor(e.contentRect.width))
        setWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pointCount = xLabels.length
  const visible = series.filter((s) => s.values.length === pointCount && s.values.some((v) => Number.isFinite(v)))

  const padding = { top: 16, right: 16, bottom: 44, left: 64 }
  const innerW = Math.max(1, width - padding.left - padding.right)
  const innerH = Math.max(1, height - padding.top - padding.bottom)

  const { yMin, yMax } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of visible) {
      for (const v of s.values) {
        if (!Number.isFinite(v)) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { yMin: 0, yMax: 1 }
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.1 || 1
      return { yMin: lo - pad, yMax: hi + pad }
    }
    const pad = (hi - lo) * 0.08
    return { yMin: lo - pad, yMax: hi + pad }
  }, [visible])

  if (pointCount === 0 || visible.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center rounded-lg border border-border/40 bg-background/30 text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    )
  }

  const xFor = (i: number) => {
    if (pointCount === 1) return padding.left + innerW / 2
    return padding.left + (i * innerW) / (pointCount - 1)
  }
  const yFor = (v: number) => {
    const t = (v - yMin) / (yMax - yMin || 1)
    return padding.top + (1 - t) * innerH
  }

  const yTicks = 5
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks)

  const xTickCount = Math.min(pointCount, Math.max(2, Math.floor(innerW / 120)))
  const xTickIndices = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((i * (pointCount - 1)) / Math.max(1, xTickCount - 1)),
  )

  const pathFor = (values: number[]) => {
    let d = ''
    let penUp = true
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (!Number.isFinite(v)) {
        penUp = true
        continue
      }
      const x = xFor(i).toFixed(2)
      const y = yFor(v).toFixed(2)
      d += (penUp ? `M ${x} ${y} ` : `L ${x} ${y} `)
      penUp = false
    }
    return d.trim()
  }

  const isDragging = dragStartX != null && dragCurrentX != null
  const dragPixels = isDragging ? Math.abs((dragCurrentX as number) - (dragStartX as number)) : 0
  const hasSelection = isDragging && dragPixels > 4

  const localXFromEvent = (clientX: number): number | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return clientX - rect.left - padding.left
  }

  const clampToPlot = (localX: number) => Math.max(0, Math.min(innerW, localX))

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const localX = localXFromEvent(e.clientX)
    if (localX == null) return

    if (dragStartX != null) {
      setDragCurrentX(clampToPlot(localX))
      setHoverIdx(null)
      return
    }

    if (localX < 0 || localX > innerW) {
      setHoverIdx(null)
      return
    }
    const ratio = pointCount === 1 ? 0 : localX / innerW
    const idx = Math.round(ratio * (pointCount - 1))
    setHoverIdx(Math.max(0, Math.min(pointCount - 1, idx)))
  }

  const handleLeave = () => {
    setHoverIdx(null)
    setDragStartX(null)
    setDragCurrentX(null)
  }

  const handleDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only left button initiates drag-zoom.
    if (e.button !== 0) return
    if (!onZoomSelection) return
    const localX = localXFromEvent(e.clientX)
    if (localX == null || localX < 0 || localX > innerW) return
    e.preventDefault()
    setDragStartX(clampToPlot(localX))
    setDragCurrentX(clampToPlot(localX))
  }

  const handleUp = () => {
    if (dragStartX != null && dragCurrentX != null && onZoomSelection) {
      const a = Math.min(dragStartX, dragCurrentX) / innerW
      const b = Math.max(dragStartX, dragCurrentX) / innerW
      if (b - a > 0.005) {
        onZoomSelection(Math.max(0, a), Math.min(1, b))
      }
    }
    setDragStartX(null)
    setDragCurrentX(null)
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!onZoomDelta && !onPanDelta) return
    const localX = localXFromEvent(e.clientX)
    if (localX == null) return

    // Horizontal wheel or shift+wheel → pan.
    const deltaX = e.deltaX
    const deltaY = e.deltaY
    const wantsPan = e.shiftKey || (Math.abs(deltaX) > Math.abs(deltaY) && deltaX !== 0)

    if (wantsPan && onPanDelta) {
      e.preventDefault()
      const primary = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      // 0.1 = roughly 10% of visible window per notch.
      onPanDelta(Math.sign(primary) * 0.1)
      return
    }

    if (onZoomDelta && deltaY !== 0) {
      e.preventDefault()
      const factor = deltaY < 0 ? 0.8 : 1.25
      const centerFrac = Math.max(0, Math.min(1, localX / innerW))
      onZoomDelta(factor, centerFrac)
    }
  }

  const handleDoubleClick = () => {
    if (onResetZoom) onResetZoom()
  }

  const hoverX = hoverIdx != null ? xFor(hoverIdx) : null
  const showHover = !isDragging && hoverIdx != null
  const canZoom = !!onZoomSelection

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        className={cn('block select-none', canZoom && (isDragging ? 'cursor-ew-resize' : 'cursor-crosshair'))}
      >
        {/* Plot background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={innerW}
          height={innerH}
          fill="hsl(var(--muted) / 0.18)"
          rx={6}
        />

        {/* Y grid + ticks */}
        {yTickValues.map((v, i) => {
          const y = yFor(v)
          return (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                x2={padding.left + innerW}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
                strokeDasharray={i === 0 ? '' : '3 3'}
              />
              <text
                x={padding.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {yFormat(v)}
              </text>
            </g>
          )
        })}

        {/* X ticks */}
        {xTickIndices.map((idx, k) => (
          <g key={`x-${k}`}>
            <line
              x1={xFor(idx)}
              x2={xFor(idx)}
              y1={padding.top + innerH}
              y2={padding.top + innerH + 4}
              stroke="hsl(var(--border))"
            />
            <text
              x={xFor(idx)}
              y={padding.top + innerH + 18}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10 }}
            >
              {xLabels[idx] ?? ''}
            </text>
          </g>
        ))}

        {/* Data lines */}
        {visible.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Hover crosshair */}
        {showHover && hoverX != null && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />
        )}

        {/* Hover markers */}
        {showHover &&
          hoverIdx != null &&
          visible.map((s) => {
            const v = s.values[hoverIdx]
            if (!Number.isFinite(v)) return null
            return (
              <circle
                key={`m-${s.key}`}
                cx={xFor(hoverIdx)}
                cy={yFor(v)}
                r={3.5}
                fill={s.color}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
              />
            )
          })}

        {/* Drag-to-zoom selection */}
        {hasSelection && dragStartX != null && dragCurrentX != null && (
          <g pointerEvents="none">
            <rect
              x={padding.left + Math.min(dragStartX, dragCurrentX)}
              y={padding.top}
              width={Math.abs(dragCurrentX - dragStartX)}
              height={innerH}
              fill="hsl(var(--primary) / 0.15)"
              stroke="hsl(var(--primary))"
              strokeOpacity={0.7}
              strokeDasharray="3 3"
            />
          </g>
        )}
      </svg>

      {/* Zoom hint (shown briefly while selecting) */}
      {hasSelection && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-primary/40 bg-background/90 px-2 py-1 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
          Release to zoom
        </div>
      )}

      {/* Hover tooltip */}
      {showHover && hoverIdx != null && (() => {
        const left = Math.min(
          width - 200,
          Math.max(4, xFor(hoverIdx) + 10),
        )
        return (
          <div
            className="pointer-events-none absolute rounded-md border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
            style={{ left, top: 8, minWidth: 180 }}
          >
            <div className="mb-1 font-semibold text-foreground">
              {xLabels[hoverIdx]}
            </div>
            <div className="space-y-0.5">
              {visible.map((s) => {
                const v = s.values[hoverIdx]
                return (
                  <div key={s.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-muted-foreground">{s.key}</span>
                    </span>
                    <span className="font-mono text-foreground">
                      {Number.isFinite(v) ? yFormat(v) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

function buildSeries(
  rows: SystemLogRow[],
  keys: readonly string[],
  selected: Record<string, boolean>,
): { xLabels: string[]; series: SeriesDef[] } {
  const indices = downsampleIndices(rows.length, MAX_CHART_POINTS)
  const xLabels = indices.map((i) => rows[i].log_time || String(rows[i].time))
  const series: SeriesDef[] = keys
    .filter((k) => selected[k])
    .map((k) => ({
      key: k,
      color: SERIES_COLORS[k] ?? '#64748b',
      values: indices.map((i) => {
        const v = rows[i][k]
        return typeof v === 'number' ? v : Number.NaN
      }),
    }))
  return { xLabels, series }
}

function initialSelection(keys: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true]))
}

function resolveWindow(
  result: ParseResult | null,
  zoom: { start: number; end: number } | null,
): { start: number; end: number } | null {
  if (!result || result.rows.length === 0) return null
  const rowMax = result.rows.length - 1
  if (!zoom) return { start: 0, end: rowMax }
  const start = Math.max(0, Math.min(rowMax, zoom.start))
  const end = Math.max(start + 1, Math.min(rowMax, zoom.end))
  return { start, end }
}

function sliceRows(
  rows: SystemLogRow[],
  win: { start: number; end: number },
): SystemLogRow[] {
  return rows.slice(win.start, win.end + 1)
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB'
  if (abs >= 1024 ** 2) return (n / 1024 ** 2).toFixed(2) + ' MB'
  if (abs >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return String(Math.round(n)) + ' B'
}

type ZoomWindow = { start: number; end: number } | null

export function SystemLogAnalyzerTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [cpuSel, setCpuSel] = useState<Record<string, boolean>>(() => initialSelection(CPU_SERIES))
  const [memSel, setMemSel] = useState<Record<string, boolean>>(() => initialSelection(MEM_SERIES))
  const [memUnit, setMemUnit] = useState<'raw' | 'bytes'>('bytes')
  const [cpuZoom, setCpuZoom] = useState<ZoomWindow>(null)
  const [memZoom, setMemZoom] = useState<ZoomWindow>(null)
  const [exporting, setExporting] = useState(false)

  const loadFile = useCallback(async (file: File) => {
    setParsing(true)
    try {
      const text = await file.text()
      const parsed = parseSystemInfoCsv(text)
      setResult(parsed)
      setFileName(file.name)
      setCpuZoom(null)
      setMemZoom(null)
      toast.success(
        `Loaded ${parsed.rows.length.toLocaleString()} rows`,
        {
          description: [
            parsed.droppedHeaderRows > 0 && `Dropped ${parsed.droppedHeaderRows} duplicate header rows.`,
            parsed.droppedBadRows > 0 && `Skipped ${parsed.droppedBadRows} rows with invalid time.`,
          ].filter(Boolean).join(' ') || 'File is clean and sorted.',
        },
      )
    } catch (err) {
      console.error(err)
      toast.error('Failed to parse CSV', { description: String(err) })
    } finally {
      setParsing(false)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
    // Reset so re-selecting the same file triggers change.
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  const handleClear = () => {
    setResult(null)
    setFileName(null)
    setCpuSel(initialSelection(CPU_SERIES))
    setMemSel(initialSelection(MEM_SERIES))
    setCpuZoom(null)
    setMemZoom(null)
  }

  const handleExport = async () => {
    if (!result || exporting) return
    setExporting(true)
    try {
      // Pass the same series selection AND the same zoom windows the preview
      // uses, so the Excel charts plot the exact same points the user sees.
      const cpuKeys = CPU_SERIES.filter((k) => cpuSel[k])
      const memKeys = MEM_SERIES.filter((k) => memSel[k])

      await exportSystemLogXlsx({
        fileName: fileName ?? 'system_info_all.csv',
        headers: result.headers,
        rows: result.rows,
        cpuSeriesKeys: cpuKeys,
        memSeriesKeys: memKeys,
        cpuWindow: cpuWindow ?? undefined,
        memWindow: memWindow ?? undefined,
      })
      toast.success('Cleaned XLSX exported', {
        description: 'Open the "Charts" sheet — both graphs are native, editable Excel charts.',
      })
    } catch (err) {
      console.error(err)
      toast.error('Export failed', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const cpuWindow = useMemo(() => resolveWindow(result, cpuZoom), [result, cpuZoom])
  const memWindow = useMemo(() => resolveWindow(result, memZoom), [result, memZoom])

  const cpuChart = useMemo(
    () =>
      result && cpuWindow
        ? buildSeries(sliceRows(result.rows, cpuWindow), CPU_SERIES, cpuSel)
        : null,
    [result, cpuWindow, cpuSel],
  )
  const memChart = useMemo(
    () =>
      result && memWindow
        ? buildSeries(sliceRows(result.rows, memWindow), MEM_SERIES, memSel)
        : null,
    [result, memWindow, memSel],
  )

  const makeZoomHandlers = (
    zoom: ZoomWindow,
    setZoom: (z: ZoomWindow) => void,
  ) => {
    if (!result || result.rows.length < 2) {
      return { selection: undefined, delta: undefined, pan: undefined, reset: undefined }
    }
    const rowMax = result.rows.length - 1
    const win = zoom ?? { start: 0, end: rowMax }

    const apply = (start: number, end: number) => {
      const clampedStart = Math.max(0, Math.min(rowMax, start))
      const clampedEnd = Math.max(clampedStart + 1, Math.min(rowMax, end))
      if (clampedStart <= 0 && clampedEnd >= rowMax) {
        setZoom(null)
      } else {
        setZoom({ start: clampedStart, end: clampedEnd })
      }
    }

    const selection = (startFrac: number, endFrac: number) => {
      const span = win.end - win.start
      const a = Math.round(win.start + Math.min(startFrac, endFrac) * span)
      const b = Math.round(win.start + Math.max(startFrac, endFrac) * span)
      if (b - a < 2) return
      apply(a, b)
    }

    const delta = (factor: number, centerFrac: number) => {
      const span = win.end - win.start
      const newSpan = Math.max(2, Math.round(span * factor))
      if (newSpan >= rowMax) {
        setZoom(null)
        return
      }
      const centerRow = win.start + centerFrac * span
      let start = Math.round(centerRow - centerFrac * newSpan)
      let end = start + newSpan
      if (start < 0) {
        end += -start
        start = 0
      }
      if (end > rowMax) {
        start -= end - rowMax
        end = rowMax
        if (start < 0) start = 0
      }
      apply(start, end)
    }

    const pan = (deltaFrac: number) => {
      const span = win.end - win.start
      const shift = Math.round(deltaFrac * span)
      if (shift === 0) return
      let start = win.start + shift
      let end = win.end + shift
      if (start < 0) {
        end += -start
        start = 0
      }
      if (end > rowMax) {
        start -= end - rowMax
        end = rowMax
      }
      apply(start, end)
    }

    const reset = () => setZoom(null)

    return { selection, delta, pan, reset }
  }

  const cpuHandlers = makeZoomHandlers(cpuZoom, setCpuZoom)
  const memHandlers = makeZoomHandlers(memZoom, setMemZoom)

  // Stats summary
  const stats = useMemo(() => {
    if (!result || result.rows.length === 0) return null
    const first = result.rows[0]
    const last = result.rows[result.rows.length - 1]
    const vals = (key: string) =>
      result.rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number')

    const maxLoad = vals('sys_load_avg').reduce((m, v) => Math.max(m, v), -Infinity)
    const maxUsedMem = vals('used_mem').reduce((m, v) => Math.max(m, v), -Infinity)
    const maxUsedPhys = vals('used_phys_mem').reduce((m, v) => Math.max(m, v), -Infinity)

    return {
      firstTime: first.log_time,
      lastTime: last.log_time,
      durationSec: last.time - first.time,
      rowCount: result.rows.length,
      maxLoad: Number.isFinite(maxLoad) ? maxLoad : null,
      maxUsedMem: Number.isFinite(maxUsedMem) ? maxUsedMem : null,
      maxUsedPhys: Number.isFinite(maxUsedPhys) ? maxUsedPhys : null,
    }
  }, [result])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChartIcon className="w-5 h-5" />
            System Log Analyzer
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30',
                'dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/30',
              )}
              title="This feature is in beta — behavior or output may change."
            >
              Beta
            </span>
          </CardTitle>
          <CardDescription>
            Drop a <code className="text-xs">system_info_all.csv</code> file and this tab will do the
            Excel cleanup, and then filter out duplicate header rows, format{' '}
            <code className="text-xs">log_time</code> as <code className="text-xs">m/d/yyyy h:mm:ss</code>,
            floor <code className="text-xs">time</code> to an integer, sort ascending, and then plot the CPU &
            memory graphs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border/60 bg-muted/20 hover:bg-muted/30',
            )}
          >
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {fileName ? (
                  <span>
                    Loaded <span className="font-mono text-primary">{fileName}</span>
                  </span>
                ) : (
                  'Drop system_info_all.csv here'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                or click the button below to browse
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                <FileUp className="w-4 h-4 mr-1.5" />
                {parsing ? 'Parsing…' : 'Choose CSV'}
              </Button>
              {result && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    {exporting ? 'Exporting…' : 'Export XLSX (with graphs)'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleClear}>
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          {result && stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<Database className="h-4 w-4" />}
                label="Rows"
                value={stats.rowCount.toLocaleString()}
                hint={`${result.droppedHeaderRows} header dup. / ${result.droppedBadRows} invalid removed`}
              />
              <StatCard
                icon={<RefreshCw className="h-4 w-4" />}
                label="Duration"
                value={formatDuration(stats.durationSec)}
                hint={`${stats.firstTime} → ${stats.lastTime}`}
              />
              <StatCard
                icon={<Cpu className="h-4 w-4" />}
                label="Peak load"
                value={stats.maxLoad != null ? stats.maxLoad.toFixed(2) : '—'}
                hint="sys_load_avg max"
              />
              <StatCard
                icon={<MemoryStick className="h-4 w-4" />}
                label="Peak used_mem"
                value={stats.maxUsedMem != null ? formatBytes(stats.maxUsedMem) : '—'}
                hint={
                  stats.maxUsedPhys != null
                    ? `phys: ${formatBytes(stats.maxUsedPhys)}`
                    : undefined
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {result && cpuChart && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-5 h-5" />
                  CPU
                </CardTitle>
                <CardDescription>
                  <code className="text-xs">nb_cpus</code> and{' '}
                  <code className="text-xs">sys_load_avg</code> over time.
                </CardDescription>
              </div>
              <ZoomToolbar
                result={result}
                zoom={cpuZoom}
                onResetZoom={cpuHandlers.reset}
                onZoomDelta={cpuHandlers.delta}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <SeriesToggles
              keys={CPU_SERIES}
              selected={cpuSel}
              onToggle={(k) => setCpuSel((s) => ({ ...s, [k]: !s[k] }))}
            />
            <LineChart
              xLabels={cpuChart.xLabels}
              series={cpuChart.series}
              height={320}
              emptyMessage="Select at least one CPU series to plot"
              onZoomSelection={cpuHandlers.selection}
              onZoomDelta={cpuHandlers.delta}
              onPanDelta={cpuHandlers.pan}
              onResetZoom={cpuHandlers.reset}
            />
            <ZoomHint />
          </CardContent>
        </Card>
      )}

      {result && memChart && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MemoryStick className="w-5 h-5" />
                  Memory
                </CardTitle>
                <CardDescription>
                  Physical & JVM memory series over time.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background p-0.5 text-xs">
                  <UnitToggle
                    active={memUnit === 'bytes'}
                    onClick={() => setMemUnit('bytes')}
                    label="Bytes"
                  />
                  <UnitToggle
                    active={memUnit === 'raw'}
                    onClick={() => setMemUnit('raw')}
                    label="Raw"
                  />
                </div>
                <ZoomToolbar
                  result={result}
                  zoom={memZoom}
                  onResetZoom={memHandlers.reset}
                  onZoomDelta={memHandlers.delta}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <SeriesToggles
              keys={MEM_SERIES}
              selected={memSel}
              onToggle={(k) => setMemSel((s) => ({ ...s, [k]: !s[k] }))}
            />
            <LineChart
              xLabels={memChart.xLabels}
              series={memChart.series}
              height={360}
              yFormat={memUnit === 'bytes' ? formatBytes : defaultFormatNumber}
              emptyMessage="Select at least one memory series to plot"
              onZoomSelection={memHandlers.selection}
              onZoomDelta={memHandlers.delta}
              onPanDelta={memHandlers.pan}
              onResetZoom={memHandlers.reset}
            />
            <ZoomHint />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Cleaned data preview
            </CardTitle>
            <CardDescription>
              Sorted & formatted dataset — {result.rows.length.toLocaleString()} rows. Scroll the table
              below to browse every row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VirtualDataTable result={result} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeriesToggles({
  keys,
  selected,
  onToggle,
}: {
  keys: readonly string[]
  selected: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => {
        const color = SERIES_COLORS[k] ?? '#64748b'
        const on = !!selected[k]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              on
                ? 'border-border/60 bg-background text-foreground'
                : 'border-border/40 bg-muted/30 text-muted-foreground line-through decoration-[1px]',
            )}
            style={on ? { boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: on ? color : 'currentColor', opacity: on ? 1 : 0.4 }}
            />
            {k}
          </button>
        )
      })}
    </div>
  )
}

function ZoomToolbar({
  result,
  zoom,
  onResetZoom,
  onZoomDelta,
}: {
  result: ParseResult
  zoom: ZoomWindow
  onResetZoom?: () => void
  onZoomDelta?: (factor: number, centerFrac: number) => void
}) {
  const rowMax = Math.max(0, result.rows.length - 1)
  const win = zoom ?? { start: 0, end: rowMax }
  const winSpan = win.end - win.start
  const totalSpan = rowMax
  const zoomPct = totalSpan > 0 ? Math.max(1, Math.round((totalSpan / Math.max(1, winSpan)) * 100) / 100) : 1
  const startRow = result.rows[win.start]
  const endRow = result.rows[win.end]

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <div
        className={cn(
          'rounded-md border px-2 py-1 font-mono tabular-nums',
          zoom
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-border/50 bg-muted/20 text-muted-foreground',
        )}
        title={
          zoom && startRow && endRow
            ? `Showing rows ${(win.start + 1).toLocaleString()} – ${(win.end + 1).toLocaleString()} of ${result.rows.length.toLocaleString()}\n${startRow.log_time} → ${endRow.log_time}`
            : `Showing all ${result.rows.length.toLocaleString()} rows`
        }
      >
        {zoom ? `${zoomPct.toFixed(zoomPct >= 10 ? 0 : 1)}× · ${(winSpan + 1).toLocaleString()} pts` : '1× · all'}
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          onClick={() => onZoomDelta?.(0.5, 0.5)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          onClick={() => onZoomDelta?.(2, 0.5)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!zoom}
          onClick={() => onResetZoom?.()}
          title="Reset zoom (or double-click the chart)"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>
    </div>
  )
}

function ZoomHint() {
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="font-medium">Drag</span> to zoom into a range ·{' '}
      <span className="font-medium">scroll</span> to zoom at cursor ·{' '}
      <span className="font-medium">shift+scroll</span> to pan ·{' '}
      <span className="font-medium">double-click</span> to reset
    </p>
  )
}

function UnitToggle({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-0.5 transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold leading-tight text-foreground">
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={hint}>
          {hint}
        </div>
      )}
    </div>
  )
}

/**
 * Virtualized data preview. Only renders the rows inside the visible viewport
 * (plus a small overscan), so browsing a 100k+ row file stays smooth.
 *
 * Layout strategy:
 *   - Single scrollable container for both axes (so the horizontal scrollbar
 *     doesn't disappear when the vertical one is active).
 *   - Sticky <thead> locks the column headers during vertical scroll.
 *   - A spacer row before the visible slice + a spacer row after keeps the
 *     scrollbar thumb sized correctly without rendering N × headers.length
 *     <td> nodes.
 */
function VirtualDataTable({ result }: { result: ParseResult }) {
  const ROW_HEIGHT = 26 // matches py-1 + font line height
  const VIEWPORT_HEIGHT = 480
  const OVERSCAN = 10

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const total = result.rows.length

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2
  const endIdx = Math.min(total, startIdx + visibleCount)

  const slice = result.rows.slice(startIdx, endIdx)
  const topSpacer = startIdx * ROW_HEIGHT
  const bottomSpacer = Math.max(0, (total - endIdx) * ROW_HEIGHT)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden bg-background/40">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative overflow-auto"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        <table
          className="w-full text-xs border-separate"
          style={{ borderSpacing: 0, minWidth: '100%' }}
        >
          <thead className="sticky top-0 z-10">
            <tr>
              {result.headers.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-border/40 bg-muted/60 backdrop-blur-sm px-2.5 py-1.5 text-left font-semibold text-muted-foreground"
                  style={{ height: ROW_HEIGHT }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Top spacer */}
            {topSpacer > 0 && (
              <tr aria-hidden="true" style={{ height: topSpacer }}>
                <td colSpan={result.headers.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {slice.map((row, i) => {
              const absoluteIndex = startIdx + i
              const zebra = absoluteIndex % 2 === 1
              return (
                <tr
                  key={absoluteIndex}
                  className={cn(
                    'hover:bg-accent/30',
                    zebra && 'bg-muted/10',
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {result.headers.map((h, j) => {
                    const v = row[h]
                    const isNum = typeof v === 'number'
                    return (
                      <td
                        key={h}
                        className={cn(
                          'whitespace-nowrap border-b border-border/20 px-2.5 font-mono',
                          isNum && 'text-right tabular-nums',
                          j === 0 && 'text-muted-foreground',
                        )}
                        style={{ height: ROW_HEIGHT }}
                      >
                        {isNum
                          ? Number.isFinite(v)
                            ? v.toLocaleString()
                            : '—'
                          : String(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* Bottom spacer */}
            {bottomSpacer > 0 && (
              <tr aria-hidden="true" style={{ height: bottomSpacer }}>
                <td colSpan={result.headers.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border/30 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          Rows {total === 0 ? 0 : (startIdx + 1).toLocaleString()}–{endIdx.toLocaleString()} of{' '}
          {total.toLocaleString()}
        </span>
        <span className="font-mono">
          {total > 0
            ? `${Math.round(((startIdx + visibleCount / 2) / total) * 100)}%`
            : '—'}
        </span>
      </div>
    </div>
  )
}

// Height is referenced by the table to keep row heights in sync.
// (Exported name kept colocated for locality; not used elsewhere.)

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
