/** Template interpolation helpers for automation building blocks. */

import type { ConditionOp, VarType, SwitchCase } from './automation-types'

export type AutomationVars = Record<string, string>

const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

/** Replace `{{name}}` placeholders. Unknown keys become empty string. */
export function applyTemplate(input: string, vars: AutomationVars): string {
  if (!input) return ''
  return input.replace(TEMPLATE_RE, (_m, key: string) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

/** Parse a string to a finite number, or null if it isn't numeric. */
function toNumber(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Evaluate a CONDITION node's expression against the current run variables.
 * Both operands are templated first. Numeric operators (`gt`/`gte`/`lt`/`lte`)
 * coerce to numbers and return false when either side isn't numeric.
 * `eq`/`neq` compare numerically when both sides are numbers, otherwise as
 * strings (respecting `condCaseSensitive`). Never throws — an invalid regex
 * simply yields false.
 */
export function evaluateCondition(
  params: {
    condLeft?: string
    condOp?: ConditionOp
    condRight?: string
    condCaseSensitive?: boolean
  },
  vars: AutomationVars,
): boolean {
  const op: ConditionOp = params.condOp ?? 'eq'
  const caseSensitive = params.condCaseSensitive === true
  const rawLeft = applyTemplate(params.condLeft ?? '', vars)
  const rawRight = applyTemplate(params.condRight ?? '', vars)
  const left = caseSensitive ? rawLeft : rawLeft.toLowerCase()
  const right = caseSensitive ? rawRight : rawRight.toLowerCase()
  const numLeft = toNumber(rawLeft)
  const numRight = toNumber(rawRight)

  switch (op) {
    case 'eq':
      return numLeft !== null && numRight !== null ? numLeft === numRight : left === right
    case 'neq':
      return numLeft !== null && numRight !== null ? numLeft !== numRight : left !== right
    case 'gt':
      return numLeft !== null && numRight !== null && numLeft > numRight
    case 'gte':
      return numLeft !== null && numRight !== null && numLeft >= numRight
    case 'lt':
      return numLeft !== null && numRight !== null && numLeft < numRight
    case 'lte':
      return numLeft !== null && numRight !== null && numLeft <= numRight
    case 'contains':
      return left.includes(right)
    case 'notContains':
      return !left.includes(right)
    case 'startsWith':
      return left.startsWith(right)
    case 'endsWith':
      return left.endsWith(right)
    case 'matches':
      try {
        return new RegExp(rawRight, caseSensitive ? '' : 'i').test(rawLeft)
      } catch {
        return false
      }
    case 'isEmpty':
      return rawLeft.trim() === ''
    case 'isNotEmpty':
      return rawLeft.trim() !== ''
    case 'isTrue': {
      const v = rawLeft.trim().toLowerCase()
      return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'null' && v !== 'undefined'
    }
    case 'isFalse': {
      const v = rawLeft.trim().toLowerCase()
      return v === '' || v === '0' || v === 'false' || v === 'no' || v === 'null' || v === 'undefined'
    }
    default:
      return false
  }
}

/**
 * Resolve which output port a SWITCH node routes through. Compares the (templated)
 * switch value against each (templated) case value by equality; the first match
 * wins and returns `case-<i>`. No match returns `default`.
 */
export function switchHandle(
  params: {
    switchValue?: string
    switchCases?: SwitchCase[]
    switchCaseSensitive?: boolean
  },
  vars: AutomationVars,
): string {
  const caseSensitive = params.switchCaseSensitive === true
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase())
  const target = norm(applyTemplate(params.switchValue ?? '', vars))
  const cases = params.switchCases ?? []
  for (let i = 0; i < cases.length; i++) {
    if (norm(applyTemplate(cases[i]?.value ?? '', vars)) === target) return `case-${i}`
  }
  return 'default'
}

/**
 * Pick a weighted-random index. `r` is a random number in [0, 1) (injected for
 * testability). Non-positive weights are treated as 0; an all-zero list picks the
 * first branch.
 */
export function pickWeightedIndex(weights: number[], r: number): number {
  if (weights.length === 0) return 0
  const clamped = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  const total = clamped.reduce((a, w) => a + w, 0)
  if (total <= 0) return 0
  const target = Math.min(Math.max(r, 0), 0.999999) * total
  let acc = 0
  for (let i = 0; i < clamped.length; i++) {
    acc += clamped[i]
    if (target < acc) return i
  }
  return clamped.length - 1
}

/**
 * Split a templated list into items.
 * Prefers JSON arrays; otherwise newlines; otherwise commas.
 */
export function parseListItems(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr)) {
        return arr.map((x) => (x === null || x === undefined ? '' : String(x))).filter((s) => s !== '')
      }
    } catch {
      /* fall through */
    }
  }
  if (/\r?\n/.test(t)) {
    return t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  }
  return t.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Soft stop signal from a STOP node — not a failure.
 * `scope: 'sequence'` ends the current sequence; `'run'` ends the whole automation.
 */
export class AutomationStopSignal extends Error {
  readonly scope: 'sequence' | 'run'
  constructor(scope: 'sequence' | 'run', message?: string) {
    super(message || 'Stopped')
    this.name = 'AutomationStopSignal'
    this.scope = scope
  }
}

export type StandardVarGroup = 'connection' | 'tags' | 'ocr' | 'script'

export interface StandardAutomationVar {
  name: string
  label: string
  description: string
  group: StandardVarGroup
  /** Env name passed to Run Script (ZEUS_*) */
  envName: string
  /** When this variable is typically set */
  setBy: string
}

/** App-owned variables users can insert without guessing names. */
export const STANDARD_AUTOMATION_VARS: StandardAutomationVar[] = [
  {
    name: 'host',
    label: 'Host',
    description: 'Connected reader / emulator host IP',
    group: 'connection',
    envName: 'ZEUS_HOST',
    setBy: 'Start of every run',
  },
  {
    name: 'alePort',
    label: 'ALE port',
    description: 'Edge ALE port from connection bar',
    group: 'connection',
    envName: 'ZEUS_ALEPORT',
    setBy: 'Start of every run',
  },
  {
    name: 'customPort',
    label: 'Custom port',
    description: 'Custom message port from connection / Custom tab',
    group: 'connection',
    envName: 'ZEUS_CUSTOMPORT',
    setBy: 'Start of every run',
  },
  {
    name: 'port',
    label: 'Port',
    description: 'Generic port seed (often empty unless set)',
    group: 'connection',
    envName: 'ZEUS_PORT',
    setBy: 'Start of every run',
  },
  {
    name: 'epc',
    label: 'First EPC',
    description: 'First unique EPC from the last Fixed / Handheld send',
    group: 'tags',
    envName: 'ZEUS_EPC',
    setBy: 'After Fixed or Handheld tag step',
  },
  {
    name: 'epcs',
    label: 'All EPCs',
    description: 'All unique EPCs, one per line — paste into EPC List fields',
    group: 'tags',
    envName: 'ZEUS_EPCS',
    setBy: 'After Fixed or Handheld tag step',
  },
  {
    name: 'epcsSql',
    label: 'EPCs for SQL IN',
    description: "Quoted list for SQL: WHERE epc IN ({{epcsSql}})",
    group: 'tags',
    envName: 'ZEUS_EPCSSQL',
    setBy: 'After Fixed or Handheld tag step',
  },
  {
    name: 'tagCount',
    label: 'Tag count',
    description: 'Number of unique EPCs from the last Fixed / Handheld send',
    group: 'tags',
    envName: 'ZEUS_TAGCOUNT',
    setBy: 'After Fixed or Handheld tag step',
  },
  {
    name: 'lastOcrResponse',
    label: 'Last OCR response',
    description: 'Success message returned by the last OCR step',
    group: 'ocr',
    envName: 'ZEUS_LASTOCRRESPONSE',
    setBy: 'After OCR step',
  },
]

export const STANDARD_VAR_GROUP_LABELS: Record<StandardVarGroup, string> = {
  connection: 'Connection',
  tags: 'After tag send',
  ocr: 'After OCR',
  script: 'Scripts',
}

export function templateToken(name: string): string {
  return `{{${name}}}`
}

/** Seed context vars from host / ports / last step outputs. */
export function createRunContext(seed: {
  host?: string
  port?: string
  alePort?: string
  customPort?: string
}): AutomationVars {
  return {
    host: seed.host ?? '',
    port: seed.port ?? '',
    alePort: seed.alePort ?? '',
    customPort: seed.customPort ?? '',
  }
}

export function setVar(vars: AutomationVars, name: string, value: string): void {
  const key = name.trim()
  if (!key || !/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(key)) {
    throw new Error(`Invalid variable name: ${name}`)
  }
  vars[key] = value
}

/** True when `name` is a valid variable identifier. */
export function isValidVarName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(name.trim())
}

/**
 * Validate and canonicalize a variable value for its declared type. Variables are
 * always stored as strings (so templating stays simple), but numbers, booleans and
 * JSON are normalized to a consistent string form and rejected when invalid.
 */
export function coerceToType(value: string, type?: VarType): string {
  switch (type) {
    case 'number': {
      const n = Number(value.trim())
      if (value.trim() === '' || !Number.isFinite(n)) {
        throw new Error(`"${value}" is not a valid number`)
      }
      return String(n)
    }
    case 'integer': {
      const n = Number(value.trim())
      if (value.trim() === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`"${value}" is not a valid integer`)
      }
      return String(n)
    }
    case 'boolean': {
      const v = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(v)) return 'true'
      if (['false', '0', 'no', 'off', ''].includes(v)) return 'false'
      throw new Error(`"${value}" is not a valid boolean`)
    }
    case 'array': {
      // Accept a JSON array as-is, or split a plain comma/newline list into a string array.
      const trimmed = value.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return JSON.stringify(parsed)
        } catch {
          /* fall through to list parsing */
        }
      }
      if (trimmed === '') return '[]'
      const items = trimmed
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter((s) => s !== '')
      return JSON.stringify(items)
    }
    case 'object': {
      try {
        const parsed = JSON.parse(value)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object')
        }
        return JSON.stringify(parsed)
      } catch {
        throw new Error('Value is not a valid JSON object')
      }
    }
    case 'json': {
      try {
        return JSON.stringify(JSON.parse(value))
      } catch {
        throw new Error('Value is not valid JSON')
      }
    }
    default:
      return value
  }
}

/** Canonical string form of any JS value for storing back into AutomationVars. */
export function stringifyVarValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Extract a cell from query result rows for variable capture. */
export function cellFromRows(
  rows: Record<string, unknown>[],
  column?: string,
  rowIndex = 0,
): string {
  if (!rows.length) return ''
  const row = rows[Math.max(0, rowIndex)]
  if (!row) return ''
  if (column && column in row) {
    const v = row[column]
    return v === null || v === undefined ? '' : String(v)
  }
  const firstKey = Object.keys(row)[0]
  if (!firstKey) return ''
  const v = row[firstKey]
  return v === null || v === undefined ? '' : String(v)
}

/**
 * After a Fixed/Handheld send, store EPCs for later steps:
 * - epc: first EPC
 * - epcs: unique EPCs, one per line (paste into EPC List / scripts)
 * - epcsSql: quoted list for SQL IN ({{epcsSql}}) → 'A','B','C'
 * - tagCount: number of unique EPCs
 */
export function captureEpcsToVars(vars: AutomationVars, epcs: string[]): void {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of epcs) {
    const e = String(raw || '').trim()
    if (!e || seen.has(e)) continue
    seen.add(e)
    unique.push(e)
  }
  vars.epc = unique[0] ?? ''
  vars.epcs = unique.join('\n')
  vars.epcsSql = unique.map((e) => `'${e.replace(/'/g, "''")}'`).join(',')
  vars.tagCount = String(unique.length)
}
