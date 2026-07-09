import { describe, it, expect } from 'vitest'
import { applyTemplate, captureEpcsToVars, cellFromRows, evaluateCondition } from '../automation-template'

describe('automation-template', () => {
  it('applies {{vars}}', () => {
    expect(applyTemplate('hi {{host}} / {{epc}}', { host: '10.0.0.1', epc: 'ABC' })).toBe(
      'hi 10.0.0.1 / ABC',
    )
    expect(applyTemplate('missing {{nope}}', {})).toBe('missing ')
  })

  it('reads cells from rows', () => {
    expect(cellFromRows([{ cnt: 3 }], 'cnt')).toBe('3')
    expect(cellFromRows([{ a: 1, b: 2 }])).toBe('1')
    expect(cellFromRows([])).toBe('')
  })

  it('captures EPC lists for later steps', () => {
    const vars: Record<string, string> = {}
    captureEpcsToVars(vars, ['AAA', 'BBB', 'AAA', 'CCC'])
    expect(vars.epc).toBe('AAA')
    expect(vars.epcs).toBe('AAA\nBBB\nCCC')
    expect(vars.epcsSql).toBe("'AAA','BBB','CCC'")
    expect(vars.tagCount).toBe('3')
  })
})

describe('evaluateCondition', () => {
  const vars = { tagCount: '3', epc: 'ABC123', empty: '' }

  it('compares numbers with numeric operators', () => {
    expect(evaluateCondition({ condLeft: '{{tagCount}}', condOp: 'gt', condRight: '0' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{tagCount}}', condOp: 'gte', condRight: '3' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{tagCount}}', condOp: 'lt', condRight: '3' }, vars)).toBe(false)
    // Non-numeric operands make numeric operators false
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'gt', condRight: '0' }, vars)).toBe(false)
  })

  it('handles equality numerically when both sides are numbers, else textually', () => {
    expect(evaluateCondition({ condLeft: '3', condOp: 'eq', condRight: '3.0' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'eq', condRight: 'abc123' }, vars)).toBe(true)
    expect(
      evaluateCondition({ condLeft: '{{epc}}', condOp: 'eq', condRight: 'abc123', condCaseSensitive: true }, vars),
    ).toBe(false)
  })

  it('supports text operators', () => {
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'contains', condRight: 'bc1' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'startsWith', condRight: 'abc' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'endsWith', condRight: 'xyz' }, vars)).toBe(false)
    expect(evaluateCondition({ condLeft: '{{epc}}', condOp: 'matches', condRight: '^[a-z]+\\d+$' }, vars)).toBe(true)
  })

  it('supports unary operators and invalid regex is false', () => {
    expect(evaluateCondition({ condLeft: '{{empty}}', condOp: 'isEmpty' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{tagCount}}', condOp: 'isNotEmpty' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '{{tagCount}}', condOp: 'isTrue' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: '0', condOp: 'isFalse' }, vars)).toBe(true)
    expect(evaluateCondition({ condLeft: 'x', condOp: 'matches', condRight: '(' }, vars)).toBe(false)
  })
})
