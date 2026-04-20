/**
 * Smoke test: invoke the XLSX exporter from Node so we can verify the resulting
 * .xlsx is well-formed before shipping to Excel.
 *
 * Strategy: stub enough of the browser environment (document, Blob, URL,
 * atob/btoa) that the exporter — which uses ExcelJS + JSZip + DOM download —
 * can run in Node. Skip the actual "download" step and just inspect the bytes.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// --- tsx-style dynamic transpile of the TS source ---
// We take the simpler approach: compile once with tsc to a temp dir, then import.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

// --- Minimal browser shims ---
const downloads = []

global.document = {
  createElement(tag) {
    if (tag === 'a') {
      return {
        href: '',
        download: '',
        click() {
          downloads.push({ href: this.href, download: this.download })
        },
      }
    }
    if (tag === 'canvas') {
      return { width: 0, height: 0, getContext: () => null, toBlob: () => null }
    }
    return {}
  },
  body: {
    appendChild() {},
    removeChild() {},
  },
}

global.Blob = class Blob {
  constructor(parts, opts) {
    this.parts = parts
    this.type = opts?.type ?? ''
    this._bytes = (() => {
      const buffers = parts.map((p) => {
        if (p instanceof Uint8Array) return Buffer.from(p.buffer, p.byteOffset, p.byteLength)
        if (p instanceof ArrayBuffer) return Buffer.from(p)
        if (Buffer.isBuffer(p)) return p
        if (typeof p === 'string') return Buffer.from(p, 'utf8')
        return Buffer.from(String(p), 'utf8')
      })
      return Buffer.concat(buffers)
    })()
  }
  arrayBuffer() {
    return Promise.resolve(this._bytes.buffer.slice(this._bytes.byteOffset, this._bytes.byteOffset + this._bytes.byteLength))
  }
}

const urls = new Map()
let urlCounter = 0
global.URL = {
  createObjectURL(blob) {
    const id = `blob:node/${++urlCounter}`
    urls.set(id, blob)
    return id
  },
  // Don't actually evict the map so we can still inspect the produced blob
  // after exportSystemLogXlsx revokes its URL.
  revokeObjectURL() {},
}

// --- Compile system-log-export.ts → JS ---
// Use the TS compiler API via a simple tsc invocation to a temp dir.

import { execSync } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

void tmpdir

const projectRoot = path.resolve(__dirname, '..')
// Compile inside the project so node can resolve node_modules (exceljs/jszip).
const tmp = mkdtempSync(path.join(projectRoot, '.test-export-'))
const srcRoot = path.join(projectRoot, 'src', 'lib')

// Compile just the two files we need, plus their single internal dependency.
const files = [
  path.join(srcRoot, 'system-log.ts'),
  path.join(srcRoot, 'system-log-export.ts'),
]

execSync(
  `npx tsc --target ES2020 --module CommonJS --moduleResolution Node ` +
    `--esModuleInterop --skipLibCheck --outDir "${tmp}" --rootDir "${srcRoot}" ${files.map((f) => `"${f}"`).join(' ')}`,
  { stdio: 'inherit', cwd: projectRoot },
)

// The enclosing project has "type": "module"; mark compiled output as CJS.
writeFileSync(path.join(tmp, 'package.json'), '{"type":"commonjs"}')

const exportMod = require(path.join(tmp, 'system-log-export.js'))

// --- Build a synthetic dataset ---
const N = 500
const startMs = Date.parse('2026-04-19T10:00:00Z')
const rows = Array.from({ length: N }, (_, i) => {
  const ms = startMs + i * 60_000
  const d = new Date(ms)
  return {
    log_time: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
    log_time_ms: ms,
    time: i,
    nb_cpus: 8,
    sys_load_avg: Math.abs(Math.sin(i / 25)) * 5,
    free_phys_mem: 1_000_000_000 + Math.sin(i / 10) * 50_000_000,
    used_phys_mem: 2_000_000_000 + Math.cos(i / 15) * 80_000_000,
    total_phys_mem: 3_000_000_000,
    free_mem: 500_000_000,
    used_mem: 250_000_000 + Math.sin(i / 8) * 20_000_000,
    min_mem_reached: 240_000_000,
    max_mem_reached: 260_000_000,
    total_mem: 700_000_000,
    max_mem: 800_000_000,
  }
})

const headers = [
  'log_time', 'time', 'nb_cpus', 'sys_load_avg',
  'free_phys_mem', 'used_phys_mem', 'total_phys_mem',
  'free_mem', 'used_mem', 'min_mem_reached', 'max_mem_reached',
  'total_mem', 'max_mem',
]

await exportMod.exportSystemLogXlsx({
  fileName: 'synthetic_system_info_all.csv',
  headers,
  rows,
  cpuSeriesKeys: ['nb_cpus', 'sys_load_avg'],
  memSeriesKeys: [
    'free_phys_mem', 'used_phys_mem', 'total_phys_mem',
    'free_mem', 'used_mem', 'min_mem_reached', 'max_mem_reached',
    'total_mem', 'max_mem',
  ],
})

if (downloads.length !== 1) {
  console.error('Expected exactly 1 download, got', downloads.length)
  process.exit(1)
}

const download = downloads[0]
const blob = urls.get(download.href)
if (!blob) {
  console.error('Download URL did not resolve to a blob')
  process.exit(1)
}

const buf = Buffer.from(await blob.arrayBuffer())
const outPath = path.join(projectRoot, 'test-export-output.xlsx')
writeFileSync(outPath, buf)
console.log(`Wrote ${outPath} (${buf.length} bytes)`)

// --- Inspect the zip to verify critical parts exist and parse as XML ---
const JSZipMod = require('jszip')
const zip = await JSZipMod.loadAsync(buf)

const required = [
  '[Content_Types].xml',
  'xl/workbook.xml',
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/sheet2.xml',
  'xl/charts/chart1.xml',
  'xl/charts/chart2.xml',
  'xl/drawings/drawing1.xml',
  'xl/drawings/_rels/drawing1.xml.rels',
]
let missing = 0
for (const p of required) {
  if (!zip.file(p)) {
    console.error('Missing part:', p)
    missing++
  } else {
    console.log('✓', p)
  }
}
if (missing > 0) process.exit(1)

// Verify all chart XML is well-formed via a minimal XML check (balanced tags).
async function checkWellFormed(name) {
  const xml = await zip.file(name).async('string')
  const { DOMParser } = require('@xmldom/xmldom')
  const fatal = []
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === 'fatalError') fatal.push(String(msg))
    },
  })
  parser.parseFromString(xml, 'text/xml')
  if (fatal.length > 0) {
    console.error('Malformed XML in', name, ':', fatal.join('; '))
    return false
  }
  console.log('✓ well-formed:', name)
  return true
}

const partsToValidate = [
  'xl/charts/chart1.xml',
  'xl/charts/chart2.xml',
  'xl/drawings/drawing1.xml',
  'xl/drawings/_rels/drawing1.xml.rels',
  'xl/worksheets/sheet2.xml',
  '[Content_Types].xml',
]

let allOk = true
for (const p of partsToValidate) {
  const ok = await checkWellFormed(p)
  if (!ok) allOk = false
}

if (!allOk) process.exit(1)

// Dump the chart XML so we can eyeball it.
const chart1 = await zip.file('xl/charts/chart1.xml').async('string')
console.log('\n--- chart1.xml (truncated) ---')
console.log(chart1.slice(0, 1200))
console.log('... (length:', chart1.length, ')')

if (!existsSync(outPath)) {
  console.error('Output file missing:', outPath)
  process.exit(1)
}

// Round-trip through ExcelJS to confirm the file is structurally valid.
const ExcelJS = require('exceljs')
const roundTrip = new ExcelJS.Workbook()
await roundTrip.xlsx.readFile(outPath)
const sheetNames = roundTrip.worksheets.map((w) => w.name)
console.log('\nRound-trip sheets:', sheetNames)
if (!sheetNames.includes('Data') || !sheetNames.includes('Charts')) {
  console.error('Expected Data + Charts sheets after round-trip')
  process.exit(1)
}
const dataSheet = roundTrip.getWorksheet('Data')
console.log(`  Data sheet:   ${dataSheet.rowCount} rows × ${dataSheet.columnCount} cols`)

console.log('\nAll checks passed.')

try {
  rmSync(tmp, { recursive: true, force: true })
} catch {
  /* ignore */
}
