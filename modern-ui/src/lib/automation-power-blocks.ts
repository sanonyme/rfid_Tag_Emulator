import type { BlockExecResult, BlockLog } from './automation-blocks'
import { parseHeaderLines } from './automation-blocks'
import {
  applyTemplate,
  evaluateCondition,
  isValidVarName,
  setVar,
  stringifyVarValue,
  type AutomationVars,
} from './automation-template'
import type { AutomationStep, CsvJsonOp, CryptoOp, DateTimeOp, WebhookPreset } from './automation-types'

function requireElectron(): NonNullable<typeof window.electronAPI> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api) throw new Error('This step requires the desktop app (Electron)')
  return api
}

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(view: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// 1. SSH_EXEC
// ---------------------------------------------------------------------------
export async function executeSshExec(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.automationSshExec) throw new Error('SSH Exec is not available in this build')

  const host = applyTemplate(step.params.sshHost || '', vars).trim() || vars.host || ''
  const port = parseInt(applyTemplate(step.params.sshPort || '22', vars).trim(), 10) || 22
  const username = applyTemplate(step.params.sshUser || '', vars).trim()
  const password = applyTemplate(step.params.sshPassword || '', vars)
  const privateKeyPath = applyTemplate(step.params.sshPrivateKeyPath || '', vars).trim() || undefined
  const passphrase = applyTemplate(step.params.sshPassphrase || '', vars) || undefined
  const command = applyTemplate(step.params.sshCommand || '', vars)

  if (!host) throw new Error('SSH host is required')
  if (!username) throw new Error('SSH username is required')
  if (!command.trim()) throw new Error('SSH command is required')

  log(`SSH ${username}@${host}:${port} → ${command.slice(0, 120)}${command.length > 120 ? '…' : ''}`)
  const res = await api.automationSshExec({
    host,
    port,
    username,
    password: password || undefined,
    privateKeyPath,
    passphrase,
    command,
    timeoutMs: step.params.sshTimeoutMs,
  })

  if (!res.ok) throw new Error(res.error)

  const outAs = (step.params.sshSaveStdoutAs || '').trim()
  if (outAs) setVar(vars, outAs, res.stdout.trim())
  const errAs = (step.params.sshSaveStderrAs || '').trim()
  if (errAs) setVar(vars, errAs, res.stderr.trim())
  const codeAs = (step.params.sshSaveExitCodeAs || '').trim()
  if (codeAs) setVar(vars, codeAs, String(res.exitCode))

  if (res.stdout.trim()) log(`SSH stdout: ${res.stdout.trim().slice(0, 260)}`)
  if (res.stderr.trim()) log(`SSH stderr: ${res.stderr.trim().slice(0, 260)}`)
  log(`SSH exit code ${res.exitCode}`)

  if (step.params.sshFailOnNonZero !== false && res.exitCode !== 0) {
    throw new Error(`SSH command exited with code ${res.exitCode}`)
  }
  return {}
}

// ---------------------------------------------------------------------------
// 2. PING_PORT (TCP / HTTP Health / DNS)
// ---------------------------------------------------------------------------
export async function executePingPort(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.automationNetProbe) throw new Error('Network Probe requires Electron')

  const mode = step.params.probeMode ?? 'tcp'
  const host = applyTemplate(step.params.probeHost || '', vars).trim() || vars.host || ''
  const portStr = applyTemplate(step.params.probePort || '', vars).trim()
  const port = portStr ? parseInt(portStr, 10) : 80
  const url = applyTemplate(step.params.probeUrl || '', vars).trim()
  const timeoutMs = step.params.probeTimeoutMs ?? 4000
  const expectedStatus = step.params.probeExpectedStatus ?? 200

  log(`Probe [${mode.toUpperCase()}]: ${mode === 'http' ? url : mode === 'tcp' ? `${host}:${port}` : host}`)
  const res = await api.automationNetProbe({
    mode,
    host,
    port,
    url,
    expectedStatus,
    timeoutMs,
  })
  if (!res.ok) throw new Error(res.error)

  const aliveAs = (step.params.probeSaveAliveAs || '').trim()
  if (aliveAs) setVar(vars, aliveAs, res.alive ? 'true' : 'false')
  const latAs = (step.params.probeSaveLatencyAs || '').trim()
  if (latAs) setVar(vars, latAs, String(res.latencyMs))

  if (mode === 'dns' && res.resolvedIp !== undefined) {
    setVar(vars, 'resolvedIp', res.resolvedIp)
  }
  if (mode === 'http' && res.status !== undefined) {
    setVar(vars, 'probeHttpStatus', String(res.status))
  }

  log(`${res.alive ? '✓' : '✖'} ${res.detail} (${res.latencyMs}ms)`)
  if (step.params.probeFailIfDown && !res.alive) {
    throw new Error(`Probe failed: ${res.detail}`)
  }
  return {}
}

// ---------------------------------------------------------------------------
// 3. WEBSOCKET
// ---------------------------------------------------------------------------
export async function executeWebSocket(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.automationWsRequest) throw new Error('WebSocket node requires Electron')

  const url = applyTemplate(step.params.wsUrl || '', vars).trim()
  if (!url) throw new Error('WebSocket URL is required')
  const headers = parseHeaderLines(applyTemplate(step.params.wsHeaders || '', vars))
  const sendMessage =
    step.params.wsSendMessage !== undefined ? applyTemplate(step.params.wsSendMessage, vars) : undefined
  const waitForMessage = step.params.wsWaitForMessage !== false
  const matchRegex = applyTemplate(step.params.wsMatchRegex || '', vars).trim() || undefined

  log(`WS → ${url}${sendMessage ? ` (tx ${sendMessage.length}ch)` : ''}`)
  const res = await api.automationWsRequest({
    url,
    headers,
    sendMessage,
    waitForMessage,
    matchRegex,
    timeoutMs: step.params.wsTimeoutMs ?? 8000,
  })
  if (!res.ok) throw new Error(res.error)

  const saveAs = (step.params.wsSaveAs || '').trim()
  if (saveAs && res.received !== undefined) {
    setVar(vars, saveAs, res.received)
  }
  log(
    `WS OK (${res.latencyMs}ms)${res.received !== undefined ? ` — rx: ${res.received.slice(0, 140)}` : ''}`,
  )
  return {}
}

// ---------------------------------------------------------------------------
// 4. WEBHOOK_SEND (Slack / Discord / Microsoft Teams / Generic JSON)
// ---------------------------------------------------------------------------
export function buildWebhookPayload(params: {
  preset: WebhookPreset
  title: string
  message: string
  color?: string
}): string {
  const title = params.title.trim()
  const message = params.message
  const colorHex = (params.color || '#10b981').trim() || '#10b981'

  switch (params.preset) {
    case 'slack':
      return JSON.stringify(
        title
          ? {
              text: `*${title}*\n${message}`,
              attachments: [{ color: colorHex, title, text: message }],
            }
          : { text: message },
      )
    case 'discord': {
      const hexInt = parseInt(colorHex.replace('#', ''), 16)
      const colorNum = Number.isFinite(hexInt) ? hexInt : 0x10b981
      return JSON.stringify(
        title
          ? {
              username: 'Zeus Automation',
              embeds: [{ title, description: message, color: colorNum }],
            }
          : { username: 'Zeus Automation', content: message },
      )
    }
    case 'teams':
      return JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: colorHex.replace('#', ''),
        summary: title || message.slice(0, 80) || 'Zeus Automation Alert',
        title: title || 'Zeus Automation Alert',
        text: message,
      })
    case 'generic':
    default: {
      const trimmed = message.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          JSON.parse(trimmed)
          return trimmed
        } catch {
          /* fall through to structured object */
        }
      }
      return JSON.stringify({
        title: title || undefined,
        message,
        timestamp: new Date().toISOString(),
      })
    }
  }
}

export async function executeWebhookSend(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const url = applyTemplate(step.params.webhookUrl || '', vars).trim()
  if (!url) throw new Error('Webhook URL is required')

  const preset: WebhookPreset = step.params.webhookPreset ?? 'slack'
  const title = applyTemplate(step.params.webhookTitle || '', vars)
  const message = applyTemplate(step.params.webhookMessage || '', vars)
  const color = applyTemplate(step.params.webhookColor || '#10b981', vars)
  const body = buildWebhookPayload({ preset, title, message, color })

  log(`Webhook [${preset.toUpperCase()}] POST → ${url.slice(0, 80)}${url.length > 80 ? '…' : ''}`)

  let status = 0
  let ok = false
  let statusText = ''
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (api?.aleRequest) {
    const res = await api.aleRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      timeoutMs: 12_000,
    })
    status = res.status
    ok = res.ok
    statusText = res.statusText
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    status = res.status
    ok = res.ok
    statusText = res.statusText
  }

  const saveAs = (step.params.webhookSaveStatusAs || '').trim()
  if (saveAs) setVar(vars, saveAs, String(status))

  log(`Webhook HTTP ${status} ${statusText}`)
  if (step.params.webhookFailOnError !== false && !ok) {
    throw new Error(`Webhook failed: HTTP ${status} ${statusText}`)
  }
  return {}
}

// ---------------------------------------------------------------------------
// 5. CSV_JSON (RFC-4180-safe CSV parser/serializer + JSON array transforms)
// ---------------------------------------------------------------------------
function splitCsvLines(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      if (row.some((c) => c !== '') || rows.length > 0) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export function parseCsv(
  text: string,
  delimiter = ',',
  hasHeader = true,
): Record<string, string>[] | string[][] {
  const delim = delimiter || ','
  const matrix = splitCsvLines(text, delim)
  if (matrix.length === 0) return []
  if (!hasHeader) return matrix

  const headers = matrix[0]!.map((h, i) => h.trim() || `col_${i}`)
  return matrix.slice(1).map((cols) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]!] = cols[i] ?? ''
    }
    return obj
  })
}

function escapeCsvCell(val: unknown, delimiter: string): string {
  const str = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val)
  if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(delimiter)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(rows: unknown[], delimiter = ','): string {
  const delim = delimiter || ','
  if (rows.length === 0) return ''
  if (Array.isArray(rows[0])) {
    return (rows as unknown[][])
      .map((r) => r.map((c) => escapeCsvCell(c, delim)).join(delim))
      .join('\n')
  }
  const keys: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!seen.has(k)) {
          seen.add(k)
          keys.push(k)
        }
      }
    }
  }
  if (keys.length === 0) {
    return rows.map((r) => escapeCsvCell(r, delim)).join('\n')
  }
  const headerLine = keys.map((k) => escapeCsvCell(k, delim)).join(delim)
  const bodyLines = rows.map((r) => {
    const obj = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    return keys.map((k) => escapeCsvCell(obj[k], delim)).join(delim)
  })
  return [headerLine, ...bodyLines].join('\n')
}

function parseJsonArrayInput(raw: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('CSV/JSON: input is not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('CSV/JSON: expected a JSON array')
  }
  return parsed
}

function readItemField(item: unknown, field: string): unknown {
  if (!field.trim()) return item
  if (item == null || typeof item !== 'object') return undefined
  const parts = field.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: any = item
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

export async function executeCsvJson(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const saveAs = (step.params.csvJsonSaveAs || '').trim()
  if (!saveAs) throw new Error('CSV/JSON: save-as variable name is required')
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  const op: CsvJsonOp = step.params.csvJsonOp ?? 'csvToJson'
  const input = applyTemplate(step.params.csvJsonInput || '', vars)
  const input2 = applyTemplate(step.params.csvJsonInput2 || '', vars)
  const delimiter = step.params.csvDelimiter || ','
  const hasHeader = step.params.csvHasHeader !== false

  let output = ''

  switch (op) {
    case 'csvToJson': {
      const parsed = parseCsv(input, delimiter, hasHeader)
      output = JSON.stringify(parsed)
      setVar(vars, `${saveAs}_count`, String(parsed.length))
      break
    }
    case 'jsonToCsv': {
      const arr = parseJsonArrayInput(input)
      output = toCsv(arr, delimiter)
      break
    }
    case 'filterArray': {
      const arr = parseJsonArrayInput(input)
      const field = applyTemplate(step.params.csvFilterField || '', vars).trim()
      const filterOp = step.params.csvFilterOp ?? 'eq'
      const filterVal = applyTemplate(step.params.csvFilterValue || '', vars)
      const filtered = arr.filter((item) => {
        const val = stringifyVarValue(readItemField(item, field))
        return evaluateCondition(
          { condLeft: '{{__val__}}', condOp: filterOp, condRight: filterVal },
          { ...vars, __val__: val },
        )
      })
      output = JSON.stringify(filtered)
      setVar(vars, `${saveAs}_count`, String(filtered.length))
      break
    }
    case 'mapField': {
      const arr = parseJsonArrayInput(input)
      const field = applyTemplate(step.params.csvMapField || '', vars).trim()
      if (!field) throw new Error('CSV/JSON Map Field: field name is required')
      const mapped = arr.map((item) => readItemField(item, field))
      output = JSON.stringify(mapped)
      setVar(vars, `${saveAs}_count`, String(mapped.length))
      break
    }
    case 'sortArray': {
      const arr = [...parseJsonArrayInput(input)]
      const field = applyTemplate(step.params.csvSortField || '', vars).trim()
      const dir = step.params.csvSortDir === 'desc' ? -1 : 1
      arr.sort((a, b) => {
        const av = readItemField(a, field)
        const bv = readItemField(b, field)
        const an = Number(av)
        const bn = Number(bv)
        if (av !== '' && bv !== '' && av != null && bv != null && Number.isFinite(an) && Number.isFinite(bn)) {
          return (an - bn) * dir
        }
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir
      })
      output = JSON.stringify(arr)
      break
    }
    case 'aggregate': {
      const arr = parseJsonArrayInput(input)
      const field = applyTemplate(step.params.csvMapField || step.params.csvFilterField || '', vars).trim()
      const aggOp = step.params.csvAggOp ?? 'count'
      const vals = arr.map((item) => readItemField(item, field))
      if (aggOp === 'count') {
        output = String(arr.length)
      } else if (aggOp === 'unique') {
        const uniq = Array.from(new Set(vals.map((v) => stringifyVarValue(v)).filter(Boolean)))
        output = JSON.stringify(uniq)
      } else if (aggOp === 'join') {
        const sep = step.params.csvJoinSeparator ?? ', '
        output = vals.map((v) => stringifyVarValue(v)).join(sep)
      } else {
        const nums = vals.map((v) => Number(v)).filter((n) => Number.isFinite(n))
        if (nums.length === 0) {
          output = '0'
        } else if (aggOp === 'sum') {
          output = String(nums.reduce((a, b) => a + b, 0))
        } else if (aggOp === 'avg') {
          output = String(nums.reduce((a, b) => a + b, 0) / nums.length)
        } else if (aggOp === 'min') {
          output = String(Math.min(...nums))
        } else if (aggOp === 'max') {
          output = String(Math.max(...nums))
        }
      }
      break
    }
    case 'mergeJson': {
      const a = JSON.parse(input || '{}')
      const b = JSON.parse(input2 || '{}')
      if (Array.isArray(a) && Array.isArray(b)) {
        output = JSON.stringify([...a, ...b])
      } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        output = JSON.stringify({ ...a, ...b })
      } else {
        throw new Error('Merge JSON requires two objects or two arrays')
      }
      break
    }
  }

  setVar(vars, saveAs, output)
  log(`CSV/JSON (${op}) → ${saveAs}=${output.slice(0, 120)}${output.length > 120 ? '…' : ''}`)
  return {}
}

// ---------------------------------------------------------------------------
// 6. CRYPTO_HASH (Hash / HMAC / JWT Decode / Random Token)
// ---------------------------------------------------------------------------
function base64UrlToUtf8(b64u: string): string {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const clean = token.trim().replace(/^Bearer\s+/i, '')
  const parts = clean.split('.')
  if (parts.length < 2) throw new Error('Invalid JWT format (expected header.payload.signature)')
  const header = JSON.parse(base64UrlToUtf8(parts[0]!))
  const payload = JSON.parse(base64UrlToUtf8(parts[1]!))
  return { header, payload }
}

async function fallbackCryptoHash(
  op: Exclude<CryptoOp, 'jwtDecode'>,
  input: string,
  secret: string,
  byteLength: number,
): Promise<string> {
  if (op === 'randomToken') {
    const bytes = new Uint8Array(Math.min(256, Math.max(4, byteLength)))
    crypto.getRandomValues(bytes)
    return bytesToBase64Url(bytes)
  }
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error(`Crypto op "${op}" requires Electron or WebCrypto`)
  const enc = new TextEncoder()
  if (op === 'hmacSha256' || op === 'hmacSha512') {
    const hashAlgo = op === 'hmacSha512' ? 'SHA-512' : 'SHA-256'
    const key = await subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: hashAlgo },
      false,
      ['sign'],
    )
    const sig = await subtle.sign('HMAC', key, enc.encode(input))
    return bytesToHex(sig)
  }
  if (op === 'md5') {
    throw new Error('MD5 requires Electron desktop environment')
  }
  const algo = op === 'sha512' ? 'SHA-512' : op === 'sha1' ? 'SHA-1' : 'SHA-256'
  const digest = await subtle.digest(algo, enc.encode(input))
  return bytesToHex(digest)
}

export async function executeCryptoHash(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const saveAs = (step.params.cryptoSaveAs || '').trim()
  if (!saveAs) throw new Error('Crypto: save-as variable name is required')
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  const op: CryptoOp = step.params.cryptoOp ?? 'sha256'
  const input = applyTemplate(step.params.cryptoInput || '', vars)
  const secret = applyTemplate(step.params.cryptoSecret || '', vars)
  const byteLength = step.params.cryptoByteLength ?? 24

  let output = ''
  if (op === 'jwtDecode') {
    const decoded = decodeJwtPayload(input)
    output = JSON.stringify(decoded.payload)
    setVar(vars, `${saveAs}_header`, JSON.stringify(decoded.header))
  } else {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.automationCryptoHash) {
      const res = await api.automationCryptoHash({ op, input, secret, byteLength })
      if (!res.ok) throw new Error(res.error)
      output = res.output
    } else {
      output = await fallbackCryptoHash(op, input, secret, byteLength)
    }
  }

  setVar(vars, saveAs, output)
  log(`Crypto (${op}) → ${saveAs}=${output.slice(0, 64)}${output.length > 64 ? '…' : ''}`)
  return {}
}

// ---------------------------------------------------------------------------
// 7. DATETIME (Now / Add / Diff / Format)
// ---------------------------------------------------------------------------
function parseDateInput(raw: string): Date {
  const trimmed = raw.trim()
  if (!trimmed) return new Date()
  if (/^\d{10,13}$/.test(trimmed)) {
    const n = Number(trimmed)
    return new Date(trimmed.length === 10 ? n * 1000 : n)
  }
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: "${trimmed}"`)
  return d
}

export function formatDateTime(date: Date, pattern = 'ISO'): string {
  const fmt = (pattern || 'ISO').trim()
  if (!fmt || fmt.toUpperCase() === 'ISO') return date.toISOString()
  if (fmt === 'unixMs') return String(date.getTime())
  if (fmt === 'unixSec') return String(Math.floor(date.getTime() / 1000))

  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  return fmt
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, p(date.getMonth() + 1))
    .replace(/DD/g, p(date.getDate()))
    .replace(/HH/g, p(date.getHours()))
    .replace(/mm/g, p(date.getMinutes()))
    .replace(/ss/g, p(date.getSeconds()))
    .replace(/SSS/g, p(date.getMilliseconds(), 3))
}

const UNIT_MS = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const

export async function executeDateTime(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const saveAs = (step.params.dtSaveAs || '').trim()
  if (!saveAs) throw new Error('Date/Time: save-as variable name is required')
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  const op: DateTimeOp = step.params.dtOp ?? 'now'
  const fmt = applyTemplate(step.params.dtFormat || 'ISO', vars)
  const unit = step.params.dtUnit ?? 'hours'
  const unitMs = UNIT_MS[unit] ?? 3_600_000

  let result = ''
  if (op === 'now') {
    result = formatDateTime(new Date(), fmt)
  } else if (op === 'format') {
    const d = parseDateInput(applyTemplate(step.params.dtInput || '', vars))
    result = formatDateTime(d, fmt)
  } else if (op === 'add') {
    const d = parseDateInput(applyTemplate(step.params.dtInput || '', vars))
    const amount = Number(step.params.dtAmount ?? 0)
    const next = new Date(d.getTime() + (Number.isFinite(amount) ? amount : 0) * unitMs)
    result = formatDateTime(next, fmt)
  } else if (op === 'diff') {
    const d1 = parseDateInput(applyTemplate(step.params.dtInput || '', vars))
    const d2 = parseDateInput(applyTemplate(step.params.dtInput2 || '', vars))
    const diffMs = d2.getTime() - d1.getTime()
    const inUnit = Math.round((diffMs / unitMs) * 1000) / 1000
    result = String(inUnit)
    setVar(vars, `${saveAs}_ms`, String(diffMs))
  }

  setVar(vars, saveAs, result)
  log(`DateTime (${op}) → ${saveAs}=${result}`)
  return {}
}

// ---------------------------------------------------------------------------
// 8. CLIPBOARD (OS Read / Write)
// ---------------------------------------------------------------------------
export async function executeClipboard(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const mode = step.params.clipboardMode ?? 'write'
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined

  if (mode === 'read') {
    const saveAs = (step.params.clipboardSaveAs || 'clipboardText').trim()
    if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)
    let text = ''
    if (api?.automationClipboardRead) {
      const res = await api.automationClipboardRead()
      if (!res.ok) throw new Error(res.error || 'Failed to read clipboard')
      text = res.text ?? ''
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      text = await navigator.clipboard.readText()
    } else {
      throw new Error('Clipboard read is not supported in this environment')
    }
    setVar(vars, saveAs, text)
    log(`Clipboard read → ${saveAs} (${text.length}ch)`)
    return {}
  }

  const text = applyTemplate(step.params.clipboardText || '', vars)
  if (api?.automationClipboardWrite) {
    const res = await api.automationClipboardWrite(text)
    if (!res.ok) throw new Error(res.error || 'Failed to write clipboard')
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    throw new Error('Clipboard write is not supported in this environment')
  }
  log(`Clipboard write OK (${text.length}ch)`)
  return {}
}

// ---------------------------------------------------------------------------
// 9. OPEN_APP (Open URL in browser, launch file, or reveal in Explorer/Finder)
// ---------------------------------------------------------------------------
export async function executeOpenApp(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.automationOpenTarget) throw new Error('Open URL / File requires Electron')

  const mode = step.params.openMode ?? 'url'
  const target = applyTemplate(step.params.openTarget || '', vars).trim()
  if (!target) throw new Error('Target URL or file path is required')

  log(`Open [${mode}] → ${target}`)
  const res = await api.automationOpenTarget({ mode, target })
  if (!res.ok) throw new Error(res.error || 'Failed to open target')
  return {}
}
