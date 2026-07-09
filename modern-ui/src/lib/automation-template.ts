/** Template interpolation helpers for automation building blocks. */

import type { ConditionOp } from './automation-types'

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
