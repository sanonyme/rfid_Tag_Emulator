import { describe, it, expect } from 'vitest'
import {
  deriveLinearEdges,
  ensureSequenceEdges,
  normalizeSequences,
  migrateStepsToSequences,
  parseWorkflowSequences,
  defaultParamsForType,
  ALL_ACTION_TYPES,
  type AutomationStep,
  type AutomationSequence,
  type ActionType,
} from '../automation-types'
import { DEMO_WORKFLOW } from '../automation-demo-workflow'

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

    const setVar = defaultParamsForType('SET_VARIABLE')
    expect(setVar.varType).toBe('string')

    const code = defaultParamsForType('CODE')
    expect(code.codeLanguage).toBe('javascript')
    expect(code.codeSource).toContain('vars')

    const assert = defaultParamsForType('ASSERT')
    expect(assert.condOp).toBe('gt')
    expect(assert.assertMessage).toBeTruthy()

    const wait = defaultParamsForType('WAIT_UNTIL')
    expect(wait.waitTimeoutMs).toBe(10000)
    expect(wait.waitOnTimeout).toBe('fail')

    const each = defaultParamsForType('FOR_EACH')
    expect(each.forEachItemAs).toBe('item')
    expect(each.forEachMax).toBe(500)

    const stop = defaultParamsForType('STOP')
    expect(stop.stopScope).toBe('sequence')

    const gen = defaultParamsForType('GENERATE')
    expect(gen.generateKind).toBe('uuid')
    expect(gen.generateSaveAs).toBe('generated')

    const transform = defaultParamsForType('TRANSFORM')
    expect(transform.transformOp).toBe('upper')
    expect(transform.transformSaveAs).toBe('transformed')

    const sw = defaultParamsForType('SWITCH')
    expect(sw.switchCases?.length).toBeGreaterThan(0)
    expect(sw.switchHasDefault).toBe(true)

    const rand = defaultParamsForType('RANDOM')
    expect(rand.randomBranches?.length).toBe(2)

    const loop = defaultParamsForType('LOOP_N')
    expect(loop.loopIndexAs).toBe('i')
  })
})

describe('parseWorkflowSequences', () => {
  it('re-points cross-sequence references at freshly minted ids', () => {
    const raw = {
      sequences: [
        { id: 'A', name: 'A', order: 0, steps: [{ id: 'a1', type: 'CALL_SEQUENCE', name: 'call', params: { callSequenceId: 'B' } }], edges: [] },
        { id: 'B', name: 'B', order: 1, steps: [{ id: 'b1', type: 'LOG', name: 'log', params: {} }], edges: [] },
      ],
    }
    const out = parseWorkflowSequences(raw)!
    expect(out).toHaveLength(2)
    const a = out.find((s) => s.name === 'A')!
    const b = out.find((s) => s.name === 'B')!
    // The call now points at B's NEW id, not the original 'B'.
    expect(a.steps[0].params.callSequenceId).toBe(b.id)
    expect(a.steps[0].params.callSequenceId).not.toBe('B')
  })

  it('returns null for unrecognized payloads', () => {
    expect(parseWorkflowSequences({ nope: true })).toBeNull()
    expect(parseWorkflowSequences(42)).toBeNull()
  })
})

describe('bundled demo workflow', () => {
  const parsed = parseWorkflowSequences(DEMO_WORKFLOW)!

  it('showcases every node type', () => {
    const used = new Set(parsed.flatMap((s) => s.steps.map((n) => n.type)))
    const missing = ALL_ACTION_TYPES.filter((t) => !used.has(t))
    expect(missing).toEqual([])
  })

  it('has only valid edges (real endpoints + valid branch handles)', () => {
    const validHandles = (n: AutomationStep): Set<string> => {
      if (n.type === 'CONDITION') return new Set(['true', 'false'])
      if (n.type === 'SWITCH') {
        const h = (n.params.switchCases ?? []).map((_, i) => `case-${i}`)
        if (n.params.switchHasDefault !== false) h.push('default')
        return new Set(h)
      }
      if (n.type === 'RANDOM') return new Set((n.params.randomBranches ?? []).map((_, i) => `branch-${i}`))
      return new Set(['out'])
    }
    for (const s of parsed) {
      const byId = new Map(s.steps.map((n) => [n.id, n]))
      for (const e of s.edges ?? []) {
        expect(byId.has(e.from)).toBe(true)
        expect(byId.has(e.to)).toBe(true)
        expect(validHandles(byId.get(e.from)!).has(e.sourceHandle ?? 'out')).toBe(true)
      }
    }
  })

  it('resolves every sub-sequence reference to a sequence that exists', () => {
    const ids = new Set(parsed.map((s) => s.id))
    const refKey: Partial<Record<ActionType, keyof AutomationStep['params']>> = {
      CALL_SEQUENCE: 'callSequenceId',
      FOR_EACH: 'forEachSequenceId',
      LOOP_N: 'loopSequenceId',
    }
    for (const s of parsed) {
      for (const n of s.steps) {
        const key = refKey[n.type]
        if (key) expect(ids.has(n.params[key] as string)).toBe(true)
      }
    }
  })
})
