export type ActionType =
  | 'DELAY'
  | 'OCR'
  | 'FIXED_TAG'
  | 'HANDHELD_TAG'
  | 'CUSTOM_MESSAGE'
  | 'EDGE_BLOCK'
  | 'EDGE_PROCESS'

export type EdgeProcessAction = 'start' | 'stop'

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
  }
}

export interface AutomationSequence {
  id: string
  name: string
  order: number
  steps: AutomationStep[]
}

/** Migrate legacy flat steps to sequences (one sequence with all steps) */
export function migrateStepsToSequences(steps: AutomationStep[]): AutomationSequence[] {
  if (!steps || steps.length === 0) {
    return [{ id: crypto.randomUUID(), name: 'Sequence 1', order: 0, steps: [] }]
  }
  return [{
    id: crypto.randomUUID(),
    name: 'Sequence 1',
    order: 0,
    steps: steps.map(s => ({ ...s, position: s.position ?? { x: 0, y: 0 } })),
  }]
}

/** Normalize sequences: ensure order is sequential 0,1,2,... */
export function normalizeSequences(seqs: AutomationSequence[]): AutomationSequence[] {
  return [...seqs]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i }))
}
