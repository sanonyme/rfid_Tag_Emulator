import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Send, Globe, Clock, CheckCircle, XCircle, Loader2, Copy, Check, Save, Braces, ArrowDown, ArrowUp, Table2, FileSpreadsheet, Eye, PlayCircle, Square, Trash2, Download, ChevronDown, ChevronRight, Package, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sectionCard as SECTION_CARD } from '@/lib/ui-tokens'

/** Normalize pipe-table row label for lookup (trim, collapse spaces, lowercase). */
function normalizeTableLabel(label: string): string {
  return label
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Maps first-column labels (as in Excel / markdown exports) to JSON body tokens {{TOKEN}}.
 */
const TABLE_LABEL_TO_TOKEN: Record<string, string> = {
  'device model': 'DEVICE_MODEL',
  'device serial no': 'DEVICE_SERIAL_NUMBER',
  'device serial number': 'DEVICE_SERIAL_NUMBER',
  'device type': 'DEVICE_TYPE',
  'location address': 'LOCATION_ADDRESS',
  'location code': 'LOCATION_COUNTRY_CODE',
  'location country code': 'LOCATION_COUNTRY_CODE',
  'location country': 'LOCATION_COUNTRY_CODE',
  'location latitude': 'LOCATION_LATITUDE',
  'location longitude': 'LOCATION_LONGITUDE',
  'program name': 'PROGRAM_NAME',
  'supplier id': 'SUPPLIER_ID',
  'supplier name': 'SUPPLIER_NAME',
  'qr fullmatch': 'QR_FULL_MATCH',
}

/** Tokens substituted as raw JSON numbers when value looks numeric (for e.g. "latitude":{{LOCATION_LATITUDE}}). */
const NUMERIC_JSON_TOKENS = new Set(['LOCATION_LATITUDE', 'LOCATION_LONGITUDE'])

function parsePipeTable(text: string): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.includes('|')) continue
    const rawCells = trimmed.split('|').map((c) => c.trim())
    const cells = rawCells.filter((c, i) => {
      if (c === '' && (i === 0 || i === rawCells.length - 1)) return false
      return true
    })
    if (cells.length < 2) continue
    if (cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, '')))) continue
    const label = cells[0]
    const value = cells.slice(1).join('|').trim()
    rows.push({ label, value })
  }
  return rows
}

/**
 * Label / value blocks separated by blank lines. One blank (or none) after the label → next line is the value.
 * Two or more blank lines after the label → empty value (next non-empty line is the following label).
 */
function parseAlternatingLabelValueBlock(text: string): Array<{ label: string; value: string }> {
  const rawLines = text.split(/\r?\n/)
  const rows: Array<{ label: string; value: string }> = []
  let i = 0

  const skipEmpty = () => {
    while (i < rawLines.length && rawLines[i].trim() === '') i++
  }

  while (i < rawLines.length) {
    skipEmpty()
    if (i >= rawLines.length) break
    const label = rawLines[i].trim()
    if (!label) {
      i++
      continue
    }
    i++

    let blankRun = 0
    while (i < rawLines.length && rawLines[i].trim() === '') {
      blankRun++
      i++
    }

    if (i >= rawLines.length) {
      rows.push({ label, value: '' })
      break
    }

    if (blankRun >= 2) {
      rows.push({ label, value: '' })
      continue
    }

    const value = rawLines[i].trim()
    rows.push({ label, value })
    i++
  }
  return rows
}

function looksLikePipeTable(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? ''
  if (!first.includes('|')) return false
  return first.split('|').filter((c) => c.trim()).length >= 2
}

function parseSubstitutionTableInput(text: string): Array<{ label: string; value: string }> {
  if (looksLikePipeTable(text)) return parsePipeTable(text)
  return parseAlternatingLabelValueBlock(text)
}

function isProbablyNumericJsonValue(v: string): boolean {
  const t = v.trim()
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)
}

/** Value to inject at {{TOKEN}}: inside JSON strings use escaped fragment; bare numeric tokens use raw number. */
function tokenSubstitutionValue(token: string, value: string): string {
  const trimmed = value.trim()
  if (NUMERIC_JSON_TOKENS.has(token) && isProbablyNumericJsonValue(trimmed)) return trimmed
  return JSON.stringify(value).slice(1, -1)
}

function applySubstitutionTableToBody(
  bodyText: string,
  tableText: string
): {
  nextBody: string
  unknownLabels: string[]
  tokensNotInBody: string[]
  remainingPlaceholders: string[]
} {
  const rows = parseSubstitutionTableInput(tableText)
  let next = bodyText
  const unknownLabels: string[] = []
  const tokensNotInBody: string[] = []

  for (const { label, value } of rows) {
    const norm = normalizeTableLabel(label)
    if (norm === 'key' && normalizeTableLabel(value) === 'value') continue
    const token = TABLE_LABEL_TO_TOKEN[norm]
    if (!token) {
      unknownLabels.push(label)
      continue
    }
    const needle = `{{${token}}}`
    if (!next.includes(needle)) {
      tokensNotInBody.push(token)
      continue
    }
    const sub = tokenSubstitutionValue(token, value)
    next = next.split(needle).join(sub)
  }

  const rem = next.match(/\{\{[A-Z0-9_]+\}\}/g)
  const remainingPlaceholders = rem ? [...new Set(rem)] : []
  return { nextBody: next, unknownLabels, tokensNotInBody, remainingPlaceholders }
}

/** Parse a CSV/TSV line with support for quoted fields and escaped double-quotes (""). */
function parseDelimitedLine(line: string, delim: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delim) {
        cells.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  cells.push(cur)
  return cells
}

export interface BulkDecodedRow {
  rowIndex: number
  id: string
  bodyBase64: string
  retryCount?: string
  ignoreFlag?: string
  /** Current (possibly edited / substituted) payload sent when Send is clicked. */
  decoded: string
  /** Pristine decoded-from-base64 payload, used for the Reset action. */
  originalDecoded: string
  decodeError?: string
  status: 'idle' | 'sending' | 'success' | 'error' | 'skipped'
  responseStatus?: number
  responseStatusText?: string
  errorMessage?: string
  durationMs?: number
}

/** Decode a base64 (standard or URL-safe) string to UTF-8 text. */
function decodeBase64ToUtf8(b64: string): string {
  let cleaned = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
  // Pad to multiple of 4
  const pad = cleaned.length % 4
  if (pad === 2) cleaned += '=='
  else if (pad === 3) cleaned += '='
  else if (pad === 1) throw new Error('Invalid base64 length')
  const raw = atob(cleaned)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Pretty-print JSON if decoded text parses as JSON; otherwise return raw decoded text. */
function maybePrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Return parsed JSON or the original string if parsing fails. */
function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * The canonical set of fields we expect on a single, fully-populated `boxQrs` entry.
 * Used to report what's still missing after a merge (so the user knows the upstream
 * payload was truncated, not just split).
 */
const BOXQRS_EXPECTED_FIELDS = [
  'qrCodeVersion',
  'cartonBoxType',
  'brandAndSection',
  'productType',
  'model',
  'quality',
  'color',
  'size',
  'season',
  'units',
  'batchQuantity',
  'unitsPerBatch',
  'orderSupplierId',
  'orderCode',
  'orderDestinationCd',
  'cartonBoxNumber',
  'batch',
  'totalCartonBoxes',
  'cartonBoxId',
  'packingId',
  'sdkSizeId',
] as const

export interface BoxQrsCheckResult {
  /** `true` when the payload is parseable and has a `boxQrs` we could inspect. */
  ok: boolean
  /** `true` when a structural issue was detected and `fixed` contains a rewritten payload. */
  needsFix: boolean
  /** Human-readable summary shown in the UI. */
  message: string
  /** Rewritten JSON when `needsFix` is true, otherwise `undefined`. */
  fixed?: string
  /** Fields from BOXQRS_EXPECTED_FIELDS that are still missing after merging. */
  missingFields: string[]
}

/**
 * Inspect the `boxQrs` array in a decoded payload:
 *   - If there are multiple objects (upstream split `},{` bug), merge them into one.
 *   - Report any expected fields that are still missing after the merge.
 *
 * The input must be a JSON object string; arrays / primitives / invalid JSON are
 * returned as `ok:false` with an explanatory message.
 */
function checkAndFixBoxQrs(text: string): BoxQrsCheckResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e: any) {
    return {
      ok: false,
      needsFix: false,
      message: `Not valid JSON: ${e?.message || 'parse error'}`,
      missingFields: [],
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      needsFix: false,
      message: 'Payload root is not a JSON object.',
      missingFields: [],
    }
  }
  const root = parsed as Record<string, unknown>
  if (!('boxQrs' in root)) {
    return {
      ok: false,
      needsFix: false,
      message: 'Payload has no `boxQrs` field.',
      missingFields: [],
    }
  }
  const boxQrs = root.boxQrs
  if (!Array.isArray(boxQrs)) {
    return {
      ok: false,
      needsFix: false,
      message: '`boxQrs` is not an array.',
      missingFields: [],
    }
  }
  if (boxQrs.length === 0) {
    return {
      ok: false,
      needsFix: false,
      message: '`boxQrs` array is empty.',
      missingFields: [...BOXQRS_EXPECTED_FIELDS],
    }
  }

  const merged: Record<string, unknown> = {}
  let contributed = 0
  for (const entry of boxQrs) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(merged, entry as Record<string, unknown>)
      contributed++
    }
  }
  const missing = BOXQRS_EXPECTED_FIELDS.filter((k) => !(k in merged))

  if (boxQrs.length === 1) {
    return {
      ok: true,
      needsFix: false,
      message: missing.length
        ? `boxQrs OK (1 entry). Missing fields: ${missing.join(', ')}.`
        : 'boxQrs OK (1 entry, all expected fields present).',
      missingFields: missing,
    }
  }

  root.boxQrs = [merged]
  const fixed = JSON.stringify(root, null, 2)
  const summary = `Merged ${contributed} boxQrs entr${contributed === 1 ? 'y' : 'ies'} into 1.`
  return {
    ok: true,
    needsFix: true,
    message: missing.length
      ? `${summary} Still missing: ${missing.join(', ')}.`
      : `${summary} All expected fields present.`,
    fixed,
    missingFields: missing,
  }
}

/**
 * Parse a TSV/CSV dump with header row containing at least `id` and `body` columns.
 * The `body` column is expected to be base64-encoded JSON.
 */
function parseBulkCsv(text: string): BulkDecodedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []

  const firstTab = (lines[0].match(/\t/g) ?? []).length
  const firstComma = (lines[0].match(/,/g) ?? []).length
  const delim = firstTab >= firstComma && firstTab > 0 ? '\t' : ','

  const header = parseDelimitedLine(lines[0], delim).map((c) => c.trim().toLowerCase())
  const idIdx = header.findIndex((h) => h === 'id')
  const bodyIdx = header.findIndex((h) => h === 'body')
  const retryIdx = header.findIndex((h) => h === 'retry_count' || h === 'retrycount')
  const ignoreIdx = header.findIndex((h) => h === 'ignore_flag' || h === 'ignoreflag')

  const hasHeader = idIdx >= 0 && bodyIdx >= 0
  const startLine = hasHeader ? 1 : 0
  const aIdIdx = hasHeader ? idIdx : 0
  const aBodyIdx = hasHeader ? bodyIdx : 1
  const aRetryIdx = hasHeader ? retryIdx : 2
  const aIgnoreIdx = hasHeader ? ignoreIdx : 3

  const rows: BulkDecodedRow[] = []
  for (let i = startLine; i < lines.length; i++) {
    const cells = parseDelimitedLine(lines[i], delim)
    if (cells.length < 2) continue
    const id = (cells[aIdIdx] ?? '').trim()
    const bodyB64 = (cells[aBodyIdx] ?? '').trim()
    if (!bodyB64) continue

    let decoded = ''
    let decodeError: string | undefined
    try {
      decoded = maybePrettyJson(decodeBase64ToUtf8(bodyB64))
    } catch (e: any) {
      decodeError = e?.message || 'Failed to decode'
    }

    rows.push({
      rowIndex: rows.length,
      id,
      bodyBase64: bodyB64,
      retryCount: aRetryIdx >= 0 ? cells[aRetryIdx]?.trim() : undefined,
      ignoreFlag: aIgnoreIdx >= 0 ? cells[aIgnoreIdx]?.trim() : undefined,
      decoded,
      originalDecoded: decoded,
      decodeError,
      status: 'idle',
    })
  }
  return rows
}

function JsonHighlight({ json }: { json: string }) {
  if (!json) return null
  const parts = json.split(/("(?:[^"\\]|\\.)*")\s*(:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part === undefined || part === '') return null
        if (part === ':') return <span key={i}>:</span>
        if (/^".*"$/.test(part)) {
          const prev = parts.slice(0, i + 1)
          const isKey = prev[i + 1] === ':'
          return <span key={i} className={isKey ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}>{part}</span>
        }
        if (part === 'true' || part === 'false') return <span key={i} className="text-amber-600 dark:text-amber-400">{part}</span>
        if (part === 'null') return <span key={i} className="text-red-500">{part}</span>
        if (/^-?\d/.test(part)) return <span key={i} className="text-blue-600 dark:text-blue-400">{part}</span>
        return <span key={i} className="text-muted-foreground">{part}</span>
      })}
    </>
  )
}

const DEFAULT_URL = 'https://api.product.inditex.com/icdmrfidre/api/v1/rfid/box-readings'
//const DEFAULT_BODY = '{\n  "ou i i a i": "67 67 67 67"\n}'

interface ApiTabProps {
  base64Open?: boolean
  onBase64OpenChange?: (open: boolean) => void
}

export function ApiTab({ base64Open, onBase64OpenChange }: ApiTabProps = {}) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [body, setBody] = useState('')
  const [method] = useState<'POST'>('POST')
  const [headerName, setHeaderName] = useState('itx-apiKey')
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [substitutionTable, setSubstitutionTable] = useState('')
  const [substitutionMessage, setSubstitutionMessage] = useState<string | null>(null)

  // Base64 Decoder state (like base64decode.org)
  const [base64Input, setBase64Input] = useState('')
  const [base64Output, setBase64Output] = useState('')
  const [base64Error, setBase64Error] = useState<string | null>(null)
  const [base64Mode, setBase64Mode] = useState<'decode' | 'encode'>('decode')

  // Bulk CSV/TSV decoder state
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkRows, setBulkRows] = useState<BulkDecodedRow[]>([])
  const [bulkExpanded, setBulkExpanded] = useState<Record<number, boolean>>({})
  const [bulkCopiedIdx, setBulkCopiedIdx] = useState<number | null>(null)
  const [bulkSendingAll, setBulkSendingAll] = useState(false)
  const [bulkParseError, setBulkParseError] = useState<string | null>(null)
  const [bulkDelayMs, setBulkDelayMs] = useState(250)
  const bulkStopRef = useRef(false)

  useEffect(() => {
    window.electronAPI?.getApiConfig?.().then((config) => {
      if (config) {
        setHeaderName(config.headerName || 'itx-apiKey')
        setApiKey(config.key || '')
      }
    })
  }, [])
  const [response, setResponse] = useState<{
    ok: boolean
    status: number
    statusText: string
    data: string | null
    headers?: Record<string, string>
    durationMs?: number
    error?: string
  } | null>(null)

  const handleSend = async () => {
    if (!window.electronAPI?.itxApiRequest) {
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Error',
        data: null,
        error: 'Electron API not available',
      })
      return
    }

    setSending(true)
    setResponse(null)
    const start = performance.now()

    try {
      const res = await window.electronAPI.itxApiRequest(url, body)
      const durationMs = Math.round(performance.now() - start)
      setResponse({
        ...res,
        durationMs,
      })
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start)
      setResponse({
        ok: false,
        status: 0,
        statusText: 'Error',
        data: null,
        durationMs,
        error: err?.message || String(err),
      })
    } finally {
      setSending(false)
    }
  }

  const getResponseText = () => {
    if (!response) return ''
    if (response.error) return response.error
    return formatResponseBody(response.data)
  }

  const handlePrettifyBody = () => {
    try {
      const parsed = JSON.parse(body)
      setBody(JSON.stringify(parsed, null, 2))
    } catch {
      // Invalid JSON - leave as is or could show a toast
    }
  }

  const handleApplySubstitutionTable = () => {
    if (!substitutionTable.trim()) {
      setSubstitutionMessage('Paste a substitution table (pipe rows or label / value blocks) first.')
      return
    }
    const { nextBody, unknownLabels, tokensNotInBody, remainingPlaceholders } =
      applySubstitutionTableToBody(body, substitutionTable)
    setBody(nextBody)
    const parts: string[] = []
    if (unknownLabels.length) {
      parts.push(`Unrecognized labels (skipped): ${unknownLabels.join(', ')}.`)
    }
    if (tokensNotInBody.length) {
      const uniq = [...new Set(tokensNotInBody)]
      parts.push(`No matching placeholder in body: ${uniq.map((t) => `{{${t}}}`).join(', ')}.`)
    }
    if (remainingPlaceholders.length) {
      parts.push(`Still in JSON: ${remainingPlaceholders.join(', ')}.`)
    }
    if (!parts.length) {
      setSubstitutionMessage('Placeholders updated from table.')
    } else {
      setSubstitutionMessage(parts.join(' '))
    }
  }

  const handleSaveConfig = async () => {
    await window.electronAPI?.saveApiConfig?.(headerName, apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleCopyResponse = async () => {
    const text = getResponseText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatResponseBody = (data: string | null) => {
    if (!data) return ''
    try {
      const parsed = JSON.parse(data)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return data
    }
  }

  const handleBase64Convert = () => {
    setBase64Error(null)
    setBase64Output('')
    const input = base64Input.trim()
    if (!input) return

    try {
      if (base64Mode === 'decode') {
        // Decode Base64 to UTF-8 text (like base64decode.org)
        const decoded = atob(input.replace(/\s/g, ''))
        const bytes = new Uint8Array(decoded.length)
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i)
        }
        setBase64Output(new TextDecoder('utf-8').decode(bytes))
      } else {
        // Encode UTF-8 text to Base64
        const encoded = btoa(
          String.fromCharCode(...new TextEncoder().encode(input))
        )
        setBase64Output(encoded)
      }
    } catch (e) {
      setBase64Error(
        base64Mode === 'decode'
          ? 'Invalid Base64 string. Ensure it contains only valid Base64 characters (A-Za-z0-9+/=).'
          : 'Encoding failed.'
      )
    }
  }

  const handleBulkParse = () => {
    setBulkParseError(null)
    setBulkCopiedIdx(null)
    setBulkExpanded({})
    const trimmed = bulkInput.trim()
    if (!trimmed) {
      setBulkRows([])
      setBulkParseError('Paste CSV/TSV data first.')
      return
    }
    try {
      const rows = parseBulkCsv(trimmed)
      if (rows.length === 0) {
        setBulkParseError('No rows found. Make sure the data has a header with at least `id` and `body` columns.')
        setBulkRows([])
        return
      }
      const decodeFailures = rows.filter((r) => r.decodeError).length
      setBulkRows(rows)
      if (decodeFailures > 0) {
        setBulkParseError(
          `Parsed ${rows.length} row${rows.length === 1 ? '' : 's'} (${decodeFailures} with decode error${decodeFailures === 1 ? '' : 's'}).`,
        )
      }
    } catch (e: any) {
      setBulkParseError(e?.message || 'Failed to parse input.')
      setBulkRows([])
    }
  }

  const handleBulkClear = () => {
    setBulkInput('')
    setBulkRows([])
    setBulkExpanded({})
    setBulkParseError(null)
    setBulkCopiedIdx(null)
  }

  const handleBulkCopyRow = async (idx: number) => {
    const row = bulkRows[idx]
    if (!row) return
    const text = row.decodeError ? row.bodyBase64 : row.decoded
    try {
      await navigator.clipboard.writeText(text)
      setBulkCopiedIdx(idx)
      setTimeout(() => setBulkCopiedIdx((v) => (v === idx ? null : v)), 1500)
    } catch {
      // ignore
    }
  }

  const handleBulkLoadIntoBody = (idx: number) => {
    const row = bulkRows[idx]
    if (!row || row.decodeError) return
    setBody(row.decoded)
  }

  const handleBulkEditRow = (idx: number, next: string) => {
    setBulkRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, decoded: next, status: 'idle' } : r)),
    )
  }

  const handleBulkResetRow = (idx: number) => {
    setBulkRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, decoded: r.originalDecoded, status: 'idle' } : r)),
    )
  }

  const handleBulkPrettifyRow = (idx: number) => {
    setBulkRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, decoded: maybePrettyJson(r.decoded) } : r)),
    )
  }

  /** Inspect a single row's `boxQrs`; merge any multi-object split and report the result. */
  const handleBulkCheckBoxQrsRow = (idx: number) => {
    const row = bulkRows[idx]
    if (!row || row.decodeError) return
    const result = checkAndFixBoxQrs(row.decoded)
    if (result.needsFix && result.fixed) {
      setBulkRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, decoded: result.fixed!, status: 'idle' } : r)),
      )
    }
    setBulkParseError(`Row ${row.id || `#${idx + 1}`}: ${result.message}`)
  }

  /**
   * Scan every row's `boxQrs` and fix any that have a multi-object split.
   * Aggregates counts so you can see at a glance how many were bad, how many were
   * already OK, and how many have missing expected fields.
   */
  const handleBulkCheckBoxQrsAll = () => {
    if (bulkRows.length === 0) return
    let fixed = 0
    let alreadyOk = 0
    let noBoxQrs = 0
    let invalid = 0
    const rowsMissingFields: string[] = []

    const updated = bulkRows.map((r) => {
      if (r.decodeError) {
        invalid++
        return r
      }
      const res = checkAndFixBoxQrs(r.decoded)
      if (!res.ok) {
        // "no boxQrs" / "empty array" / "not an object" all land here.
        if (res.message.includes('`boxQrs`')) noBoxQrs++
        else invalid++
        return r
      }
      if (res.missingFields.length > 0) {
        rowsMissingFields.push(r.id || `#${r.rowIndex + 1}`)
      }
      if (res.needsFix && res.fixed) {
        fixed++
        return { ...r, decoded: res.fixed, status: 'idle' as const }
      }
      alreadyOk++
      return r
    })
    setBulkRows(updated)

    const parts: string[] = []
    parts.push(`Fixed ${fixed}/${bulkRows.length} row(s).`)
    if (alreadyOk) parts.push(`${alreadyOk} already OK.`)
    if (noBoxQrs) parts.push(`${noBoxQrs} without boxQrs.`)
    if (invalid) parts.push(`${invalid} invalid/decode-error.`)
    if (rowsMissingFields.length) {
      parts.push(
        `Rows with missing expected fields: ${rowsMissingFields.slice(0, 5).join(', ')}${
          rowsMissingFields.length > 5 ? `, +${rowsMissingFields.length - 5} more` : ''
        }.`,
      )
    }
    setBulkParseError(parts.join(' '))
  }

  /** Apply the placeholder substitution table to a single row's payload. */
  const handleBulkApplyTableRow = (idx: number) => {
    if (!substitutionTable.trim()) {
      setBulkParseError('Paste a placeholder table at the top first, then Apply.')
      return
    }
    const row = bulkRows[idx]
    if (!row || row.decodeError) return
    const { nextBody } = applySubstitutionTableToBody(row.decoded, substitutionTable)
    setBulkRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, decoded: nextBody, status: 'idle' } : r)),
    )
    setBulkParseError(null)
  }

  /**
   * Apply the placeholder substitution table to every bulk row. Aggregates the
   * unknown labels / tokens-not-found / remaining {{...}} placeholders across all
   * rows and surfaces a single summary message at the bottom of the toolbar.
   */
  const handleBulkApplyTableAll = () => {
    if (!substitutionTable.trim()) {
      setBulkParseError('Paste a placeholder table at the top first, then Apply.')
      return
    }
    if (bulkRows.length === 0) return

    let applied = 0
    const unknownLabels = new Set<string>()
    const tokensNotInAny = new Map<string, number>() // token → # rows where it was missing
    const remaining = new Set<string>()

    const updated = bulkRows.map((r) => {
      if (r.decodeError) return r
      const res = applySubstitutionTableToBody(r.decoded, substitutionTable)
      res.unknownLabels.forEach((l) => unknownLabels.add(l))
      res.tokensNotInBody.forEach((t) =>
        tokensNotInAny.set(t, (tokensNotInAny.get(t) ?? 0) + 1),
      )
      res.remainingPlaceholders.forEach((p) => remaining.add(p))
      if (res.nextBody !== r.decoded) applied++
      return { ...r, decoded: res.nextBody, status: 'idle' as const }
    })
    setBulkRows(updated)

    const parts: string[] = [`Applied to ${applied}/${bulkRows.length} row(s).`]
    if (unknownLabels.size) {
      parts.push(`Unrecognized: ${[...unknownLabels].join(', ')}.`)
    }
    // A token "not in body" only matters if it's missing from EVERY applicable row.
    const applicable = bulkRows.filter((r) => !r.decodeError).length
    const globallyMissing = [...tokensNotInAny.entries()]
      .filter(([, count]) => count === applicable && applicable > 0)
      .map(([t]) => `{{${t}}}`)
    if (globallyMissing.length) {
      parts.push(`Not present in any row: ${globallyMissing.join(', ')}.`)
    }
    if (remaining.size) {
      parts.push(`Still unresolved: ${[...remaining].join(', ')}.`)
    }
    setBulkParseError(parts.join(' '))
  }

  const handleBulkExportJson = async () => {
    if (!bulkRows.length) return
    const payload = bulkRows.map((r) => ({
      id: r.id,
      retryCount: r.retryCount,
      ignoreFlag: r.ignoreFlag,
      decoded: r.decodeError ? null : safeParseJson(r.decoded),
      decodeError: r.decodeError,
    }))
    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setBulkCopiedIdx(-1)
      setTimeout(() => setBulkCopiedIdx((v) => (v === -1 ? null : v)), 1500)
    } catch {
      // ignore
    }
  }

  const sendOneRow = async (idx: number): Promise<void> => {
    const row = bulkRows[idx]
    if (!row || row.decodeError) return
    if (!window.electronAPI?.itxApiRequest) {
      setBulkRows((prev) =>
        prev.map((r, i) =>
          i === idx ? { ...r, status: 'error', errorMessage: 'Electron API not available' } : r,
        ),
      )
      return
    }
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, status: 'sending' } : r)))
    const start = performance.now()
    try {
      const res = await window.electronAPI.itxApiRequest(url, row.decoded)
      const durationMs = Math.round(performance.now() - start)
      setBulkRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                status: res.ok ? 'success' : 'error',
                responseStatus: res.status,
                responseStatusText: res.statusText,
                errorMessage: res.ok ? undefined : res.data || res.statusText || undefined,
                durationMs,
              }
            : r,
        ),
      )
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start)
      setBulkRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                status: 'error',
                errorMessage: err?.message || String(err),
                durationMs,
              }
            : r,
        ),
      )
    }
  }

  const handleBulkSendOne = async (idx: number) => {
    await sendOneRow(idx)
  }

  const handleBulkSendAll = async () => {
    if (bulkSendingAll) {
      bulkStopRef.current = true
      return
    }
    bulkStopRef.current = false
    setBulkSendingAll(true)
    try {
      for (let i = 0; i < bulkRows.length; i++) {
        if (bulkStopRef.current) break
        const r = bulkRows[i]
        if (!r || r.decodeError) continue
        await sendOneRow(i)
        if (bulkDelayMs > 0 && i < bulkRows.length - 1) {
          await new Promise((res) => setTimeout(res, bulkDelayMs))
        }
      }
    } finally {
      setBulkSendingAll(false)
      bulkStopRef.current = false
    }
  }

  const handleBase64Copy = async () => {
    if (!base64Output) return
    try {
      await navigator.clipboard.writeText(base64Output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-full max-w-5xl flex-col gap-4 stagger-children">
      {/* Request Card */}
      <Card className={SECTION_CARD} data-tour="tour-api-request">
        <CardHeader className="space-y-3 pb-3 pt-5 px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Inditex RFID box readings</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  POST JSON through the desktop bridge. Header name and key are saved locally.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-normal">
              POST
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5 pt-0">
          {/* URL + Method row */}
          <div className="flex items-center gap-2">
            <Select value={method} disabled>
              <SelectTrigger className="h-10 w-28 shrink-0 rounded-lg border-border/60 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
            <div className="min-w-0 flex-1">
              <Label htmlFor="api-url" className="sr-only">
                URL
              </Label>
              <Input
                id="api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.product.inditex.com/..."
                disabled={sending}
                className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
              />
            </div>
          </div>

          {/* Auth header config */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="api-header" className="text-sm font-medium">
                Header name
              </Label>
              <Input
                id="api-header"
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                placeholder="itx-apiKey"
                disabled={sending}
                className="h-10 rounded-lg border-border/50 font-mono text-sm shadow-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-sm font-medium">
                API key
              </Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  disabled={sending}
                  className="h-10 flex-1 rounded-lg border-border/50 font-mono text-sm shadow-none"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSaveConfig}
                  disabled={sending}
                  title="Save (persists across restarts)"
                  className="h-10 w-10 shrink-0 rounded-lg border-border/60 bg-muted/20 shadow-none hover:bg-muted/40"
                >
                  {saved ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Substitution table → {{TOKEN}} */}
          <div className="space-y-2 rounded-xl border border-border/40 bg-muted/15 p-3.5 ring-1 ring-border/20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Label htmlFor="api-subst-table" className="flex items-center gap-2 text-sm font-medium">
                  <Table2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Placeholder table
                </Label>
                <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
                  Pipe rows or label/value blocks → replaces <code className="font-mono text-[10px]">{'{{TOKEN}}'}</code> in the body.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleApplySubstitutionTable}
                disabled={sending}
                className="shrink-0 rounded-lg shadow-none"
              >
                <Table2 className="mr-1.5 h-3.5 w-3.5" />
                Apply to body
              </Button>
            </div>
            <Textarea
              id="api-subst-table"
              value={substitutionTable}
              onChange={(e) => {
                setSubstitutionTable(e.target.value)
                setSubstitutionMessage(null)
              }}
              placeholder={
                'Device Model\n\nTT-Buttons\n\nDevice Serial No\n\nU675EU...\n\n— or —\n\n| Device Model | TT-Buttons |'
              }
              disabled={sending}
              className="min-h-[100px] resize-y rounded-lg border-border/50 bg-background/60 font-mono text-sm shadow-none"
            />
            {substitutionMessage && (
              <p className="text-xs leading-relaxed text-muted-foreground">{substitutionMessage}</p>
            )}
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="api-body" className="text-sm font-medium">
                Request body (JSON)
              </Label>
              <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onBase64OpenChange?.(true)}
                  disabled={sending}
                  className="h-8 rounded-md px-2.5 text-xs"
                  title="Base64 Decode / Encode"
                >
                  <Braces className="mr-1 h-3.5 w-3.5" />
                  Base64
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrettifyBody}
                  disabled={sending}
                  className="h-8 rounded-md px-2.5 text-xs"
                >
                  <Braces className="mr-1 h-3.5 w-3.5" />
                  Prettify
                </Button>
              </div>
            </div>
            <Textarea
              id="api-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"test": "test value"}'
              disabled={sending}
              className="min-h-[180px] resize-y rounded-lg border-border/50 bg-muted/10 font-mono text-sm shadow-none"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sending}
            size="lg"
            className="w-full rounded-xl shadow-md shadow-primary/25"
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {sending ? 'Sending…' : 'Send request'}
          </Button>
        </CardContent>
      </Card>

      {/* Response Card */}
      <Card className={cn(SECTION_CARD, 'flex min-h-[200px] flex-1 flex-col')} data-tour="tour-api-response">
        <CardHeader className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </span>
              Response
              {response && (
                <>
                  {response.ok ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <Badge variant={response.ok ? 'default' : 'destructive'} className="font-mono tabular-nums">
                    {response.status} {response.statusText}
                  </Badge>
                  {response.durationMs != null && (
                    <span className="flex items-center gap-1 font-normal text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {response.durationMs}ms
                    </span>
                  )}
                </>
              )}
            </CardTitle>
            {response && (
              <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
                <Button variant="ghost" size="sm" onClick={handleCopyResponse} className="h-8 gap-1.5 rounded-md px-2.5 text-xs">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 bg-muted/10 p-0">
          <ScrollArea className="h-full min-h-[180px]">
            <pre className="whitespace-pre-wrap break-all p-4 font-mono text-xs sm:text-sm">
              {!response ? (
                <span className="italic text-muted-foreground">Send a request to see the response here.</span>
              ) : response.error ? (
                <span className="text-destructive">{response.error}</span>
              ) : (
                <JsonHighlight json={formatResponseBody(response.data)} />
              )}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Bulk CSV / TSV Base64 Decoder */}
      <Card className={SECTION_CARD}>
        <CardHeader
          className="cursor-pointer select-none rounded-t-xl border-b border-border/40 bg-muted/10 px-4 py-3 transition-colors hover:bg-muted/20"
          onClick={() => setBulkOpen((v) => !v)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {bulkOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-semibold tracking-tight">Bulk CSV / TSV decoder</CardTitle>
              {bulkRows.length > 0 && (
                <Badge variant="secondary" className="ml-1 font-normal tabular-nums">
                  {bulkRows.length} row{bulkRows.length === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <CardDescription className="hidden text-right sm:block max-w-[280px] text-xs leading-relaxed">
              Columns <code className="font-mono text-[10px]">id</code> &amp;{' '}
              <code className="font-mono text-[10px]">body</code> (base64 JSON).
            </CardDescription>
          </div>
        </CardHeader>
        {bulkOpen && (
          <CardContent className="space-y-4 px-5 pb-5 pt-0">
            <div className="space-y-2">
              <Label htmlFor="bulk-csv-input" className="text-xs font-medium text-muted-foreground">
                CSV / TSV (quoted fields, escaped <code className="font-mono">""</code>)
              </Label>
              <Textarea
                id="bulk-csv-input"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={'"id"\t"body"\t"retry_count"\t"ignore_flag"\n"4759"\t"eyJib3giOn..."\t"10"\t"1"'}
                className="min-h-[140px] resize-y rounded-lg border-border/50 bg-muted/10 font-mono text-xs shadow-none"
                disabled={bulkSendingAll}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-xl bg-muted/25 p-2 ring-1 ring-border/25">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Button
                  type="button"
                  onClick={handleBulkParse}
                  disabled={bulkSendingAll}
                  variant="secondary"
                  size="sm"
                  className="rounded-lg shadow-none"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  Parse & decode
                </Button>
                <Button
                  type="button"
                  onClick={handleBulkClear}
                  variant="ghost"
                  size="sm"
                  disabled={bulkSendingAll}
                  className="rounded-lg"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear
                </Button>
                {bulkRows.length > 0 && (
                  <>
                    <Button
                      type="button"
                      onClick={handleBulkApplyTableAll}
                      variant="outline"
                      size="sm"
                      disabled={bulkSendingAll || !substitutionTable.trim()}
                      title={
                        substitutionTable.trim()
                          ? 'Substitute {{TOKENS}} in every row using the placeholder table above'
                          : 'Paste a placeholder table at the top first'
                      }
                      className="rounded-lg border-border/60 bg-background/80 shadow-none"
                    >
                      <Table2 className="mr-1.5 h-3.5 w-3.5" />
                      Apply table to all
                    </Button>
                    <Button
                      type="button"
                      onClick={handleBulkCheckBoxQrsAll}
                      variant="outline"
                      size="sm"
                      disabled={bulkSendingAll}
                      title="Check boxQrs on every row. If it has a split-object bug (},{ in the middle), the two objects are merged into one."
                      className="rounded-lg border-border/60 bg-background/80 shadow-none"
                    >
                      <Package className="mr-1.5 h-3.5 w-3.5" />
                      Check boxQrs (all)
                    </Button>
                    <Button
                      type="button"
                      onClick={handleBulkExportJson}
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-border/60 bg-background/80 shadow-none"
                    >
                      {bulkCopiedIdx === -1 ? (
                        <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {bulkCopiedIdx === -1 ? 'Copied' : 'Copy all as JSON'}
                    </Button>
                  </>
                )}
              </div>
              {bulkRows.length > 0 && (
                <div className="flex shrink-0 items-center gap-2">
                  <Label htmlFor="bulk-delay" className="text-xs text-muted-foreground whitespace-nowrap">
                    Delay
                  </Label>
                  <div className="relative">
                    <Input
                      id="bulk-delay"
                      type="number"
                      min={0}
                      step={50}
                      value={bulkDelayMs}
                      onChange={(e) => setBulkDelayMs(Math.max(0, Number(e.target.value) || 0))}
                      disabled={bulkSendingAll}
                      className="h-8 w-[4.25rem] rounded-md border-border/50 pe-7 text-center text-xs font-mono shadow-none"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      ms
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={handleBulkSendAll}
                    variant={bulkSendingAll ? 'destructive' : 'default'}
                    size="sm"
                    className="rounded-lg shadow-sm"
                  >
                    {bulkSendingAll ? (
                      <>
                        <Square className="mr-1.5 h-3.5 w-3.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                        Send all
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {bulkParseError && (
              <p className="text-xs text-muted-foreground">{bulkParseError}</p>
            )}

            {bulkRows.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border/40 ring-1 ring-border/20">
                <div className="grid grid-cols-[90px_1fr_180px_200px] items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  <div>ID</div>
                  <div>Decoded preview</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>
                <ScrollArea className="h-[420px]">
                  <div className="divide-y divide-border/60">
                    {bulkRows.map((row, idx) => {
                      const isExpanded = !!bulkExpanded[idx]
                      const preview = row.decodeError
                        ? row.decodeError
                        : row.decoded.replace(/\s+/g, ' ').slice(0, 160)
                      const isEdited = !row.decodeError && row.decoded !== row.originalDecoded
                      const hasUnresolvedPlaceholder = /\{\{[A-Z0-9_]+\}\}/.test(row.decoded)
                      return (
                        <div
                          key={`${row.id}-${idx}`}
                          className="grid grid-cols-[90px_1fr_180px_200px] items-start gap-2 px-3 py-2 text-xs hover:bg-muted/20"
                        >
                          <div className="font-mono font-semibold text-primary">
                            {row.id || `#${idx + 1}`}
                          </div>
                          <div className="min-w-0">
                            {isExpanded ? (
                              row.decodeError ? (
                                <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-destructive/10 text-destructive rounded p-2 border border-destructive/40">
                                  {row.decodeError}
                                </pre>
                              ) : (
                                <div className="space-y-1.5">
                                  <Textarea
                                    value={row.decoded}
                                    onChange={(e) => handleBulkEditRow(idx, e.target.value)}
                                    disabled={row.status === 'sending' || bulkSendingAll}
                                    spellCheck={false}
                                    className="font-mono text-[11px] min-h-[140px] max-h-[340px] resize-y bg-muted/20"
                                  />
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() => handleBulkApplyTableRow(idx)}
                                      disabled={row.status === 'sending' || bulkSendingAll}
                                      title="Substitute {{TOKENS}} using the placeholder table above"
                                    >
                                      <Table2 className="w-3 h-3 mr-1" />
                                      Apply table
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() => handleBulkCheckBoxQrsRow(idx)}
                                      disabled={row.status === 'sending' || bulkSendingAll}
                                      title="Verify boxQrs is a single merged object; fix split-object bug if present"
                                    >
                                      <Package className="w-3 h-3 mr-1" />
                                      Fix boxQrs
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() => handleBulkPrettifyRow(idx)}
                                      disabled={row.status === 'sending' || bulkSendingAll}
                                    >
                                      <Braces className="w-3 h-3 mr-1" />
                                      Prettify
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() => handleBulkResetRow(idx)}
                                      disabled={!isEdited || row.status === 'sending' || bulkSendingAll}
                                      title="Restore original decoded payload"
                                    >
                                      Reset
                                    </Button>
                                    {isEdited && (
                                      <Badge variant="outline" className="text-[10px] ml-auto">
                                        edited
                                      </Badge>
                                    )}
                                    {hasUnresolvedPlaceholder && (
                                      <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-600 dark:text-amber-400">
                                        has {'{{...}}'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )
                            ) : (
                              <div
                                className={`font-mono truncate ${row.decodeError ? 'text-destructive' : 'text-muted-foreground'}`}
                                title={row.decoded}
                              >
                                {preview}
                                {row.decoded.length > 160 ? '…' : ''}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.status === 'sending' && (
                              <Badge variant="secondary" className="gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Sending
                              </Badge>
                            )}
                            {row.status === 'success' && (
                              <Badge variant="default" className="gap-1 bg-green-500/90 hover:bg-green-500/90">
                                <CheckCircle className="w-3 h-3" />
                                {row.responseStatus}
                                {row.durationMs != null && (
                                  <span className="opacity-80 ml-1">{row.durationMs}ms</span>
                                )}
                              </Badge>
                            )}
                            {row.status === 'error' && (
                              <Badge variant="destructive" className="gap-1" title={row.errorMessage}>
                                <XCircle className="w-3 h-3" />
                                {row.responseStatus ?? 'ERR'}
                              </Badge>
                            )}
                            {row.decodeError && (
                              <Badge variant="destructive" className="gap-1">
                                decode
                              </Badge>
                            )}
                            {!isExpanded && isEdited && (
                              <Badge variant="outline" className="text-[10px]">
                                edited
                              </Badge>
                            )}
                            {row.ignoreFlag === '1' && row.status === 'idle' && (
                              <Badge variant="outline" className="text-[10px]">
                                ignore=1
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setBulkExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                              title={isExpanded ? 'Collapse' : 'Expand / edit'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleBulkCopyRow(idx)}
                              title="Copy decoded JSON"
                            >
                              {bulkCopiedIdx === idx ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleBulkLoadIntoBody(idx)}
                              disabled={!!row.decodeError}
                              title="Load into request body"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleBulkSendOne(idx)}
                              disabled={!!row.decodeError || row.status === 'sending' || bulkSendingAll}
                              title="Send this row"
                            >
                              <Send className="w-3 h-3 mr-1" />
                              Send
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Base64 decoder dialog - opened via the "Base64" button next to Prettify */}
      <Dialog open={base64Open} onOpenChange={onBase64OpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-3 text-base">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-400">
                <Braces className="h-4 w-4" />
              </span>
              Base64 decoder / encoder
            </DialogTitle>
            <DialogDescription>Decode Base64 to UTF-8 text or encode text to Base64.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="inline-flex flex-wrap gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/30">
              <Button
                variant={base64Mode === 'decode' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setBase64Mode('decode')
                  setBase64Output('')
                  setBase64Error(null)
                }}
                className={cn('rounded-lg', base64Mode !== 'decode' && 'shadow-none')}
              >
                <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
                Decode
              </Button>
              <Button
                variant={base64Mode === 'encode' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setBase64Mode('encode')
                  setBase64Output('')
                  setBase64Error(null)
                }}
                className={cn('rounded-lg', base64Mode !== 'encode' && 'shadow-none')}
              >
                <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
                Encode
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base64-input">
                {base64Mode === 'decode' ? 'Base64 string' : 'Text to encode'}
              </Label>
              <Textarea
                id="base64-input"
                value={base64Input}
                onChange={(e) => {
                  setBase64Input(e.target.value)
                  setBase64Error(null)
                }}
                placeholder={
                  base64Mode === 'decode'
                    ? 'Paste Base64 (e.g. SGVsbG8gV29ybGQ=)'
                    : 'Enter text to encode'
                }
                className="min-h-[140px] resize-y rounded-lg border-border/50 bg-muted/10 font-mono text-sm shadow-none"
              />
            </div>

            <Button onClick={handleBase64Convert} variant="secondary" className="w-full rounded-xl shadow-none">
              {base64Mode === 'decode' ? 'Decode Base64' : 'Encode to Base64'}
            </Button>

            {base64Output && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {base64Mode === 'decode' ? 'Decoded text' : 'Base64 output'}
                  </Label>
                  <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-border/30">
                    <Button variant="ghost" size="sm" onClick={handleBase64Copy} className="h-8 gap-1.5 rounded-md px-2.5 text-xs">
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/40 bg-muted/20 p-3 font-mono text-sm ring-1 ring-border/20">
                  {base64Output}
                </pre>
              </div>
            )}

            {base64Error && (
              <p className="text-xs text-destructive">{base64Error}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
