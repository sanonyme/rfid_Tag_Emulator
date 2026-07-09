import type { AutomationStep } from './automation-types'
import type { AutomationVars } from './automation-template'
import {
  applyTemplate,
  cellFromRows,
  setVar,
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
  const value = applyTemplate(step.params.varValue || '', vars)
  setVar(vars, name, value)
  log(`Set ${name} = ${value.length > 120 ? value.slice(0, 120) + '…' : value}`)
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
