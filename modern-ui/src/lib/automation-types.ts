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
  | 'CODE'
  | 'CONDITION'
  | 'ASSERT'
  | 'WAIT_UNTIL'
  | 'FOR_EACH'
  | 'STOP'
  | 'GENERATE'
  | 'COMMENT'
  | 'LOG'
  | 'TRANSFORM'
  | 'NOTIFY'
  | 'LOOP_N'
  | 'SWITCH'
  | 'RANDOM'

export type EdgeProcessAction = 'start' | 'stop'

/** HTTP verbs supported by the HTTP Request node. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

/** Value type applied by the Set Variable node (validated + canonicalized on set). */
export type VarType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'json'

/**
 * UI metadata for the Set Variable type picker. `java` names the closest Java
 * equivalent so it reads familiarly. Values are stored as strings (numbers/booleans
 * canonicalized; arrays/objects/JSON stored as compact JSON) so templating stays simple.
 */
export const VAR_TYPES: { value: VarType; label: string; hint: string; java: string }[] = [
  { value: 'string', label: 'String', hint: 'Any text', java: 'String' },
  { value: 'number', label: 'Number', hint: 'Any number, e.g. 3.5 or -42', java: 'double / float' },
  { value: 'integer', label: 'Integer', hint: 'A whole number, e.g. 42 (no decimals)', java: 'int / long' },
  { value: 'boolean', label: 'Boolean', hint: 'true / false (also 1/0, yes/no)', java: 'boolean' },
  { value: 'array', label: 'Array', hint: 'JSON array, or a comma/newline list — stored as JSON', java: 'List / T[]' },
  { value: 'object', label: 'Object', hint: 'A JSON object — stored as compact JSON', java: 'Map / POJO' },
  { value: 'json', label: 'JSON (any)', hint: 'Any valid JSON value', java: 'Object' },
]

/**
 * Code node language. Only JavaScript is supported (in-process).
 * Legacy workflows may still store `java` — the runner rejects those with a clear message.
 */
export type CodeLanguage = 'javascript' | 'java'

/** Starter snippet for new Code nodes (JavaScript only). */
export const CODE_STARTER = `// Manipulate variables in-process (runs instantly, no install).
// \`vars\` is a map of the current variables (all strings) — mutate it,
// and/or return an object. Returned/mutated values are merged back.
const tagCount = Number(vars.tagCount || 0)
vars.doubled = tagCount * 2
return { note: \`Saw \${tagCount} tag(s) on \${vars.host}\` }
`

/** @deprecated Prefer CODE_STARTER — kept for older imports. */
export const CODE_STARTERS: Record<'javascript', string> = {
  javascript: CODE_STARTER,
}

/** What a GENERATE node produces. */
export type GenerateKind = 'uuid' | 'timestamp' | 'unixMs' | 'randomInt' | 'randomHex'

export const GENERATE_KINDS: { value: GenerateKind; label: string; hint: string }[] = [
  { value: 'uuid', label: 'UUID', hint: 'Random UUID v4' },
  { value: 'timestamp', label: 'ISO timestamp', hint: 'e.g. 2026-07-11T06:00:00.000Z' },
  { value: 'unixMs', label: 'Unix ms', hint: 'Milliseconds since epoch' },
  { value: 'randomInt', label: 'Random integer', hint: 'Inclusive min…max' },
  { value: 'randomHex', label: 'Random hex', hint: 'Lowercase hex string of N chars' },
]

/** How far a STOP node ends execution. */
export type StopScope = 'sequence' | 'run'

/** Operations available to the TRANSFORM node (in-process value manipulation). */
export type TransformOp =
  | 'upper'
  | 'lower'
  | 'trim'
  | 'length'
  | 'replace'
  | 'slice'
  | 'prefix'
  | 'suffix'
  | 'padStart'
  | 'default'
  | 'jsonExtract'
  | 'round'
  | 'floor'
  | 'ceil'
  | 'abs'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'modulo'
  | 'toFixed'

export type TransformCategory = 'text' | 'number' | 'json'

/**
 * UI metadata for the TRANSFORM op picker. `arg`/`arg2` name the extra inputs a
 * given op needs (undefined = no input shown).
 */
export const TRANSFORM_OPS: {
  value: TransformOp
  label: string
  category: TransformCategory
  arg?: string
  arg2?: string
  hint: string
}[] = [
  { value: 'upper', label: 'UPPERCASE', category: 'text', hint: 'Convert to upper case' },
  { value: 'lower', label: 'lowercase', category: 'text', hint: 'Convert to lower case' },
  { value: 'trim', label: 'Trim whitespace', category: 'text', hint: 'Remove leading/trailing whitespace' },
  { value: 'length', label: 'Length', category: 'text', hint: 'Number of characters' },
  { value: 'replace', label: 'Replace', category: 'text', arg: 'Find', arg2: 'Replace with', hint: 'Replace all occurrences (plain text)' },
  { value: 'slice', label: 'Substring', category: 'text', arg: 'Start index', arg2: 'End index (optional)', hint: 'Characters from start to end index' },
  { value: 'prefix', label: 'Add prefix', category: 'text', arg: 'Prefix', hint: 'Prepend text' },
  { value: 'suffix', label: 'Add suffix', category: 'text', arg: 'Suffix', hint: 'Append text' },
  { value: 'padStart', label: 'Pad start', category: 'text', arg: 'Target length', arg2: 'Pad char (default 0)', hint: 'Left-pad to a length' },
  { value: 'default', label: 'Default if empty', category: 'text', arg: 'Fallback value', hint: 'Use fallback when the input is empty' },
  { value: 'jsonExtract', label: 'Extract JSON path', category: 'json', arg: 'Path (e.g. data.items.0.epc)', hint: 'Parse input as JSON and read a dot/bracket path' },
  { value: 'round', label: 'Round', category: 'number', hint: 'Round to nearest integer' },
  { value: 'floor', label: 'Floor', category: 'number', hint: 'Round down' },
  { value: 'ceil', label: 'Ceil', category: 'number', hint: 'Round up' },
  { value: 'abs', label: 'Absolute value', category: 'number', hint: 'Magnitude (drop sign)' },
  { value: 'add', label: 'Add (+)', category: 'number', arg: 'Amount', hint: 'Add a number' },
  { value: 'subtract', label: 'Subtract (−)', category: 'number', arg: 'Amount', hint: 'Subtract a number' },
  { value: 'multiply', label: 'Multiply (×)', category: 'number', arg: 'Factor', hint: 'Multiply by a number' },
  { value: 'divide', label: 'Divide (÷)', category: 'number', arg: 'Divisor', hint: 'Divide by a number' },
  { value: 'modulo', label: 'Modulo (%)', category: 'number', arg: 'Divisor', hint: 'Remainder after division' },
  { value: 'toFixed', label: 'Fixed decimals', category: 'number', arg: 'Decimal places', hint: 'Format with N decimal places' },
]

/** Severity levels for the NOTIFY (toast) node. */
export type NotifyLevel = 'info' | 'success' | 'warning' | 'error'

export const NOTIFY_LEVELS: { value: NotifyLevel; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

/** A single case in a SWITCH node — matched (by equality) against the switch value. */
export interface SwitchCase {
  /** Value to compare against the switch value (supports {{vars}}). */
  value: string
  /** Optional friendly label shown on the output port. */
  label?: string
}

/** A single weighted branch in a RANDOM node. */
export interface RandomBranch {
  /** Relative weight (>= 0). Higher = more likely. */
  weight: number
  /** Optional friendly label shown on the output port. */
  label?: string
}

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
    /** When true, the node is skipped at run time — execution passes straight
     * through to its first outgoing edge without running the node's action. */
    disabled?: boolean
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
    /** SET_VARIABLE: value type — validated & canonicalized on set (default 'string') */
    varType?: VarType

    // --- CODE ---
    /** CODE: language ('javascript' runs in-process; 'java' via subprocess/JDK) */
    codeLanguage?: CodeLanguage
    /** CODE: the source to run */
    codeSource?: string
    /** CODE: timeout for subprocess languages (ms) */
    codeTimeoutMs?: number

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

    // --- ASSERT ---
    /** Failure message template (supports {{vars}}) */
    assertMessage?: string

    // --- WAIT_UNTIL ---
    /** Max time to wait for the condition (ms) */
    waitTimeoutMs?: number
    /** How often to re-check the condition (ms) */
    waitPollMs?: number
    /** On timeout: fail the step, or continue as if true */
    waitOnTimeout?: 'fail' | 'continue'

    // --- FOR_EACH ---
    /** List source template — JSON array, newlines, or commas (supports {{vars}}) */
    forEachSource?: string
    /** Variable name for the current item */
    forEachItemAs?: string
    /** Variable name for the 0-based index */
    forEachIndexAs?: string
    /** Sequence to run once per item (shares run variables) */
    forEachSequenceId?: string
    /** Safety cap on iterations */
    forEachMax?: number

    // --- STOP ---
    stopScope?: StopScope
    /** Optional message written to the log */
    stopMessage?: string

    // --- GENERATE ---
    generateKind?: GenerateKind
    /** Variable to store the generated value */
    generateSaveAs?: string
    generateMin?: number
    generateMax?: number
    generateHexLength?: number

    // --- COMMENT ---
    commentText?: string

    // --- TRANSFORM ---
    /** Source value template (supports {{vars}}) */
    transformInput?: string
    /** Operation applied to the input */
    transformOp?: TransformOp
    /** First argument (op-dependent; supports {{vars}}) */
    transformArg?: string
    /** Second argument (op-dependent; supports {{vars}}) */
    transformArg2?: string
    /** Variable to store the result in */
    transformSaveAs?: string

    // --- NOTIFY ---
    /** Toast title (optional; supports {{vars}}) */
    notifyTitle?: string
    /** Toast message (supports {{vars}}) */
    notifyMessage?: string
    /** Toast severity */
    notifyLevel?: NotifyLevel

    // --- LOOP_N (count-based loop) ---
    /** How many times to run the target sequence (template → number) */
    loopCount?: string
    /** Variable name for the 1-based iteration number */
    loopIndexAs?: string
    /** Sequence to run each iteration (shares run variables) */
    loopSequenceId?: string
    /** Safety cap on iterations */
    loopMax?: number

    // --- SWITCH (multi-branch) ---
    /** Value compared against each case (supports {{vars}}) */
    switchValue?: string
    /** Ordered cases; first match routes through that port */
    switchCases?: SwitchCase[]
    /** When true, comparisons are case-sensitive (default: insensitive) */
    switchCaseSensitive?: boolean
    /** When true (default), an unmatched value routes through a `default` port */
    switchHasDefault?: boolean

    // --- RANDOM (weighted branch) ---
    /** Weighted branches; one is chosen at random each run */
    randomBranches?: RandomBranch[]
    /** Optional variable to store the chosen branch index (0-based) */
    randomSaveAs?: string
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
  'CODE',
  'CONDITION',
  'ASSERT',
  'WAIT_UNTIL',
  'FOR_EACH',
  'STOP',
  'GENERATE',
  'COMMENT',
  'LOG',
  'TRANSFORM',
  'NOTIFY',
  'LOOP_N',
  'SWITCH',
  'RANDOM',
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

/**
 * Parse an exported workflow payload (or a bare sequence array / legacy flat
 * `steps` file) into fresh, normalized sequences. Regenerates all step and
 * sequence ids, re-points edges at the new step ids, and re-points cross-sequence
 * references (Call Sequence / For Each / Loop N) at the new sequence ids so an
 * imported workflow's sub-routine links keep working. Returns `null` when the
 * payload shape is unrecognized.
 */
export function parseWorkflowSequences(raw: unknown): AutomationSequence[] | null {
  const r = raw as any
  let seqs: any[]
  if (r && Array.isArray(r.sequences)) seqs = r.sequences
  else if (Array.isArray(r)) seqs = r
  else if (r && Array.isArray(r.steps)) return migrateStepsToSequences(r.steps)
  else return null

  const validTypes = new Set<string>(ALL_ACTION_TYPES)
  // Pre-assign new sequence ids so cross-sequence references survive.
  const seqIdMap = new Map<string, string>()
  for (const s of seqs) {
    if (s && typeof s.id === 'string') seqIdMap.set(s.id, crypto.randomUUID())
  }
  const remapSeqRef = (id: unknown): string =>
    typeof id === 'string' ? (seqIdMap.get(id) ?? id) : ''

  return normalizeSequences(seqs.map((s: any) => {
    const idMap = new Map<string, string>()
    const steps: AutomationStep[] = (s.steps || []).map((st: any) => {
      const newId = crypto.randomUUID()
      if (typeof st.id === 'string') idMap.set(st.id, newId)
      const type: ActionType = validTypes.has(st.type) ? st.type : 'DELAY'
      const params = typeof st.params === 'object' && st.params !== null ? { ...st.params } : {}
      if (type === 'CALL_SEQUENCE' && 'callSequenceId' in params) params.callSequenceId = remapSeqRef(params.callSequenceId)
      if (type === 'FOR_EACH' && 'forEachSequenceId' in params) params.forEachSequenceId = remapSeqRef(params.forEachSequenceId)
      if (type === 'LOOP_N' && 'loopSequenceId' in params) params.loopSequenceId = remapSeqRef(params.loopSequenceId)
      return {
        id: newId,
        type,
        name: String(st.name || 'Step').slice(0, 100),
        position: Array.isArray(st.position)
          ? { x: st.position[0] ?? 0, y: st.position[1] ?? 0 }
          : (st.position && typeof st.position.x === 'number' ? st.position : { x: 0, y: 0 }),
        params,
      }
    })
    const edges: AutomationEdge[] | undefined = Array.isArray(s.edges)
      ? s.edges
          .filter((e: any) => e && idMap.has(e.from) && idMap.has(e.to))
          .map((e: any) => ({
            id: crypto.randomUUID(),
            from: idMap.get(e.from)!,
            to: idMap.get(e.to)!,
            sourceHandle: typeof e.sourceHandle === 'string' ? e.sourceHandle : 'out',
          }))
      : undefined
    return {
      id: (typeof s.id === 'string' && seqIdMap.get(s.id)) || crypto.randomUUID(),
      name: String(s.name || 'Imported').slice(0, 100),
      order: typeof s.order === 'number' ? s.order : 0,
      steps,
      edges,
    }
  }))
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
  CODE: 'Code',
  CONDITION: 'Condition',
  ASSERT: 'Assert',
  WAIT_UNTIL: 'Wait Until',
  FOR_EACH: 'For Each',
  STOP: 'Stop',
  GENERATE: 'Generate Value',
  COMMENT: 'Comment',
  LOG: 'Log Message',
  TRANSFORM: 'Transform',
  NOTIFY: 'Notify',
  LOOP_N: 'Loop N Times',
  SWITCH: 'Switch',
  RANDOM: 'Random Branch',
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
    return { ...base, varName: 'myVar', varValue: '', varType: 'string' }
  }
  if (type === 'CODE') {
    return {
      ...base,
      codeLanguage: 'javascript',
      codeSource: CODE_STARTER,
      codeTimeoutMs: 15000,
    }
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
  if (type === 'ASSERT') {
    return {
      ...base,
      condLeft: '{{tagCount}}',
      condOp: 'gt',
      condRight: '0',
      condCaseSensitive: false,
      assertMessage: 'Assertion failed: expected {{tagCount}} > 0',
    }
  }
  if (type === 'WAIT_UNTIL') {
    return {
      ...base,
      condLeft: '{{dbResult}}',
      condOp: 'isNotEmpty',
      condRight: '',
      condCaseSensitive: false,
      waitTimeoutMs: 10000,
      waitPollMs: 500,
      waitOnTimeout: 'fail',
    }
  }
  if (type === 'FOR_EACH') {
    return {
      ...base,
      forEachSource: '{{epcs}}',
      forEachItemAs: 'item',
      forEachIndexAs: 'index',
      forEachSequenceId: '',
      forEachMax: 500,
    }
  }
  if (type === 'STOP') {
    return {
      ...base,
      stopScope: 'sequence',
      stopMessage: 'Stopped',
    }
  }
  if (type === 'GENERATE') {
    return {
      ...base,
      generateKind: 'uuid',
      generateSaveAs: 'generated',
      generateMin: 0,
      generateMax: 9999,
      generateHexLength: 16,
    }
  }
  if (type === 'COMMENT') {
    return {
      ...base,
      commentText: 'Notes for this part of the flow…',
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
  if (type === 'TRANSFORM') {
    return {
      ...base,
      transformInput: '{{epc}}',
      transformOp: 'upper',
      transformArg: '',
      transformArg2: '',
      transformSaveAs: 'transformed',
    }
  }
  if (type === 'NOTIFY') {
    return {
      ...base,
      notifyTitle: '',
      notifyMessage: 'Sent {{tagCount}} tag(s) to {{host}}',
      notifyLevel: 'info',
    }
  }
  if (type === 'LOOP_N') {
    return {
      ...base,
      loopCount: '3',
      loopIndexAs: 'i',
      loopSequenceId: '',
      loopMax: 1000,
    }
  }
  if (type === 'SWITCH') {
    return {
      ...base,
      switchValue: '{{tagCount}}',
      switchCases: [{ value: '0' }, { value: '1' }],
      switchCaseSensitive: false,
      switchHasDefault: true,
    }
  }
  if (type === 'RANDOM') {
    return {
      ...base,
      randomBranches: [
        { weight: 1, label: 'A' },
        { weight: 1, label: 'B' },
      ],
      randomSaveAs: '',
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
