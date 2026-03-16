export type ActionType = 'DELAY' | 'OCR' | 'FIXED_TAG' | 'HANDHELD_TAG'

export interface AutomationStep {
  id: string
  type: ActionType
  name: string
  position?: { x: number; y: number }
  params: {
    duration?: number
    message?: string
    epc?: string
    upc?: string
    count?: number
    startSerial?: number
    tid?: string
    uid?: string
    antenna?: string
    rssi?: string
    driver?: string
    epcList?: string
    upcList?: string
    deviceId?: string
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
