import { describe, it, expect } from 'vitest'
import {
  deriveLinearEdges,
  ensureSequenceEdges,
  normalizeSequences,
  migrateStepsToSequences,
  defaultParamsForType,
  type AutomationStep,
  type AutomationSequence,
} from '../automation-types'

function step(id: string): AutomationStep {
  return { id, type: 'DELAY', name: id, position: { x: 0, y: 0 }, params: { duration: 1 } }
}

describe('automation edge model', () => {
  it('derives a straight chain from steps in order', () => {
    const edges = deriveLinearEdges([step('a'), step('b'), step('c')])
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => [e.from, e.to])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect(edges.every((e) => e.sourceHandle === 'out')).toBe(true)
  })

  it('ensureSequenceEdges only fills missing edges (idempotent)', () => {
    const legacy: AutomationSequence = { id: 's', name: 'S', order: 0, steps: [step('a'), step('b')] }
    const migrated = ensureSequenceEdges(legacy)
    expect(migrated.edges).toHaveLength(1)

    // An already-migrated sequence (even with empty edges) is left untouched.
    const explicit: AutomationSequence = { ...legacy, edges: [] }
    expect(ensureSequenceEdges(explicit).edges).toEqual([])
  })

  it('normalizeSequences reindexes order and guarantees edges', () => {
    const seqs: AutomationSequence[] = [
      { id: 'b', name: 'B', order: 5, steps: [step('x'), step('y')] },
      { id: 'a', name: 'A', order: 2, steps: [] },
    ]
    const out = normalizeSequences(seqs)
    expect(out.map((s) => s.order)).toEqual([0, 1])
    expect(out[0].id).toBe('a')
    expect(out.every((s) => Array.isArray(s.edges))).toBe(true)
  })

  it('migrateStepsToSequences produces one sequence with linear edges', () => {
    const out = migrateStepsToSequences([step('a'), step('b'), step('c')])
    expect(out).toHaveLength(1)
    expect(out[0].steps).toHaveLength(3)
    expect(out[0].edges).toHaveLength(2)
  })

  it('provides sensible defaults for the new node types', () => {
    const cond = defaultParamsForType('CONDITION')
    expect(cond.condOp).toBe('gt')
    expect(cond.condLeft).toContain('{{')
    const log = defaultParamsForType('LOG')
    expect(log.logLevel).toBe('info')

    const http = defaultParamsForType('HTTP_REQUEST')
    expect(http.httpMethod).toBe('GET')
    expect(http.httpFailOnError).toBe(true)

    const exec = defaultParamsForType('DB_EXEC')
    expect(exec.dbSaveAffectedAs).toBe('rowsAffected')

    const call = defaultParamsForType('CALL_SEQUENCE')
    expect(call.callSequenceId).toBe('')
  })
})
