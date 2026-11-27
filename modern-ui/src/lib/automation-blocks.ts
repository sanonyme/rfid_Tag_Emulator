import { CODE_LANGUAGE_OPTIONS, SCRIPT_LANG_OPTIONS, type AutomationStep, type CodeLanguage, type GenerateKind, type HttpAuthType, type TcpLineEnding, type TcpNodeMode, type TransformOp } from './automation-types'
import type { AutomationVars } from './automation-template'
import {
  applyTemplate,
  cellFromRows,
  setVar,
  coerceToType,
  isValidVarName,
  stringifyVarValue,
  evaluateCondition,
  AutomationStopSignal,
} from './automation-template'
import { generateSgtin96 } from './epc-encoders'
import { EPCDecoder } from './decoder'

export type BlockLog = (msg: string) => void

export type BlockExecResult = {
  /** Optional vars to merge into run context */
  vars?: AutomationVars
}

function requireElectron(): NonNullable<typeof window.electronAPI> {
  const api = window.electronAPI
  if (!api) throw new Error('This step requires the desktop app (Electron)')
  return api
}

export async function executeSetVariable(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const name = (step.params.varName || '').trim()
  if (!name) throw new Error('Variable name is required')
  const type = step.params.varType ?? 'string'
  const raw = applyTemplate(step.params.varValue || '', vars)
  // Validate & canonicalize against the declared type (throws on invalid input).
  const value = coerceToType(raw, type)
  setVar(vars, name, value)
  const shown = value.length > 120 ? value.slice(0, 120) + '…' : value
  log(`Set ${name} (${type}) = ${shown}`)
  return {}
}

export async function executeDbQuery(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const sql = applyTemplate(step.params.dbSql || '', vars).trim()
  if (!sql) throw new Error('SQL is required')
  const database = applyTemplate(step.params.dbDatabase || '', vars).trim() || undefined

  log(`DB query${database ? ` [${database}]` : ''}: ${sql.slice(0, 120)}${sql.length > 120 ? '…' : ''}`)
  const result = await api.dbExecuteQuery(sql, database)
  if (!result.ok) throw new Error(result.error)

  const saveAs = (step.params.dbSaveAs || '').trim()
  if (saveAs) {
    const cell = cellFromRows(
      result.rows as Record<string, unknown>[],
      step.params.dbSaveColumn || undefined,
      step.params.dbSaveRowIndex ?? 0,
    )
    setVar(vars, saveAs, cell)
    setVar(vars, `${saveAs}_rowCount`, String(result.rows.length))
    log(`Saved ${saveAs}=${cell || '(empty)'} (${result.rows.length} row(s))`)
  } else {
    log(result.message || `${result.rows.length} row(s)`)
  }

  const saveRowsAs = (step.params.dbSaveRowsAs || '').trim()
  if (saveRowsAs && isValidVarName(saveRowsAs)) {
    setVar(vars, saveRowsAs, JSON.stringify(result.rows))
    log(`Saved ${result.rows.length} row(s) JSON → ${saveRowsAs}`)
  }
  return {}
}

/**
 * Run an arbitrary SQL statement (INSERT / UPDATE / DELETE / DDL / CALL / SELECT …).
 * Unlike DB_QUERY this is framed around write / side-effecting statements: it captures
 * the affected-row count and any auto-increment insert id, and — if the statement did
 * return rows — can still capture a result cell.
 */
export async function executeDbExec(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const sql = applyTemplate(step.params.dbSql || '', vars).trim()
  if (!sql) throw new Error('SQL is required')
  const database = applyTemplate(step.params.dbDatabase || '', vars).trim() || undefined

  log(`SQL${database ? ` [${database}]` : ''}: ${sql.slice(0, 160)}${sql.length > 160 ? '…' : ''}`)
  const result = await api.dbExecuteQuery(sql, database)
  if (!result.ok) throw new Error(result.error)

  const affected = result.affectedRows ?? result.rows.length
  const affectedAs = (step.params.dbSaveAffectedAs || '').trim()
  if (affectedAs) setVar(vars, affectedAs, String(affected))

  const insertIdAs = (step.params.dbSaveInsertIdAs || '').trim()
  if (insertIdAs) setVar(vars, insertIdAs, result.insertId != null ? String(result.insertId) : '')

  const saveAs = (step.params.dbSaveAs || '').trim()
  if (saveAs) {
    const cell = cellFromRows(
      result.rows as Record<string, unknown>[],
      step.params.dbSaveColumn || undefined,
      step.params.dbSaveRowIndex ?? 0,
    )
    setVar(vars, saveAs, cell)
  }

  log(result.message || `OK — ${affected} row(s) affected`)
  return {}
}

export async function executeRunScript(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.automationRunScript) throw new Error('Run Script is not available in this build')

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) {
    env[`ZEUS_${k.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] = v
  }
  if (vars.host) env.ZEUS_HOST = vars.host
  if (vars.epc) env.ZEUS_EPC = vars.epc
  if (vars.upc) env.ZEUS_UPC = vars.upc

  const inline = step.params.scriptInline === true
  const langMeta = SCRIPT_LANG_OPTIONS.find((l) => l.value === step.params.scriptLang)
  const ext = inline ? langMeta?.ext : undefined
  const argsRaw = applyTemplate(step.params.scriptArgs || '', vars)
  const args = argsRaw
    .split(/\s+/)
    .map((a) => a.trim())
    .filter(Boolean)

  log(inline ? `Running inline script${ext ? ` (${ext})` : ''}…` : `Running script: ${step.params.scriptPath}`)
  const result = await api.automationRunScript({
    inline,
    inlineScript: inline ? applyTemplate(step.params.scriptInlineText || '', vars) : undefined,
    scriptPath: inline ? undefined : applyTemplate(step.params.scriptPath || '', vars),
    ext,
    args,
    env,
    timeoutMs: step.params.scriptTimeoutMs,
  })
  if (!result.ok) throw new Error(result.error)

  const saveAs = (step.params.scriptSaveStdoutAs || '').trim()
  if (saveAs) setVar(vars, saveAs, result.stdout.trim())
  const stderrAs = (step.params.scriptSaveStderrAs || '').trim()
  if (stderrAs) setVar(vars, stderrAs, result.stderr.trim())
  const exitAs = (step.params.scriptSaveExitCodeAs || '').trim()
  if (exitAs) setVar(vars, exitAs, String(result.exitCode))

  if (result.stdout.trim()) log(`stdout: ${result.stdout.trim().slice(0, 300)}`)
  if (result.stderr.trim()) log(`stderr: ${result.stderr.trim().slice(0, 300)}`)
  log(`exit code ${result.exitCode}`)

  if (step.params.scriptFailOnNonZero !== false && result.exitCode !== 0) {
    throw new Error(`Script exited with code ${result.exitCode}`)
  }
  return {}
}

/** Parse "Key: Value" header lines into an object; blank lines and `#` comments are ignored. */
export function parseHeaderLines(raw: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}

/**
 * Resolve a simple dot/bracket path into a parsed JSON value.
 * Supports `a.b.0.c` and `a[0].b`. Returns '' when the path can't be resolved.
 */
export function extractJsonPath(json: unknown, path: string): string {
  const clean = path.trim()
  if (!clean) return ''
  const parts = clean
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean)
  let cur: any = json
  for (const part of parts) {
    if (cur == null) return ''
    cur = cur[part]
  }
  if (cur == null) return ''
  return typeof cur === 'object' ? JSON.stringify(cur) : String(cur)
}

/**
 * Perform an HTTP request via the Electron main process (bypasses CORS, same proxy
 * the API tab uses). Captures status, body, and an optional JSON field into variables.
 */
export async function executeHttpRequest(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  if (!api.aleRequest) throw new Error('HTTP requests are not available in this build')

  const method = (step.params.httpMethod || 'GET').toUpperCase()
  const url = applyTemplate(step.params.httpUrl || '', vars).trim()
  if (!url) throw new Error('URL is required')

  const headers = parseHeaderLines(applyTemplate(step.params.httpHeaders || '', vars))
  const authType: HttpAuthType =
    step.params.httpAuthType ?? (step.params.httpUseAleAuth ? 'ale' : 'none')
  const hasAuthHeader = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')

  if (authType === 'bearer' && !hasAuthHeader) {
    const tok = applyTemplate(step.params.httpAuthToken || '', vars).trim()
    if (tok) headers.Authorization = `Bearer ${tok}`
  } else if (authType === 'basic' && !hasAuthHeader) {
    const user = applyTemplate(step.params.httpAuthUser || '', vars)
    const pass = applyTemplate(step.params.httpAuthPass || '', vars)
    const bytes = new TextEncoder().encode(`${user}:${pass}`)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
    headers.Authorization = `Basic ${btoa(bin)}`
  } else if (authType === 'apiKey') {
    const headerName = applyTemplate(step.params.httpAuthHeaderName || 'X-API-Key', vars).trim()
    const token = applyTemplate(step.params.httpAuthToken || '', vars)
    const already = Object.keys(headers).some((k) => k.toLowerCase() === headerName.toLowerCase())
    if (headerName && token && !already) headers[headerName] = token
  } else if (authType === 'ale' && api.aleGetBasicAuthHeader && !hasAuthHeader) {
    const authRes = await api.aleGetBasicAuthHeader()
    if (authRes.ok && authRes.header) {
      headers.Authorization = authRes.header
    } else {
      log('HTTP: ALE Basic Auth requested, but no saved ALE credentials found')
    }
  }
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? applyTemplate(step.params.httpBody || '', vars) : undefined

  const options: Record<string, unknown> = { method, headers }
  if (hasBody && body) options.body = body
  if (typeof step.params.httpTimeoutMs === 'number') options.timeoutMs = step.params.httpTimeoutMs

  log(`HTTP ${method} ${url}`)
  const res = await api.aleRequest(url, options)

  const statusAs = (step.params.httpSaveStatusAs || '').trim()
  if (statusAs) setVar(vars, statusAs, String(res.status))

  const headersAs = (step.params.httpSaveHeadersAs || '').trim()
  if (headersAs && isValidVarName(headersAs)) {
    setVar(vars, headersAs, JSON.stringify(res.headers ?? {}))
  }

  const bodyText = res.data ?? ''
  const bodyAs = (step.params.httpSaveBodyAs || '').trim()
  if (bodyAs) setVar(vars, bodyAs, bodyText)

  const jsonPath = (step.params.httpJsonPath || '').trim()
  const jsonAs = (step.params.httpSaveJsonAs || '').trim()
  if (jsonPath && jsonAs) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      log(`HTTP: response is not JSON; ${jsonAs} left empty`)
    }
    setVar(vars, jsonAs, parsed != null ? extractJsonPath(parsed, jsonPath) : '')
  }

  const preview = bodyText.trim().slice(0, 200)
  log(`HTTP ${res.status} ${res.statusText}${preview ? ` — ${preview}${bodyText.length > 200 ? '…' : ''}` : ''}`)

  if (step.params.httpFailOnError !== false && !res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  return {}
}

/** Merge an object of new/updated values into `vars` (canonicalized to strings). */
function mergeVarsFromObject(
  vars: AutomationVars,
  obj: Record<string, unknown>,
  log: BlockLog,
): number {
  let count = 0
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function') continue
    if (!isValidVarName(k)) {
      log(`Code: skipped invalid variable name "${k}"`)
      continue
    }
    setVar(vars, k, stringifyVarValue(v))
    count++
  }
  return count
}

/**
 * Parse variable updates from a subprocess language's stdout. Prefers a trailing
 * JSON object line (`{"a":"1"}`); otherwise falls back to `KEY=VALUE` lines.
 */
export function parseCodeStdout(stdout: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const obj = JSON.parse(line)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj)) out[k] = stringifyVarValue(v)
          return out
        }
      } catch {
        /* not JSON — fall through to KEY=VALUE parsing */
      }
    }
  }

  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** Run a Custom Code node — supports in-process JavaScript and 10 subprocess/built-in languages. */
export async function executeCode(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const language: CodeLanguage = step.params.codeLanguage ?? 'javascript'
  const rawSource = step.params.codeSource ?? ''
  if (!rawSource.trim()) throw new Error('Code is empty')

  if (language === 'javascript') {
    return runJavaScriptCode(rawSource, vars, log)
  }

  const meta = CODE_LANGUAGE_OPTIONS.find((o) => o.value === language)
  if (!meta) {
    throw new Error(`Unsupported code language: ${language}`)
  }

  const api = requireElectron()
  if (!api.automationRunScript) {
    throw new Error(`${meta.label} execution requires the Electron desktop app`)
  }

  const inlineScript =
    step.params.codeInterpolateVars === true ? applyTemplate(rawSource, vars) : rawSource

  const env: Record<string, string> = {
    ZEUS_VARS_JSON: JSON.stringify(vars),
  }
  for (const [k, v] of Object.entries(vars)) {
    env[`ZEUS_${k.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] = v
  }
  if (vars.host) env.ZEUS_HOST = vars.host
  if (vars.epc) env.ZEUS_EPC = vars.epc
  if (vars.upc) env.ZEUS_UPC = vars.upc

  log(`Custom Code [${meta.badge}] running…`)
  const result = await api.automationRunScript({
    inline: true,
    inlineScript,
    ext: meta.ext,
    env,
    timeoutMs: step.params.codeTimeoutMs ?? 15000,
  })
  if (!result.ok) throw new Error(result.error)

  const outText = result.stdout.trim()
  const errText = result.stderr.trim()
  if (step.params.codeSaveStdoutAs?.trim()) {
    setVar(vars, step.params.codeSaveStdoutAs.trim(), outText)
  }
  if (step.params.codeSaveStderrAs?.trim()) {
    setVar(vars, step.params.codeSaveStderrAs.trim(), errText)
  }
  if (step.params.codeSaveExitCodeAs?.trim()) {
    setVar(vars, step.params.codeSaveExitCodeAs.trim(), String(result.exitCode))
  }

  if (outText) log(`${meta.badge} stdout: ${outText.slice(0, 300)}`)
  if (errText) log(`${meta.badge} stderr: ${errText.slice(0, 300)}`)

  const parsed = parseCodeStdout(result.stdout)
  const changed = mergeVarsFromObject(vars, parsed, log)
  log(`${meta.badge} exit ${result.exitCode} — ${changed} variable(s) updated`)

  if (step.params.codeFailOnNonZero !== false && result.exitCode !== 0) {
    throw new Error(`${meta.label} exited with code ${result.exitCode}`)
  }
  return {}
}

/**
 * Run user JavaScript in-process. The code receives a mutable `vars` map and a
 * `log` helper; it may mutate `vars` and/or return an object. Both are merged back.
 * Runs with the app's privileges (same trust model as the Run Script / SQL nodes).
 */
async function runJavaScriptCode(
  source: string,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const scope: Record<string, unknown> = { ...vars }
  const codeLog = (...parts: unknown[]) => {
    const msg = parts.map((p) => (typeof p === 'string' ? p : stringifyVarValue(p))).join(' ')
    log(`js: ${msg}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as any
  let fn: (v: Record<string, unknown>, l: typeof codeLog) => Promise<unknown>
  try {
    fn = new AsyncFunction('vars', 'log', source)
  } catch (err: any) {
    throw new Error(`JavaScript syntax error: ${err.message}`)
  }

  let returned: unknown
  try {
    returned = await fn(scope, codeLog)
  } catch (err: any) {
    throw new Error(`JavaScript error: ${err.message}`)
  }

  let changed = mergeVarsFromObject(vars, scope, log)
  if (returned && typeof returned === 'object' && !Array.isArray(returned)) {
    changed += mergeVarsFromObject(vars, returned as Record<string, unknown>, log)
  }
  log(`Code OK — ${changed} variable(s) updated`)
  return {}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new Error('Aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Fail the run when a condition is false (test assertion). */
export async function executeAssert(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const pass = evaluateCondition(step.params, vars)
  if (pass) {
    log('✓ Assert passed')
    return {}
  }
  const msg =
    applyTemplate(step.params.assertMessage || '', vars).trim() ||
    'Assertion failed'
  log(`✖ Assert failed: ${msg}`)
  throw new Error(msg)
}

/** Poll a condition until true, or timeout. */
export async function executeWaitUntil(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
  signal?: AbortSignal,
): Promise<BlockExecResult> {
  const timeoutMs = Math.max(0, step.params.waitTimeoutMs ?? 10000)
  const pollMs = Math.max(50, step.params.waitPollMs ?? 500)
  const onTimeout = step.params.waitOnTimeout ?? 'fail'
  const started = Date.now()
  log(`Waiting until condition (timeout ${timeoutMs}ms, poll ${pollMs}ms)…`)

  while (true) {
    if (signal?.aborted) throw new Error('Aborted')
    if (evaluateCondition(step.params, vars)) {
      log(`✓ Condition met after ${Date.now() - started}ms`)
      return {}
    }
    if (Date.now() - started >= timeoutMs) {
      if (onTimeout === 'continue') {
        log(`⚠ Wait timed out after ${timeoutMs}ms — continuing`)
        return {}
      }
      throw new Error(`Wait Until timed out after ${timeoutMs}ms`)
    }
    await sleep(Math.min(pollMs, timeoutMs - (Date.now() - started)), signal)
  }
}

/** Soft-stop the sequence or whole run (not a failure). */
export async function executeStop(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const scope = step.params.stopScope ?? 'sequence'
  const msg = applyTemplate(step.params.stopMessage || '', vars).trim() || 'Stopped'
  log(`⏹ ${msg} (${scope === 'run' ? 'end run' : 'end sequence'})`)
  throw new AutomationStopSignal(scope, msg)
}

/** Generate a value into a variable. */
export async function executeGenerate(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const saveAs = (step.params.generateSaveAs || '').trim()
  if (!saveAs) throw new Error('Generate: save-as variable name is required')
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  const kind: GenerateKind = step.params.generateKind ?? 'uuid'
  let value = ''
  switch (kind) {
    case 'uuid':
      value = crypto.randomUUID()
      break
    case 'timestamp':
      value = new Date().toISOString()
      break
    case 'unixMs':
      value = String(Date.now())
      break
    case 'randomInt': {
      let min = step.params.generateMin ?? 0
      let max = step.params.generateMax ?? 9999
      if (min > max) [min, max] = [max, min]
      value = String(Math.floor(Math.random() * (max - min + 1)) + min)
      break
    }
    case 'randomHex': {
      const len = Math.max(1, Math.min(128, step.params.generateHexLength ?? 16))
      const bytes = new Uint8Array(Math.ceil(len / 2))
      crypto.getRandomValues(bytes)
      value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, len)
      break
    }
    case 'randomUpc': {
      const base13 = '00' + Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('')
      let sum = 0
      for (let i = 0; i < 13; i++) sum += Number(base13[i]) * (i % 2 === 0 ? 3 : 1)
      const check = (10 - (sum % 10)) % 10
      value = base13 + String(check)
      break
    }
    case 'epcFromUpc': {
      const upc = applyTemplate(step.params.generateUpc || '00000000000001', vars).trim()
      const rawSerial = applyTemplate(step.params.generateSerial || '{{nextSerial}}', vars).trim()
      const serial = Math.max(1, parseInt(rawSerial, 10) || 1)
      const epcs = generateSgtin96(upc, 1, serial, 6, 0)
      value = epcs[0] ?? ''
      break
    }
    default:
      throw new Error(`Unknown generate kind: ${kind}`)
  }
  setVar(vars, saveAs, value)
  log(`Generated ${kind} → ${saveAs}=${value}`)
  return {}
}

/**
 * Apply a single text / number / JSON transform to an input value and store the
 * result in a variable. Pure and synchronous — throws only on invalid numeric input.
 */
export function applyTransform(
  op: TransformOp,
  input: string,
  arg: string,
  arg2: string,
): string {
  const num = (s: string): number => {
    const n = Number(s.trim())
    if (s.trim() === '' || !Number.isFinite(n)) {
      throw new Error(`"${s}" is not a number`)
    }
    return n
  }
  switch (op) {
    case 'upper':
      return input.toUpperCase()
    case 'lower':
      return input.toLowerCase()
    case 'trim':
      return input.trim()
    case 'length':
      return String(input.length)
    case 'replace':
      return arg === '' ? input : input.split(arg).join(arg2)
    case 'slice': {
      const start = arg.trim() === '' ? 0 : Math.trunc(num(arg))
      const end = arg2.trim() === '' ? undefined : Math.trunc(num(arg2))
      return input.slice(start, end)
    }
    case 'prefix':
      return arg + input
    case 'suffix':
      return input + arg
    case 'padStart': {
      const len = Math.max(0, Math.trunc(num(arg)))
      const pad = arg2 === '' ? '0' : arg2
      return input.padStart(len, pad)
    }
    case 'default':
      return input.trim() === '' ? arg : input
    case 'jsonExtract': {
      let parsed: unknown
      try {
        parsed = JSON.parse(input)
      } catch {
        throw new Error('Input is not valid JSON')
      }
      return extractJsonPath(parsed, arg)
    }
    case 'regexExtract': {
      if (!arg) throw new Error('Regex pattern is required')
      let re: RegExp
      try {
        re = new RegExp(arg)
      } catch (e: any) {
        throw new Error(`Invalid regex: ${e?.message ?? e}`)
      }
      const m = re.exec(input)
      if (!m) return ''
      const groupIdx = arg2.trim() === '' ? (m.length > 1 ? 1 : 0) : Math.max(0, Math.trunc(num(arg2)))
      return m[groupIdx] ?? ''
    }
    case 'base64Encode': {
      const bytes = new TextEncoder().encode(input)
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
      return btoa(bin)
    }
    case 'base64Decode': {
      let bin: string
      try {
        bin = atob(input.trim())
      } catch {
        throw new Error('Input is not valid Base64')
      }
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder().decode(bytes)
    }
    case 'urlEncode':
      return encodeURIComponent(input)
    case 'urlDecode':
      try {
        return decodeURIComponent(input)
      } catch {
        throw new Error('Input is not valid URL-encoded text')
      }
    case 'decodeEpc': {
      const decoded = EPCDecoder.decodeSgtin96(input.trim())
      if (decoded.error) throw new Error(decoded.error)
      return JSON.stringify(decoded)
    }
    case 'round':
      return String(Math.round(num(input)))
    case 'floor':
      return String(Math.floor(num(input)))
    case 'ceil':
      return String(Math.ceil(num(input)))
    case 'abs':
      return String(Math.abs(num(input)))
    case 'add':
      return String(num(input) + num(arg))
    case 'subtract':
      return String(num(input) - num(arg))
    case 'multiply':
      return String(num(input) * num(arg))
    case 'divide': {
      const d = num(arg)
      if (d === 0) throw new Error('Division by zero')
      return String(num(input) / d)
    }
    case 'modulo': {
      const d = num(arg)
      if (d === 0) throw new Error('Modulo by zero')
      return String(num(input) % d)
    }
    case 'toFixed':
      return num(input).toFixed(Math.max(0, Math.min(20, Math.trunc(num(arg)))))
    case 'toProperties': {
      let items: string[] = []
      const trimmed = input.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            items = parsed.map(String)
          } else {
            items = [trimmed]
          }
        } catch {
          items = trimmed.split(/[\r\n,]+/)
        }
      } else {
        items = trimmed.split(/[\r\n,]+/)
      }
      const unique = Array.from(new Set(items.map(s => s.trim()).filter(Boolean)))
      return unique.map((e) => `${e}={}`).join(', ')
    }
    default:
      return input
  }
}

export async function executeTransform(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const op = step.params.transformOp ?? 'trim'
  const saveAs = (step.params.transformSaveAs || '').trim()
  if (!saveAs) throw new Error('Transform: save-as variable name is required')
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  const input = applyTemplate(step.params.transformInput || '', vars)
  const arg = applyTemplate(step.params.transformArg || '', vars)
  const arg2 = applyTemplate(step.params.transformArg2 || '', vars)

  let result: string
  if (op === 'decodeEpc' && typeof window !== 'undefined' && window.electronAPI?.tdtTranslate) {
    try {
      const tdt = await window.electronAPI.tdtTranslate(input.trim(), { outputLevel: 'PURE_IDENTITY' })
      if (tdt?.ok && tdt.outputs) {
        const local = EPCDecoder.decodeSgtin96(input.trim())
        result = JSON.stringify({
          ...(local.error ? {} : local),
          pureIdentity: tdt.outputs.PURE_IDENTITY ?? tdt.outputs.TAG_ENCODING,
          scheme: tdt.scheme,
          fields: tdt.fields,
        })
      } else {
        result = applyTransform(op, input, arg, arg2)
      }
    } catch {
      result = applyTransform(op, input, arg, arg2)
    }
  } else {
    result = applyTransform(op, input, arg, arg2)
  }

  setVar(vars, saveAs, result)
  const shown = result.length > 120 ? result.slice(0, 120) + '…' : result
  log(`Transform (${op}) → ${saveAs}=${shown}`)
  return {}
}

/** Documentation-only node — no runtime effect. */
export async function executeComment(
  _step: AutomationStep,
  _vars: AutomationVars,
  _log: BlockLog,
): Promise<BlockExecResult> {
  return {}
}

function matchesSimpleGlob(name: string, filter?: string): boolean {
  if (!filter?.trim()) return true
  const patterns = filter
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (patterns.length === 0) return true
  return patterns.some((pat) => {
    const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`, 'i').test(name)
  })
}

export async function executeFileRead(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const location = step.params.fileLocation || step.params.fileStorageProvider || 'local'
  const rawPath = applyTemplate(step.params.filePath || '', vars).trim()
  if (!rawPath) throw new Error('File Read: File path is required')

  const encoding = (step.params.fileEncoding || 'utf-8') as 'utf-8' | 'utf8' | 'base64' | 'json' | 'hex'
  const saveAs = (step.params.fileSaveAs || 'fileContent').trim()
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  log(`File Read [${location}]: ${rawPath} (${encoding})`)

  if (location === 'local') {
    if (!api.localReadFile) throw new Error('Local file operations require Electron environment')
    const enc = encoding === 'base64' ? 'base64' : 'utf-8'
    const result = await api.localReadFile(rawPath, enc)
    if (!result.ok || result.content === undefined) throw new Error(result.error || 'Failed to read file')

    let content = result.content
    if (encoding === 'hex') {
      const bytes = new TextEncoder().encode(result.content)
      content = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    } else if (encoding === 'json') {
      try {
        const parsed = JSON.parse(result.content)
        content = JSON.stringify(parsed)
      } catch (err: any) {
        throw new Error(`File Read: Failed to parse JSON: ${err.message}`)
      }
    }

    const size = new TextEncoder().encode(content).byteLength
    setVar(vars, saveAs, content)
    setVar(vars, `${saveAs}Size`, String(size))
    const preview = content.length > 80 ? content.slice(0, 80) + '…' : content
    log(`Read OK: ${size} bytes → ${saveAs}="${preview}"`)
    return {}
  }

  if (location === 'sftp' || location === 'ftp' || location === 's3') {
    const sessionId = applyTemplate(step.params.fileConnectionId || '', vars).trim() || `default:${location}`
    const result = await api.sftpReadFile(sessionId, rawPath)
    if (!result.ok) throw new Error(result.error)

    let content = ''
    if ('previewBase64' in result && result.previewBase64) {
      if (encoding === 'base64') content = result.previewBase64
      else {
        const bin = atob(result.previewBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        if (encoding === 'hex') content = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
        else content = new TextDecoder().decode(bytes)
      }
    } else if ('text' in result && result.text !== undefined) {
      if (encoding === 'base64') {
        const bytes = new TextEncoder().encode(result.text)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
        content = btoa(bin)
      } else if (encoding === 'hex') {
        const bytes = new TextEncoder().encode(result.text)
        content = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      } else {
        content = result.text
      }
    }
    if (encoding === 'json') {
      try {
        content = JSON.stringify(JSON.parse(content))
      } catch (err: any) {
        throw new Error(`File Read: Failed to parse JSON: ${err.message}`)
      }
    }

    setVar(vars, saveAs, content)
    setVar(vars, `${saveAs}Size`, String(result.size ?? content.length))
    const preview = content.length > 80 ? content.slice(0, 80) + '…' : content
    log(`${location.toUpperCase()} Read OK: ${result.size ?? content.length} bytes → ${saveAs}="${preview}"`)
    return {}
  }

  throw new Error(`File Read: Storage location "${location}" is not supported`)
}

export async function executeFileWrite(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const location = step.params.fileLocation || step.params.fileStorageProvider || 'local'
  const rawPath = applyTemplate(step.params.filePath || '', vars).trim()
  if (!rawPath) throw new Error('File Write: Destination file path is required')

  const content = applyTemplate(step.params.fileContent || '', vars)
  const isAppend = step.params.fileAppend === true
  const saveAs = (step.params.fileSaveAs || '').trim()

  log(`File Write [${location}]: ${rawPath} (${isAppend ? 'append' : 'overwrite'}, ${content.length} chars)`)

  if (location === 'local') {
    if (!api.localWriteFile) throw new Error('Local file operations require Electron environment')
    let textToWrite = content
    if (isAppend && api.localReadFile) {
      const prev = await api.localReadFile(rawPath, 'utf-8')
      if (prev.ok && prev.content) {
        textToWrite = prev.content + textToWrite
      }
    }
    const result = await api.localWriteFile(rawPath, textToWrite, 'utf-8')
    if (!result.ok) throw new Error(result.error)

    const bytesWritten = new TextEncoder().encode(textToWrite).byteLength
    if (saveAs && isValidVarName(saveAs)) {
      setVar(vars, saveAs, String(bytesWritten))
    }
    log(`Write OK: ${bytesWritten} bytes written to ${rawPath}`)
    return {}
  }

  if (location === 'sftp' || location === 'ftp' || location === 's3') {
    const sessionId = applyTemplate(step.params.fileConnectionId || '', vars).trim() || `default:${location}`
    let textToWrite = content
    if (isAppend) {
      const existing = await api.sftpReadFile(sessionId, rawPath)
      if (existing.ok) {
        let prevText = ''
        if ('text' in existing && existing.text) prevText = existing.text
        else if ('previewBase64' in existing && existing.previewBase64) {
          const bin = atob(existing.previewBase64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          prevText = new TextDecoder().decode(bytes)
        }
        textToWrite = prevText + textToWrite
      }
    }
    const result = await api.sftpWriteTextFile(sessionId, rawPath, textToWrite)
    if (!result.ok) throw new Error(result.error)

    if (saveAs && isValidVarName(saveAs)) {
      setVar(vars, saveAs, 'OK')
    }
    log(`${location.toUpperCase()} Write OK: ${textToWrite.length} chars written to ${rawPath}`)
    return {}
  }

  throw new Error(`File Write: Storage location "${location}" is not supported`)
}

export async function executeFileList(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const location = step.params.fileLocation || step.params.fileStorageProvider || 'local'
  const rawPath = applyTemplate(step.params.filePath || '', vars).trim()
  if (!rawPath) throw new Error('File List: Directory path is required')

  const filter = applyTemplate(step.params.fileFilter || step.params.filePattern || '', vars).trim() || undefined
  const saveAs = (step.params.fileSaveAs || step.params.fileSaveListAs || 'fileList').trim()
  if (!isValidVarName(saveAs)) throw new Error(`Invalid variable name: ${saveAs}`)

  log(`File List [${location}]: ${rawPath}${filter ? ` (filter: ${filter})` : ''}`)

  if (location === 'local') {
    if (!api.localListFiles) throw new Error('Local file operations require Electron environment')
    const result = await api.localListFiles(rawPath, filter)
    if (!result.ok || !result.files) throw new Error(result.error || 'Failed to list directory')

    const filePaths = result.files
    const fileNames = result.filenames || filePaths.map((p) => p.split(/[\\/]/).pop() || p)

    setVar(vars, saveAs, JSON.stringify(fileNames))
    setVar(vars, `${saveAs}Count`, String(fileNames.length))
    setVar(vars, `${saveAs}Paths`, JSON.stringify(filePaths))

    log(`List OK: Found ${fileNames.length} file(s) in ${rawPath} → ${saveAs}`)
    return {}
  }

  if (location === 'sftp' || location === 'ftp' || location === 's3') {
    const sessionId = applyTemplate(step.params.fileConnectionId || '', vars).trim() || `default:${location}`
    const result = await api.sftpReaddir(sessionId, rawPath)
    if (!result.ok) throw new Error(result.error)

    const entries = result.entries.filter(
      (e) => e.name !== '.' && e.name !== '..' && matchesSimpleGlob(e.name, filter),
    )
    const fileNames = entries.map((e) => e.name)
    const cleanBase = rawPath.replace(/\/+$/, '')
    const filePaths = entries.map((e) => `${cleanBase}/${e.name}`)

    setVar(vars, saveAs, JSON.stringify(fileNames))
    setVar(vars, `${saveAs}Count`, String(entries.length))
    setVar(vars, `${saveAs}Paths`, JSON.stringify(filePaths))

    log(`${location.toUpperCase()} List OK: Found ${entries.length} entry/entries in ${rawPath} → ${saveAs}`)
    return {}
  }

  throw new Error(`File List: Storage location "${location}" is not supported`)
}

/**
 * Full TCP node execution matching the Hercules-style TCP Client & TCP Server tab:
 * supports one-shot send (ASCII/HEX + EOL + optional reply capture), persistent TCP Client
 * (connect / send + await reply / disconnect), and built-in TCP Server (start / broadcast / wait RX / stop).
 */
export async function executeTcpNode(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
  signal: AbortSignal | undefined,
  fallbackHost: string,
  fallbackPort: string,
): Promise<BlockExecResult> {
  const api = requireElectron()
  const mode: TcpNodeMode = step.params.tcpMode ?? 'oneshot'
  const hex = step.params.tcpHex === true
  const lineEnding: TcpLineEnding = hex ? 'none' : (step.params.tcpLineEnding ?? 'crlf')
  const timeoutMs = Math.max(200, Math.min(120000, step.params.tcpTimeoutMs ?? 3000))
  const saveAs = (step.params.tcpSaveResponseAs || '').trim()

  const resolveHost = (defaultHost: string) =>
    applyTemplate(step.params.tcpHost || '', vars).trim() || defaultHost

  const resolvePort = (defaultPort: string) => {
    const raw = applyTemplate(step.params.port || defaultPort || '', vars).trim()
    const num = parseInt(raw, 10)
    if (!Number.isFinite(num) || num < 1 || num > 65535) {
      throw new Error(`Invalid TCP port: "${raw}"`)
    }
    return num
  }

  const storeRx = (text: string, hexStr: string, extras?: Record<string, string>) => {
    setVar(vars, 'lastTcpResponse', text)
    if (saveAs && isValidVarName(saveAs)) {
      setVar(vars, saveAs, text)
      setVar(vars, `${saveAs}_hex`, hexStr)
      if (extras) {
        for (const [k, v] of Object.entries(extras)) setVar(vars, `${saveAs}_${k}`, v)
      }
    }
  }

  switch (mode) {
    case 'client_connect': {
      if (!api.tcpClientConnect) throw new Error('TCP Client requires the desktop app')
      const targetHost = resolveHost(fallbackHost)
      if (!targetHost) throw new Error('TCP Client Connect: host is empty')
      const portNum = resolvePort(fallbackPort || '12345')
      log(`TCP Client connecting → ${targetHost}:${portNum}…`)
      const res = await api.tcpClientConnect(targetHost, portNum)
      if (!res.ok) throw new Error(res.error || 'TCP Client connect failed')
      log(`TCP Client connected to ${targetHost}:${portNum}`)
      return {}
    }

    case 'client_disconnect': {
      if (!api.tcpClientDisconnect) throw new Error('TCP Client requires the desktop app')
      await api.tcpClientDisconnect()
      log('TCP Client disconnected')
      return {}
    }

    case 'client_send': {
      if (!api.tcpClientSend) throw new Error('TCP Client requires the desktop app')
      const payload = applyTemplate(step.params.message || '', vars)
      if (!payload) throw new Error('TCP Client Send: payload is empty')
      const waitReply = step.params.tcpWaitForResponse === true

      let waitPromise: Promise<{ text: string; hex: string }> | null = null
      const cleanupRef: { fn?: () => void } = {}

      if (waitReply && api.onTcpClientData) {
        waitPromise = new Promise((resolve, reject) => {
          let settled = false
          const unsub = api.onTcpClientData!((evt) => {
            if (settled) return
            settled = true
            cleanup()
            resolve({ text: evt.text, hex: evt.hex })
          })
          const timer = setTimeout(() => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error(`Timed out waiting for TCP Client reply (${timeoutMs}ms)`))
          }, timeoutMs)
          const onAbort = () => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error('Aborted'))
          }
          const cleanup = () => {
            clearTimeout(timer)
            unsub()
            signal?.removeEventListener('abort', onAbort)
          }
          cleanupRef.fn = cleanup
          signal?.addEventListener('abort', onAbort, { once: true })
        })
      }

      const sendRes = await api.tcpClientSend(payload, { hex, lineEnding })
      if (!sendRes.ok) {
        cleanupRef.fn?.()
        throw new Error(sendRes.error || 'TCP Client send failed')
      }
      log(`TCP Client TX (${sendRes.byteLength ?? 0}B${hex ? ' HEX' : ''}): ${payload.slice(0, 140)}`)

      if (waitPromise) {
        const reply = await waitPromise
        storeRx(reply.text, reply.hex)
        log(`TCP Client RX: ${reply.text.trim().slice(0, 160) || reply.hex}`)
      }
      return {}
    }

    case 'server_start': {
      if (!api.tcpServerStart) throw new Error('TCP Server requires the desktop app')
      const bindHost = resolveHost('0.0.0.0')
      const portNum = resolvePort('9000')
      const cur = await api.tcpServerStatus?.()
      if (cur?.running && cur.port === portNum) {
        log(`TCP Server already listening on ${cur.host}:${cur.port}`)
        return {}
      }
      if (cur?.running) {
        await api.tcpServerStop?.()
      }
      const res = await api.tcpServerStart(portNum, bindHost)
      if (!res.ok) throw new Error(res.error || 'Failed to start TCP Server')
      log(`TCP Server listening on ${bindHost}:${portNum}`)
      return {}
    }

    case 'server_stop': {
      if (!api.tcpServerStop) throw new Error('TCP Server requires the desktop app')
      await api.tcpServerStop()
      log('TCP Server stopped')
      return {}
    }

    case 'server_send': {
      if (!api.tcpServerSend) throw new Error('TCP Server requires the desktop app')
      const payload = applyTemplate(step.params.message || '', vars)
      if (!payload) throw new Error('TCP Server Send: payload is empty')
      const clientId = applyTemplate(step.params.tcpClientId || 'all', vars).trim() || 'all'
      const res = await api.tcpServerSend(payload, { clientId, hex, lineEnding })
      if (!res.ok) throw new Error(res.error || 'TCP Server send failed')
      if (saveAs && isValidVarName(saveAs)) {
        setVar(vars, saveAs, String(res.sentCount ?? 0))
      }
      log(
        `TCP Server TX → ${res.sentCount ?? 0} client(s) (${res.byteLength ?? 0}B${hex ? ' HEX' : ''}): ${payload.slice(0, 140)}`,
      )
      return {}
    }

    case 'server_wait': {
      if (!api.onTcpServerData) throw new Error('TCP Server requires the desktop app')
      const targetClientId = applyTemplate(step.params.tcpClientId || '', vars).trim()
      const rxTargetVar = saveAs || 'tcpRx'
      log(`TCP Server waiting for incoming data (timeout ${timeoutMs}ms)…`)

      const evt = await new Promise<{
        clientId: string
        address: string
        port: number
        text: string
        hex: string
        byteLength: number
      }>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Aborted'))
          return
        }
        let settled = false
        const unsub = api.onTcpServerData!((data) => {
          if (settled) return
          if (targetClientId && targetClientId !== 'all' && data.clientId !== targetClientId) return
          settled = true
          cleanup()
          resolve(data)
        })
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error(`TCP Server timed out waiting for data (${timeoutMs}ms)`))
        }, timeoutMs)
        const onAbort = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error('Aborted'))
        }
        const cleanup = () => {
          clearTimeout(timer)
          unsub()
          signal?.removeEventListener('abort', onAbort)
        }
        signal?.addEventListener('abort', onAbort, { once: true })
      })

      setVar(vars, 'lastTcpResponse', evt.text)
      if (isValidVarName(rxTargetVar)) {
        setVar(vars, rxTargetVar, evt.text)
        setVar(vars, `${rxTargetVar}_hex`, evt.hex)
        setVar(vars, `${rxTargetVar}_clientId`, evt.clientId)
        setVar(vars, `${rxTargetVar}_address`, evt.address)
      }
      log(`TCP Server RX from ${evt.address}:${evt.port} (${evt.byteLength}B) → ${rxTargetVar}`)
      return {}
    }

    case 'oneshot':
    default: {
      const targetHost = resolveHost(fallbackHost)
      if (!targetHost) throw new Error('Host not configured')
      const portNum = resolvePort(fallbackPort || '12345')
      const payload = applyTemplate(step.params.message || '', vars)
      if (!payload.trim()) throw new Error('TCP message is empty')

      if (api.tcpClientSendOnce) {
        const waitForResponse = step.params.tcpWaitForResponse === true
        log(`TCP → ${targetHost}:${portNum} (${hex ? 'HEX' : lineEnding.toUpperCase()})${waitForResponse ? ' [await reply]' : ''}`)
        const res = await api.tcpClientSendOnce(targetHost, portNum, payload, {
          hex,
          lineEnding,
          waitForResponse,
          timeoutMs,
        })
        if (!res.ok) throw new Error(res.error || 'TCP send failed')
        if (waitForResponse && res.responseText !== undefined) {
          storeRx(res.responseText, res.responseHex ?? '')
          log(`TCP RX: ${res.responseText.trim().slice(0, 160) || res.responseHex}`)
        } else {
          log(`TCP sent ${res.byteLength ?? 0}B to ${targetHost}:${portNum}`)
        }
        return {}
      }

      // Legacy fallback when preload predates tcpClientSendOnce
      await new Promise<void>((resolve, reject) => {
        api.onCustomSuccess((msg) => { log(`TCP OK: ${msg}`); resolve() })
        api.onCustomError((err) => { reject(new Error(err)) })
        api.customSend(targetHost, portNum, payload)
      })
      return {}
    }
  }
}

