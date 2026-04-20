/**
 * Export helpers for the System Log Analyzer.
 *
 * Produces a multi-sheet XLSX:
 *   - "Data"            — the full cleaned, sorted rows (all samples).
 *   - "CPUChartData"    — hidden. The exact point set the in-app CPU chart
 *                         renders: the rows within the CPU zoom window,
 *                         index-picked to MAX_CHART_POINTS.
 *   - "MemChartData"    — hidden. Same, for the Memory chart.
 *   - "Charts"          — NATIVE, editable Excel line charts referencing
 *                         the two hidden sheets.
 *
 * Goal: the Excel charts mirror the in-app preview 1:1 — same series
 *       selection, same zoom window, same downsampling, single shared
 *       Y axis per chart. No bucket-averaging, no secondary axes, no
 *       line smoothing. If the app shows X, Excel shows X.
 *
 * The X axis is a CATEGORY axis (not a date axis): every sample is
 * spaced evenly, just like the in-app SVG chart. A date axis would
 * position samples by real timestamp, which — when logs have uneven
 * cadence (bursts + gaps) — collapses most of the data into vertical
 * spikes. The cached labels are still formatted date strings so the
 * axis reads as timestamps, but spacing is uniform.
 */

import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  SERIES_COLORS,
  MAX_CHART_POINTS,
  downsampleIndices,
  formatLogTime,
  type SystemLogRow,
} from './system-log'

/** Inclusive row-index window (same shape as the app's zoom state). */
export interface ChartWindow {
  start: number
  end: number
}

export interface ExportOptions {
  fileName: string
  headers: string[]
  rows: SystemLogRow[]
  /** Columns to plot in the CPU chart, in order (skipped if empty). */
  cpuSeriesKeys: string[]
  /** Columns to plot in the Memory chart, in order (skipped if empty). */
  memSeriesKeys: string[]
  /** Optional zoom window for the CPU chart (app's current view). */
  cpuWindow?: ChartWindow
  /** Optional zoom window for the Memory chart (app's current view). */
  memWindow?: ChartWindow
}

// ---------------------------------------------------------------------------
// Cell ref helpers
// ---------------------------------------------------------------------------

function columnLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function absCellRef(col: number, row: number): string {
  return `$${columnLetter(col)}$${row}`
}

function absRangeRef(col: number, rowStart: number, rowEnd: number): string {
  const letter = columnLetter(col)
  return `$${letter}$${rowStart}:$${letter}$${rowEnd}`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      default: return c
    }
  })
}

function quoteSheet(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

function sanitizeHex(color: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(color)
  return (m ? m[1] : '64748B').toUpperCase()
}

function numToCache(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  return String(Number(n.toFixed(6)))
}

function buildNumCache(
  values: (number | null)[],
  formatCode: string,
  ptCount: number,
): string {
  let pts = ''
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    pts += `<c:pt idx="${i}"><c:v>${numToCache(v)}</c:v></c:pt>`
  }
  return `<c:numCache><c:formatCode>${escapeXml(formatCode)}</c:formatCode><c:ptCount val="${ptCount}"/>${pts}</c:numCache>`
}

function buildStrCache(labels: string[], ptCount: number): string {
  let pts = ''
  for (let i = 0; i < labels.length; i++) {
    const s = labels[i]
    if (!s) continue
    pts += `<c:pt idx="${i}"><c:v>${escapeXml(s)}</c:v></c:pt>`
  }
  return `<c:strCache><c:ptCount val="${ptCount}"/>${pts}</c:strCache>`
}

// ---------------------------------------------------------------------------
// Chart XML — single shared Y axis, no smoothing (matches in-app SVG chart)
// ---------------------------------------------------------------------------

interface ChartSeriesRef {
  key: string
  /** 1-based column index on the referenced data sheet. */
  valuesCol: number
  color: string
  values: (number | null)[]
}

interface ChartXmlOptions {
  title: string
  dataSheet: string
  categoryCol: number
  firstDataRow: number
  lastDataRow: number
  series: ChartSeriesRef[]
  /** Pre-formatted label per row (e.g. "4/7/2026 14:05"). */
  categoryLabels: string[]
  valNumFmt?: string
  /** Base axis-id — must differ between charts in the same workbook. */
  axisIdBase?: number
}

function buildChartXml(opts: ChartXmlOptions): string {
  const {
    title,
    dataSheet,
    categoryCol,
    firstDataRow,
    lastDataRow,
    series,
    categoryLabels,
    valNumFmt = 'General',
    axisIdBase = 100,
  } = opts

  const sheet = quoteSheet(dataSheet)
  const catRangeRef = `${sheet}!${absRangeRef(categoryCol, firstDataRow, lastDataRow)}`
  const ptCount = lastDataRow - firstDataRow + 1
  const catCacheXml = buildStrCache(categoryLabels, ptCount)

  // Show ~10-12 x-axis labels regardless of sample count (matches the
  // in-app chart's auto-tick behavior).
  const tickLblSkip = Math.max(1, Math.ceil(ptCount / 12))

  const catAxId = axisIdBase
  const valAxId = axisIdBase + 1

  const seriesXml = series
    .map((s, i) => {
      const nameRef = `${sheet}!${absCellRef(s.valuesCol, 1)}`
      const valRef = `${sheet}!${absRangeRef(s.valuesCol, firstDataRow, lastDataRow)}`
      const color = sanitizeHex(s.color)
      const valCacheXml = buildNumCache(s.values, valNumFmt, ptCount)
      return `
        <c:ser>
          <c:idx val="${i}"/>
          <c:order val="${i}"/>
          <c:tx>
            <c:strRef>
              <c:f>${escapeXml(nameRef)}</c:f>
              <c:strCache>
                <c:ptCount val="1"/>
                <c:pt idx="0"><c:v>${escapeXml(s.key)}</c:v></c:pt>
              </c:strCache>
            </c:strRef>
          </c:tx>
          <c:spPr>
            <a:ln w="19050" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln>
            <a:effectLst/>
          </c:spPr>
          <c:marker><c:symbol val="none"/></c:marker>
          <c:cat><c:strRef><c:f>${escapeXml(catRangeRef)}</c:f>${catCacheXml}</c:strRef></c:cat>
          <c:val><c:numRef><c:f>${escapeXml(valRef)}</c:f>${valCacheXml}</c:numRef></c:val>
          <c:smooth val="0"/>
        </c:ser>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich>
        <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" wrap="square" anchor="ctr" anchorCtr="1"/>
        <a:lstStyle/>
        <a:p>
          <a:pPr><a:defRPr sz="1400" b="1" kern="1200"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr>
          <a:r><a:rPr lang="en-US" sz="1400" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${escapeXml(title)}</a:t></a:r>
        </a:p>
      </c:rich></c:tx>
      <c:overlay val="0"/>
      <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:lineChart>
        <c:grouping val="standard"/>
        <c:varyColors val="0"/>${seriesXml}
        <c:marker val="0"/>
        <c:axId val="${catAxId}"/>
        <c:axId val="${valAxId}"/>
      </c:lineChart>
      <c:catAx>
        <c:axId val="${catAxId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:numFmt formatCode="General" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:spPr>
          <a:noFill/>
          <a:ln w="9525"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln>
        </c:spPr>
        <c:txPr>
          <a:bodyPr rot="-2700000" spcFirstLastPara="1" vertOverflow="ellipsis" wrap="square" anchor="ctr" anchorCtr="1"/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="900" b="0" kern="1200"><a:solidFill><a:srgbClr val="475569"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p>
        </c:txPr>
        <c:crossAx val="${valAxId}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:tickLblSkip val="${tickLblSkip}"/>
        <c:tickMarkSkip val="${tickLblSkip}"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="${valAxId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines>
          <c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
        </c:majorGridlines>
        <c:numFmt formatCode="${escapeXml(valNumFmt)}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${catAxId}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
      <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
      <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln><a:effectLst/></c:spPr>
      <c:txPr>
        <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" wrap="square" anchor="ctr" anchorCtr="1"/>
        <a:lstStyle/>
        <a:p>
          <a:pPr><a:defRPr sz="1000" b="0" kern="1200"><a:solidFill><a:srgbClr val="334155"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr>
          <a:endParaRPr lang="en-US"/>
        </a:p>
      </c:txPr>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr>
    <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
    <a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln>
  </c:spPr>
</c:chartSpace>`
}

// ---------------------------------------------------------------------------
// Drawing XML
// ---------------------------------------------------------------------------

interface ChartAnchor {
  rId: string
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  chartIndex: number
}

function buildDrawingXml(anchors: ChartAnchor[]): string {
  const body = anchors
    .map(
      (a) => `
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>${a.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>${a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${a.chartIndex + 1}" name="Chart ${a.chartIndex}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${a.rId}"/>
      </a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${body}
</xdr:wsDr>`
}

function buildDrawingRelsXml(anchors: ChartAnchor[]): string {
  const body = anchors
    .map(
      (a, i) =>
        `<Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`
}

// ---------------------------------------------------------------------------
// Inject chart parts into the xlsx ZIP
// ---------------------------------------------------------------------------

async function findSheetPath(
  zip: JSZip,
  sheetName: string,
): Promise<{ sheetPath: string } | null> {
  const wb = zip.file('xl/workbook.xml')
  if (!wb) return null
  const xml = await wb.async('string')
  const re = /<sheet\s+([^/]+?)\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const attrs = m[1]
    const nameMatch = /name="([^"]+)"/.exec(attrs)
    const ridMatch = /r:id="([^"]+)"/.exec(attrs)
    if (nameMatch && nameMatch[1] === sheetName && ridMatch) {
      const relsFile = zip.file('xl/_rels/workbook.xml.rels')
      if (!relsFile) return null
      const relsXml = await relsFile.async('string')
      const relRe = new RegExp(`<Relationship[^>]*Id="${ridMatch[1]}"[^>]*Target="([^"]+)"`)
      const rm = relRe.exec(relsXml)
      if (!rm) return null
      const target = rm[1].startsWith('/') ? rm[1].slice(1) : `xl/${rm[1]}`
      return { sheetPath: target }
    }
  }
  return null
}

function findNextRid(relsXml: string): string {
  const existing = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
  const next = existing.length === 0 ? 1 : Math.max(...existing) + 1
  return `rId${next}`
}

async function injectNativeCharts(
  zip: JSZip,
  sheetName: string,
  chartXmls: string[],
  anchors: Omit<ChartAnchor, 'rId'>[],
): Promise<void> {
  if (chartXmls.length === 0) return

  const location = await findSheetPath(zip, sheetName)
  if (!location) throw new Error(`Could not locate "${sheetName}" sheet`)
  const { sheetPath } = location

  chartXmls.forEach((xml, i) => zip.file(`xl/charts/chart${i + 1}.xml`, xml))

  const anchorsWithRids: ChartAnchor[] = anchors.map((a, i) => ({ ...a, rId: `rId${i + 1}` }))
  zip.file('xl/drawings/drawing1.xml', buildDrawingXml(anchorsWithRids))
  zip.file('xl/drawings/_rels/drawing1.xml.rels', buildDrawingRelsXml(anchorsWithRids))

  const dir = sheetPath.substring(0, sheetPath.lastIndexOf('/'))
  const fname = sheetPath.substring(sheetPath.lastIndexOf('/') + 1)
  const actualRelsPath = `${dir}/_rels/${fname}.rels`

  const existingRelsFile = zip.file(actualRelsPath)
  let sheetRelsXml: string
  let drawingRid: string
  if (existingRelsFile) {
    const existing = await existingRelsFile.async('string')
    drawingRid = findNextRid(existing)
    sheetRelsXml = existing.replace(
      /<\/Relationships>\s*$/,
      `<Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    )
  } else {
    drawingRid = 'rId1'
    sheetRelsXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="${drawingRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`
  }
  zip.file(actualRelsPath, sheetRelsXml)

  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new Error(`Missing worksheet XML at ${sheetPath}`)
  let sheetXml = await sheetFile.async('string')
  if (/<drawing\s/.test(sheetXml)) {
    sheetXml = sheetXml.replace(/<drawing\s+r:id="[^"]+"\s*\/>/, `<drawing r:id="${drawingRid}"/>`)
  } else {
    sheetXml = sheetXml.replace(/<\/worksheet>\s*$/, `<drawing r:id="${drawingRid}"/></worksheet>`)
  }
  zip.file(sheetPath, sheetXml)

  const ctFile = zip.file('[Content_Types].xml')
  if (!ctFile) throw new Error('Missing [Content_Types].xml')
  let ctXml = await ctFile.async('string')
  const ensureOverride = (partName: string, contentType: string) => {
    if (ctXml.includes(`PartName="${partName}"`)) return
    ctXml = ctXml.replace(
      /<\/Types>\s*$/,
      `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
    )
  }
  ensureOverride('/xl/drawings/drawing1.xml', 'application/vnd.openxmlformats-officedocument.drawing+xml')
  chartXmls.forEach((_x, i) => {
    ensureOverride(
      `/xl/charts/chart${i + 1}.xml`,
      'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
    )
  })
  zip.file('[Content_Types].xml', ctXml)
}

// ---------------------------------------------------------------------------
// Build chart data for one chart (matches the in-app buildSeries pipeline)
// ---------------------------------------------------------------------------

interface ChartDataBundle {
  /** Rows picked from the input (after window + downsampling). */
  chartRows: SystemLogRow[]
  /** Epoch-ms timestamps, one per chartRow. */
  timestamps: number[]
  /** key → array of values for chartRows (nulls for non-numeric). */
  valuesByKey: Record<string, (number | null)[]>
}

function buildChartData(
  rows: SystemLogRow[],
  keys: string[],
  window: ChartWindow | undefined,
): ChartDataBundle {
  // Resolve window (clamp to actual range); default = full range.
  const rowMax = rows.length - 1
  const startIdx = Math.max(0, Math.min(rowMax, window?.start ?? 0))
  const endIdx = Math.max(startIdx, Math.min(rowMax, window?.end ?? rowMax))
  const sliced = rows.slice(startIdx, endIdx + 1)

  // Exact same primitive as the in-app chart.
  const picked = downsampleIndices(sliced.length, MAX_CHART_POINTS)
  const chartRows = picked.map((i) => sliced[i])
  const timestamps = chartRows.map((r) =>
    Number.isFinite(r.log_time_ms) ? r.log_time_ms : NaN,
  )
  const valuesByKey: Record<string, (number | null)[]> = {}
  for (const k of keys) {
    valuesByKey[k] = chartRows.map((r) => {
      const v = r[k]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    })
  }
  return { chartRows, timestamps, valuesByKey }
}

/**
 * Write a hidden data sheet: col A = log_time (formatted string, one per row),
 * col B+ = series values. We store the timestamp as a TEXT label (not a Date)
 * because the chart uses a category axis — if this column held Date serials,
 * Excel would resolve `<c:strRef>` to those numbers and render them raw
 * ("46119") on the axis.
 */
function writeChartDataSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  seriesKeys: string[],
  bundle: ChartDataBundle,
): void {
  const ws = wb.addWorksheet(sheetName, { state: 'hidden' })
  ws.columns = [
    { header: 'log_time', key: 'log_time', width: 22 },
    ...seriesKeys.map((k) => ({ header: k, key: k, width: 16 })),
  ]
  for (let i = 0; i < bundle.chartRows.length; i++) {
    const t = bundle.timestamps[i]
    const label = Number.isFinite(t) ? formatLogTime(t) : ''
    const rowVals: (number | string)[] = [label]
    for (const k of seriesKeys) {
      const v = bundle.valuesByKey[k][i]
      rowVals.push(v !== null && Number.isFinite(v) ? v : '')
    }
    ws.addRow(rowVals)
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function exportSystemLogXlsx(opts: ExportOptions): Promise<void> {
  const { fileName, headers, rows } = opts
  if (rows.length === 0) throw new Error('No data to export')

  const logTimeHeader = headers.find((h) => h.toLowerCase() === 'log_time')
  const timeHeader = headers.find((h) => h.toLowerCase() === 'time')
  const logTimeColIdx = logTimeHeader ? headers.indexOf(logTimeHeader) + 1 : -1
  const timeColIdx = timeHeader ? headers.indexOf(timeHeader) + 1 : -1

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Zeus RFID Emulator — Log Analyzer'
  wb.created = new Date()

  // ---------------- Data sheet (full data, every row) -------------------
  const dataSheet = wb.addWorksheet('Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  dataSheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.max(12, Math.min(28, h.length + 6)),
  }))
  dataSheet.getRow(1).font = { bold: true, color: { argb: 'FF1E293B' } }
  dataSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  }

  for (const row of rows) {
    const values = headers.map((h) => {
      if (h === logTimeHeader && Number.isFinite(row.log_time_ms)) {
        return new Date(row.log_time_ms)
      }
      const v = row[h]
      return typeof v === 'number' && Number.isFinite(v) ? v : (v ?? '')
    })
    dataSheet.addRow(values)
  }

  if (logTimeColIdx > 0) {
    const col = dataSheet.getColumn(logTimeColIdx)
    col.numFmt = 'm/d/yyyy h:mm:ss'
    col.width = 22
  }
  if (timeColIdx > 0) {
    const col = dataSheet.getColumn(timeColIdx)
    col.numFmt = '0'
    col.width = 14
  }

  dataSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  }

  // ---------------- Per-chart hidden data sheets ------------------------
  const cpuKeys = opts.cpuSeriesKeys.filter((k) => headers.indexOf(k) >= 0)
  const memKeys = opts.memSeriesKeys.filter((k) => headers.indexOf(k) >= 0)

  const cpuBundle = cpuKeys.length > 0 ? buildChartData(rows, cpuKeys, opts.cpuWindow) : null
  const memBundle = memKeys.length > 0 ? buildChartData(rows, memKeys, opts.memWindow) : null

  if (cpuBundle) writeChartDataSheet(wb, 'CPUChartData', cpuKeys, cpuBundle)
  if (memBundle) writeChartDataSheet(wb, 'MemChartData', memKeys, memBundle)

  // ---------------- Charts sheet (title; charts injected later) --------
  const chartsSheet = wb.addWorksheet('Charts', {
    views: [{ showGridLines: false }],
  })
  chartsSheet.getCell('B2').value = 'System Log — Graphs'
  chartsSheet.getCell('B2').font = { size: 16, bold: true, color: { argb: 'FF0F172A' } }
  const cpuCount = cpuBundle?.chartRows.length ?? 0
  const memCount = memBundle?.chartRows.length ?? 0
  chartsSheet.getCell('B3').value =
    `Source: ${fileName}  \u00b7  ${rows.length.toLocaleString()} rows` +
    `  \u00b7  CPU samples: ${cpuCount.toLocaleString()}` +
    `  \u00b7  Memory samples: ${memCount.toLocaleString()}`
  chartsSheet.getCell('B3').font = { size: 10, color: { argb: 'FF64748B' } }
  chartsSheet.getColumn(1).width = 2

  // ---------------- Write, then inject native charts -------------------
  const buffer = await wb.xlsx.writeBuffer()
  const zip = await JSZip.loadAsync(buffer)

  const chartXmls: string[] = []
  const anchors: Omit<ChartAnchor, 'rId'>[] = []

  // CPU chart
  if (cpuBundle) {
    const firstDataRow = 2
    const lastDataRow = cpuBundle.chartRows.length + 1
    const categoryLabels = cpuBundle.timestamps.map((t) =>
      Number.isFinite(t) ? formatLogTime(t) : '',
    )
    const series: ChartSeriesRef[] = cpuKeys.map((k, i) => ({
      key: k,
      valuesCol: i + 2, // log_time is col 1
      color: SERIES_COLORS[k] ?? '#64748b',
      values: cpuBundle.valuesByKey[k],
    }))
    chartXmls.push(
      buildChartXml({
        title: 'CPU — nb_cpus & sys_load_avg',
        dataSheet: 'CPUChartData',
        categoryCol: 1,
        firstDataRow,
        lastDataRow,
        series,
        categoryLabels,
        valNumFmt: 'General',
        axisIdBase: 100,
      }),
    )
    anchors.push({
      fromCol: 1,
      fromRow: 4,
      toCol: 18,
      toRow: 30,
      chartIndex: chartXmls.length,
    })
  }

  // Memory chart
  if (memBundle) {
    const firstDataRow = 2
    const lastDataRow = memBundle.chartRows.length + 1
    const categoryLabels = memBundle.timestamps.map((t) =>
      Number.isFinite(t) ? formatLogTime(t) : '',
    )
    const series: ChartSeriesRef[] = memKeys.map((k, i) => ({
      key: k,
      valuesCol: i + 2,
      color: SERIES_COLORS[k] ?? '#64748b',
      values: memBundle.valuesByKey[k],
    }))
    chartXmls.push(
      buildChartXml({
        title: 'Memory — physical & JVM',
        dataSheet: 'MemChartData',
        categoryCol: 1,
        firstDataRow,
        lastDataRow,
        series,
        categoryLabels,
        valNumFmt: '#,##0',
        axisIdBase: 200,
      }),
    )
    anchors.push({
      fromCol: 1,
      fromRow: 32,
      toCol: 18,
      toRow: 58,
      chartIndex: chartXmls.length,
    })
  }

  if (chartXmls.length > 0) {
    await injectNativeCharts(zip, 'Charts', chartXmls, anchors)
  }

  // ---------------- Save ------------------------------------------------
  const finalBytes = await zip.generateAsync({ type: 'uint8array' })
  const finalBlob = new Blob(
    [finalBytes.buffer.slice(finalBytes.byteOffset, finalBytes.byteOffset + finalBytes.byteLength) as ArrayBuffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  )
  const url = URL.createObjectURL(finalBlob)
  const a = document.createElement('a')
  a.href = url
  const base = fileName.replace(/\.(csv|xlsx)$/i, '')
  a.download = `${base}_cleaned.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
