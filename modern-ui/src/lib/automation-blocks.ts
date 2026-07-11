import type { AutomationStep, GenerateKind, TransformOp } from './automation-types'
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
  const argsRaw = applyTemplate(step.params.scriptArgs || '', vars)
  const args = argsRaw
    .split(/\s+/)
    .map((a) => a.trim())
    .filter(Boolean)

  log(inline ? 'Running inline script…' : `Running script: ${step.params.scriptPath}`)
  const result = await api.automationRunScript({
    inline,
    inlineScript: inline ? applyTemplate(step.params.scriptInlineText || '', vars) : undefined,
    scriptPath: inline ? undefined : applyTemplate(step.params.scriptPath || '', vars),
    args,
    env,
    timeoutMs: step.params.scriptTimeoutMs,
  })
  if (!result.ok) throw new Error(result.error)

  const saveAs = (step.params.scriptSaveStdoutAs || '').trim()
  if (saveAs) setVar(vars, saveAs, result.stdout.trim())

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
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? applyTemplate(step.params.httpBody || '', vars) : undefined

  const options: Record<string, unknown> = { method, headers }
  if (hasBody && body) options.body = body
  if (typeof step.params.httpTimeoutMs === 'number') options.timeoutMs = step.params.httpTimeoutMs

  log(`HTTP ${method} ${url}`)
  const res = await api.aleRequest(url, options)

  const statusAs = (step.params.httpSaveStatusAs || '').trim()
  if (statusAs) setVar(vars, statusAs, String(res.status))

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

/** Run a Code node — JavaScript only (in-process). Legacy `java` steps get a clear error. */
export async function executeCode(
  step: AutomationStep,
  vars: AutomationVars,
  log: BlockLog,
): Promise<BlockExecResult> {
  const language = step.params.codeLanguage ?? 'javascript'
  const source = step.params.codeSource ?? ''
  if (!source.trim()) throw new Error('Code is empty')

  if (language === 'java') {
    throw new Error(
      'Java Code nodes were removed. Switch this node to JavaScript, or use Run Script for external tools.',
    )
  }
  if (language !== 'javascript') {
    throw new Error(`Unsupported code language: ${language}`)
  }
  return runJavaScriptCode(source, vars, log)
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

  const result = applyTransform(op, input, arg, arg2)
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
