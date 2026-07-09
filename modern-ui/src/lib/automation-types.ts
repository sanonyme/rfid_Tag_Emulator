export type ActionType =
  | 'DELAY'
  | 'OCR'
  | 'FIXED_TAG'
  | 'HANDHELD_TAG'
  | 'CUSTOM_MESSAGE'
  | 'EDGE_BLOCK'
  | 'EDGE_PROCESS'
  | 'SET_VARIABLE'
  | 'DB_QUERY'
  | 'DB_EXEC'
  | 'RUN_SCRIPT'
  | 'HTTP_REQUEST'
  | 'CALL_SEQUENCE'
  | 'CONDITION'
  | 'LOG'

export type EdgeProcessAction = 'start' | 'stop'

/** HTTP verbs supported by the HTTP Request node. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

/**
 * Comparison operators for the CONDITION node.
 * Both operands support `{{variable}}` templating; numeric operators coerce to
 * numbers, the rest compare as strings (see `evaluateCondition`).
 */
export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'isTrue'
  | 'isFalse'

/** UI metadata for condition operators. `needsRight: false` ops ignore the right operand. */
export const CONDITION_OPS: { value: ConditionOp; label: string; needsRight: boolean }[] = [
  { value: 'eq', label: 'equals (=)', needsRight: true },
  { value: 'neq', label: 'not equals (≠)', needsRight: true },
  { value: 'gt', label: 'greater than (>)', needsRight: true },
  { value: 'gte', label: 'greater or equal (≥)', needsRight: true },
  { value: 'lt', label: 'less than (<)', needsRight: true },
  { value: 'lte', label: 'less or equal (≤)', needsRight: true },
  { value: 'contains', label: 'contains', needsRight: true },
  { value: 'notContains', label: 'does not contain', needsRight: true },
  { value: 'startsWith', label: 'starts with', needsRight: true },
  { value: 'endsWith', label: 'ends with', needsRight: true },
  { value: 'matches', label: 'matches regex', needsRight: true },
  { value: 'isEmpty', label: 'is empty', needsRight: false },
  { value: 'isNotEmpty', label: 'is not empty', needsRight: false },
  { value: 'isTrue', label: 'is true / non-zero', needsRight: false },
  { value: 'isFalse', label: 'is false / zero / empty', needsRight: false },
]

export type LogLevel = 'info' | 'warn' | 'error'

export interface AutomationStep {
  id: string
  type: ActionType
  name: string
  position?: { x: number; y: number }
  params: {
    duration?: number
    message?: string
    port?: string
    epc?: string
    upc?: string
    count?: number
    startSerial?: number
    /** When true, SGTIN serial continues across UPC lines in upcList. */
    serialContinuesAcrossUpcLines?: boolean
    tid?: string
    uid?: string
    antenna?: string
    rssi?: string
    /** When true, each emitted tag gets its own RSSI between rssiRandMin/rssiRandMax */
    rssiRandomize?: boolean
    /** Optional random RSSI range; if empty, falls back to rssi */
    rssiRandMin?: string
    /** Optional random RSSI range; if empty, falls back to rssi */
    rssiRandMax?: string
    driver?: string
    /** FIXED_TAG / HANDHELD_TAG: ms between tags; empty uses Fixed/Handheld tab default */
    tagDelay?: string
    epcList?: string
    upcList?: string
    deviceId?: string
    /** Edge: block name for POST /activity/invoke */
    edgeBlockName?: string
    /** Edge: invoke param values keyed by param name */
    edgeParams?: Record<string, string>
    /** Edge: param order when invoking (matches block definition order) */
    edgeParamOrder?: string[]
    /** Edge: workflow name */
    edgeProcessName?: string
    edgeProcessAction?: EdgeProcessAction

    // --- Building blocks ---
    /** SET_VARIABLE: variable name */
    varName?: string
    /** SET_VARIABLE: value template (supports {{vars}}) */
    varValue?: string

    /** DB_QUERY / DB_EXEC */
    dbSql?: string
    dbDatabase?: string
    /** Save first cell / named column into this variable */
    dbSaveAs?: string
    dbSaveColumn?: string
    dbSaveRowIndex?: number
    /** DB_EXEC: save affected-row count into this variable */
    dbSaveAffectedAs?: string
    /** DB_EXEC: save INSERT auto-increment id into this variable */
    dbSaveInsertIdAs?: string

    // --- HTTP_REQUEST ---
    httpMethod?: HttpMethod
    /** Request URL (supports {{vars}}) */
    httpUrl?: string
    /** Raw header lines "Key: Value", one per line (supports {{vars}}) */
    httpHeaders?: string
    /** Request body (supports {{vars}}); ignored for GET/HEAD */
    httpBody?: string
    httpTimeoutMs?: number
    /** Save numeric HTTP status into this variable */
    httpSaveStatusAs?: string
    /** Save full response body text into this variable */
    httpSaveBodyAs?: string
    /** Dot/bracket path into a JSON response, saved into httpSaveJsonAs (e.g. data.items.0.epc) */
    httpJsonPath?: string
    httpSaveJsonAs?: string
    /** Fail the step (throw) on a non-2xx response */
    httpFailOnError?: boolean

    // --- CALL_SEQUENCE ---
    /** Id of the sequence to run as a sub-routine (shares run variables) */
    callSequenceId?: string

    /** RUN_SCRIPT */
    scriptPath?: string
    scriptInline?: boolean
    scriptInlineText?: string
    scriptArgs?: string
    scriptTimeoutMs?: number
    scriptSaveStdoutAs?: string
    /** Fail when exit code !== 0 */
    scriptFailOnNonZero?: boolean

    // --- CONDITION (branch) ---
    /** Left operand template (supports {{vars}}) */
    condLeft?: string
    /** Comparison operator */
    condOp?: ConditionOp
    /** Right operand template (ignored for unary operators) */
    condRight?: string
    /** When true, string comparisons are case-sensitive (default: insensitive) */
    condCaseSensitive?: boolean

    // --- LOG (annotate / emit message) ---
    /** Message template written to the activity log (supports {{vars}}) */
    logMessage?: string
    /** Severity — `error` can optionally abort the run */
    logLevel?: LogLevel
    /** When true and level is `error`, stop the whole run */
    logAbort?: boolean
  }
}

/**
 * A directed connection between two steps in a sequence.
 * `sourceHandle` selects which output port of the source node the edge leaves:
 * `'out'` for ordinary nodes, `'true'` / `'false'` for a CONDITION node's branches.
 */
export interface AutomationEdge {
  id: string
  /** Source step id */
  from: string
  /** Target step id */
  to: string
  /** Output port on the source node: 'out' | 'true' | 'false' */
  sourceHandle?: string
}

export interface AutomationSequence {
  id: string
  name: string
  order: number
  steps: AutomationStep[]
  /**
   * Explicit node connections. When present (even empty), the sequence runs as a
   * graph: execution starts at the node(s) with no incoming edge and follows edges.
   * When `undefined` (legacy files), it is migrated to linear edges on load
   * (see `deriveLinearEdges` / `ensureSequenceEdges`).
   */
  edges?: AutomationEdge[]
}

export const ALL_ACTION_TYPES: ActionType[] = [
  'DELAY',
  'OCR',
  'FIXED_TAG',
  'HANDHELD_TAG',
  'CUSTOM_MESSAGE',
  'EDGE_BLOCK',
  'EDGE_PROCESS',
  'SET_VARIABLE',
  'DB_QUERY',
  'DB_EXEC',
  'RUN_SCRIPT',
  'HTTP_REQUEST',
  'CALL_SEQUENCE',
  'CONDITION',
  'LOG',
]

/**
 * Build a straight chain of edges connecting steps in array order
 * (step[0] → step[1] → …). Used to migrate legacy sequences that had no
 * explicit connections, preserving their original top-to-bottom run order.
 */
export function deriveLinearEdges(steps: AutomationStep[]): AutomationEdge[] {
  const edges: AutomationEdge[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({
      id: crypto.randomUUID(),
      from: steps[i].id,
      to: steps[i + 1].id,
      sourceHandle: 'out',
    })
  }
  return edges
}

/** Ensure a sequence has an `edges` array, deriving a linear chain if missing. */
export function ensureSequenceEdges(seq: AutomationSequence): AutomationSequence {
  if (seq.edges !== undefined) return seq
  return { ...seq, edges: deriveLinearEdges(seq.steps) }
}

/** Migrate legacy flat steps to sequences (one sequence with all steps) */
export function migrateStepsToSequences(steps: AutomationStep[]): AutomationSequence[] {
  if (!steps || steps.length === 0) {
    return [{ id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [], edges: [] }]
  }
  const migratedSteps = steps.map(s => ({ ...s, position: s.position ?? { x: 0, y: 0 } }))
  return [{
    id: crypto.randomUUID(),
    name: 'Sequence 1',
    order: 0,
    steps: migratedSteps,
    edges: deriveLinearEdges(migratedSteps),
  }]
}

/** Normalize sequences: ensure order is sequential 0,1,2,... and edges exist. */
export function normalizeSequences(seqs: AutomationSequence[]): AutomationSequence[] {
  return [...seqs]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...ensureSequenceEdges(s), order: i }))
}

export const DEFAULT_STEP_NAMES: Record<ActionType, string> = {
  DELAY: 'Wait',
  OCR: 'Send OCR',
  FIXED_TAG: 'Fixed Reader Scan',
  HANDHELD_TAG: 'Handheld Scan',
  CUSTOM_MESSAGE: 'Custom Message',
  EDGE_BLOCK: 'Invoke Edge Block',
  EDGE_PROCESS: 'Edge Process',
  SET_VARIABLE: 'Set Variable',
  DB_QUERY: 'Database Query',
  DB_EXEC: 'SQL Statement',
  RUN_SCRIPT: 'Run Script',
  HTTP_REQUEST: 'HTTP Request',
  CALL_SEQUENCE: 'Call Sequence',
  CONDITION: 'Condition',
  LOG: 'Log Message',
}

export function defaultParamsForType(type: ActionType, extras?: { customPort?: string }): AutomationStep['params'] {
  const base: AutomationStep['params'] = {
    duration: 1000,
    message: type === 'CUSTOM_MESSAGE' ? '' : '{"test":1}',
    port: type === 'CUSTOM_MESSAGE' ? extras?.customPort : undefined,
    epc: '',
    upc: '',
    count: 1,
    startSerial: 1,
    tid: '',
    uid: '0000',
    antenna: '1',
    rssi: '-45.0',
    driver: 'llrp',
    epcList: '',
    upcList: '',
    deviceId: '',
    edgeBlockName: '',
    edgeParams: {},
    edgeParamOrder: [],
    edgeProcessName: '',
    edgeProcessAction: 'start',
  }
  if (type === 'SET_VARIABLE') {
    return { ...base, varName: 'myVar', varValue: '' }
  }
  if (type === 'DB_QUERY') {
    return {
      ...base,
      dbSql: 'SELECT 1 AS ok',
      dbDatabase: '',
      dbSaveAs: 'dbResult',
      dbSaveColumn: '',
      dbSaveRowIndex: 0,
    }
  }
  if (type === 'DB_EXEC') {
    return {
      ...base,
      dbSql: "UPDATE inventory SET last_seen = NOW() WHERE epc = '{{epc}}'",
      dbDatabase: '',
      dbSaveAffectedAs: 'rowsAffected',
      dbSaveInsertIdAs: '',
      dbSaveAs: '',
      dbSaveColumn: '',
      dbSaveRowIndex: 0,
    }
  }
  if (type === 'HTTP_REQUEST') {
    return {
      ...base,
      httpMethod: 'GET',
      httpUrl: 'http://{{host}}/',
      httpHeaders: 'Content-Type: application/json',
      httpBody: '',
      httpTimeoutMs: 15000,
      httpSaveStatusAs: 'httpStatus',
      httpSaveBodyAs: 'httpBody',
      httpJsonPath: '',
      httpSaveJsonAs: '',
      httpFailOnError: true,
    }
  }
  if (type === 'CALL_SEQUENCE') {
    return { ...base, callSequenceId: '' }
  }
  if (type === 'RUN_SCRIPT') {
    return {
      ...base,
      scriptPath: '',
      scriptInline: true,
      scriptInlineText:
        processPlatformHint() === 'win32'
          ? 'Write-Output "host=$env:ZEUS_HOST"'
          : 'echo "host=$ZEUS_HOST"',
      scriptArgs: '',
      scriptTimeoutMs: 30000,
      scriptSaveStdoutAs: 'scriptOut',
      scriptFailOnNonZero: true,
    }
  }
  if (type === 'FIXED_TAG' || type === 'HANDHELD_TAG') {
    return { ...base, tagDelay: '' }
  }
  if (type === 'CONDITION') {
    return {
      ...base,
      condLeft: '{{tagCount}}',
      condOp: 'gt',
      condRight: '0',
      condCaseSensitive: false,
    }
  }
  if (type === 'LOG') {
    return {
      ...base,
      logMessage: 'Checkpoint reached',
      logLevel: 'info',
      logAbort: false,
    }
  }
  return base
}

function processPlatformHint(): string {
  try {
    return typeof navigator !== 'undefined' && /Win/i.test(navigator.platform) ? 'win32' : 'unix'
  } catch {
    return 'unix'
  }
}
