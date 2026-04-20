/**
 * Canvas-based line chart renderer for the System Log export.
 *
 * Renders a titled, multi-series line chart to a PNG (as Uint8Array),
 * suitable for embedding into an XLSX via ExcelJS's `addImage` API.
 *
 * Why this exists: generating native OOXML chart XML is fragile — tiny
 * cache / axis-type mismatches cause Excel to render empty or flat
 * charts. A rasterized PNG avoids all of that: what we draw is exactly
 * what the user sees in Excel.
 */

export interface PngChartSeries {
  key: string
  /** Hex color, e.g. "#6366f1" or "6366f1". */
  color: string
  /** One value per data row. `null` = missing → line gap. */
  values: (number | null)[]
}

export interface PngChartOptions {
  title: string
  /** Pre-formatted x-axis labels, one per data row. */
  categoryLabels: string[]
  series: PngChartSeries[]
  /** Output size in device pixels. */
  width?: number
  height?: number
  /** Target number of x-axis tick labels. */
  xTickTarget?: number
  /** Target number of y-axis ticks. */
  yTickTarget?: number
  /** Max points drawn per series (downsampled if more). */
  maxPointsPerSeries?: number
  /** Value axis label, drawn vertically on the left. */
  yLabel?: string
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function normalizeColor(c: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(c)
  return m ? `#${m[1]}` : '#64748b'
}

// ---------------------------------------------------------------------------
// Number-axis / ticks
// ---------------------------------------------------------------------------

/** "Nice" number: round to 1/2/5 × 10^k near `x`. */
function niceNum(x: number, round: boolean): number {
  if (x <= 0 || !Number.isFinite(x)) return 1
  const exp = Math.floor(Math.log10(x))
  const f = x / Math.pow(10, exp)
  let nf: number
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 3) nf = 2
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * Math.pow(10, exp)
}

function niceScale(min: number, max: number, target = 6): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const v = Number.isFinite(min) ? min : 0
    return { min: v - 1, max: v + 1, step: 0.5 }
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / Math.max(1, target - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  return { min: niceMin, max: niceMax, step }
}

function formatTickNumber(v: number): string {
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toFixed(abs < 10e9 ? 2 : 1) + 'B'
  if (abs >= 1e6) return (v / 1e6).toFixed(abs < 10e6 ? 2 : 1) + 'M'
  if (abs >= 1e3) return (v / 1e3).toFixed(abs < 10e3 ? 2 : 1) + 'K'
  if (abs >= 10) return v.toFixed(0)
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

// ---------------------------------------------------------------------------
// Downsampling (LTTB — preserves visual shape)
// ---------------------------------------------------------------------------

function lttb(values: (number | null)[], threshold: number): number[] {
  // Returns the selected indices (preserving visual shape). Works on pairs
  // (index, value) — x is uniform (index), so bucket math simplifies.
  const n = values.length
  if (threshold >= n || threshold < 3) {
    const all: number[] = []
    for (let i = 0; i < n; i++) all.push(i)
    return all
  }

  const out: number[] = []
  const bucketSize = (n - 2) / (threshold - 2)

  let a = 0
  out.push(a)

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)

    // Average point of the next bucket (for triangle-area calc).
    let avgX = 0
    let avgY = 0
    let avgCount = 0
    const nextStart = Math.floor((i + 1) * bucketSize) + 1
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)
    for (let j = nextStart; j < nextEnd; j++) {
      const v = values[j]
      if (v === null || !Number.isFinite(v)) continue
      avgX += j
      avgY += v
      avgCount++
    }
    if (avgCount === 0) {
      // Empty next bucket — fall back to midpoint index.
      avgX = (nextStart + nextEnd - 1) / 2
      avgY = 0
    } else {
      avgX /= avgCount
      avgY /= avgCount
    }

    const pointAX = a
    const pointAY = (values[a] ?? 0) as number

    let maxArea = -1
    let maxIdx = rangeStart

    for (let j = rangeStart; j < rangeEnd; j++) {
      const v = values[j]
      if (v === null || !Number.isFinite(v)) continue
      const area =
        Math.abs(
          (pointAX - avgX) * (v - pointAY) -
            (pointAX - j) * (avgY - pointAY),
        ) / 2
      if (area > maxArea) {
        maxArea = area
        maxIdx = j
      }
    }

    out.push(maxIdx)
    a = maxIdx
  }

  out.push(n - 1)
  return out
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

/**
 * Render the given series to a PNG. Returns the raw PNG bytes.
 */
export async function renderLineChartPng(opts: PngChartOptions): Promise<Uint8Array> {
  const {
    title,
    categoryLabels,
    series,
    width = 1400,
    height = 520,
    xTickTarget = 12,
    yTickTarget = 8,
    maxPointsPerSeries = 2000,
    yLabel,
  } = opts

  // Upscale for crispness on higher-DPI displays. Excel will scale the PNG
  // down to the anchor size, keeping it sharp.
  const dpr = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D canvas context')
  ctx.scale(dpr, dpr)

  // ---- Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // ---- Layout
  const padLeft = 84
  const padRight = 24
  const padTop = 48
  const padBottom = 88 // space for rotated x labels + legend
  const plotX = padLeft
  const plotY = padTop
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  // ---- Title
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(title, plotX, 14)

  const n = categoryLabels.length
  if (n === 0 || series.length === 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px "Segoe UI", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('(no data)', plotX + plotW / 2, plotY + plotH / 2)
    return await canvasToPng(canvas)
  }

  // ---- Y range
  let yMin = Infinity
  let yMax = -Infinity
  for (const s of series) {
    for (const v of s.values) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue
      if (v < yMin) yMin = v
      if (v > yMax) yMax = v
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0
    yMax = 1
  }
  if (yMin === yMax) {
    const pad = Math.abs(yMin) > 0 ? Math.abs(yMin) * 0.1 : 1
    yMin -= pad
    yMax += pad
  }
  const yScale = niceScale(yMin, yMax, yTickTarget)

  // ---- Axes (value)
  const xToPx = (i: number) => plotX + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yToPx = (v: number) =>
    plotY + plotH - ((v - yScale.min) / (yScale.max - yScale.min)) * plotH

  // Gridlines + y labels
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.fillStyle = '#475569'
  ctx.font = '12px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const yTicks: number[] = []
  for (let v = yScale.min; v <= yScale.max + yScale.step * 0.5; v += yScale.step) {
    yTicks.push(v)
  }
  for (const v of yTicks) {
    const y = yToPx(v)
    ctx.beginPath()
    ctx.moveTo(plotX, y)
    ctx.lineTo(plotX + plotW, y)
    ctx.stroke()
    ctx.fillText(formatTickNumber(v), plotX - 8, y)
  }

  // Y-axis label (rotated)
  if (yLabel) {
    ctx.save()
    ctx.translate(18, plotY + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#334155'
    ctx.font = '12px "Segoe UI", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(yLabel, 0, 0)
    ctx.restore()
  }

  // ---- X tick labels
  const xTickStep = Math.max(1, Math.ceil(n / xTickTarget))
  ctx.fillStyle = '#475569'
  ctx.font = '11px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  for (let i = 0; i < n; i += xTickStep) {
    const x = xToPx(i)
    const label = categoryLabels[i]
    if (!label) continue
    // Tick mark
    ctx.strokeStyle = '#94a3b8'
    ctx.beginPath()
    ctx.moveTo(x, plotY + plotH)
    ctx.lineTo(x, plotY + plotH + 4)
    ctx.stroke()
    // Rotated label
    ctx.save()
    ctx.translate(x, plotY + plotH + 8)
    ctx.rotate(-Math.PI / 4)
    ctx.fillText(label, 0, 0)
    ctx.restore()
  }
  // Ensure the last label is drawn too (for context).
  if ((n - 1) % xTickStep !== 0 && n > 1) {
    const x = xToPx(n - 1)
    const label = categoryLabels[n - 1]
    if (label) {
      ctx.save()
      ctx.translate(x, plotY + plotH + 8)
      ctx.rotate(-Math.PI / 4)
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }

  // Axis border
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(plotX, plotY)
  ctx.lineTo(plotX, plotY + plotH)
  ctx.lineTo(plotX + plotW, plotY + plotH)
  ctx.stroke()

  // ---- Series lines (with LTTB downsampling)
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const s of series) {
    const indices = lttb(s.values, maxPointsPerSeries)
    ctx.strokeStyle = normalizeColor(s.color)
    ctx.beginPath()
    let penDown = false
    for (const idx of indices) {
      const v = s.values[idx]
      if (v === null || v === undefined || !Number.isFinite(v)) {
        penDown = false
        continue
      }
      const x = xToPx(idx)
      const y = yToPx(v)
      if (!penDown) {
        ctx.moveTo(x, y)
        penDown = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  // ---- Legend (horizontal, bottom)
  const legendY = height - 24
  ctx.font = '12px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  // Measure total width to center the legend.
  const gap = 20
  const swatch = 18
  const itemWidths = series.map((s) => {
    const w = ctx.measureText(s.key).width
    return swatch + 6 + w
  })
  const totalW = itemWidths.reduce((a, b) => a + b, 0) + gap * Math.max(0, series.length - 1)
  let cx = Math.max(plotX, plotX + (plotW - totalW) / 2)
  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    ctx.strokeStyle = normalizeColor(s.color)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx, legendY)
    ctx.lineTo(cx + swatch, legendY)
    ctx.stroke()
    ctx.fillStyle = '#334155'
    ctx.fillText(s.key, cx + swatch + 6, legendY)
    cx += itemWidths[i] + gap
  }

  return await canvasToPng(canvas)
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  )
  if (!blob) throw new Error('canvas.toBlob returned null')
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
