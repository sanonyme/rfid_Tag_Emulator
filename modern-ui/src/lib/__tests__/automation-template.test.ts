import { describe, it, expect } from 'vitest'
import { applyTemplate, captureEpcsToVars, cellFromRows, evaluateCondition, coerceToType, stringifyVarValue, parseListItems, switchHandle, pickWeightedIndex } from '../automation-template'

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

describe('coerceToType', () => {
  it('passes strings through', () => {
    expect(coerceToType('hello', 'string')).toBe('hello')
    expect(coerceToType('anything', undefined)).toBe('anything')
  })

  it('validates & canonicalizes numbers', () => {
    expect(coerceToType('42', 'number')).toBe('42')
    expect(coerceToType('  3.50 ', 'number')).toBe('3.5')
    expect(() => coerceToType('abc', 'number')).toThrow()
    expect(() => coerceToType('', 'number')).toThrow()
  })

  it('normalizes booleans and rejects junk', () => {
    expect(coerceToType('yes', 'boolean')).toBe('true')
    expect(coerceToType('0', 'boolean')).toBe('false')
    expect(coerceToType('', 'boolean')).toBe('false')
    expect(() => coerceToType('maybe', 'boolean')).toThrow()
  })

  it('validates integers (rejects decimals)', () => {
    expect(coerceToType('42', 'integer')).toBe('42')
    expect(coerceToType(' -7 ', 'integer')).toBe('-7')
    expect(() => coerceToType('3.5', 'integer')).toThrow()
    expect(() => coerceToType('x', 'integer')).toThrow()
  })

  it('accepts JSON arrays or splits comma/newline lists', () => {
    expect(coerceToType('["a","b"]', 'array')).toBe('["a","b"]')
    expect(coerceToType('a, b ,c', 'array')).toBe('["a","b","c"]')
    expect(coerceToType('one\ntwo\n\nthree', 'array')).toBe('["one","two","three"]')
    expect(coerceToType('', 'array')).toBe('[]')
  })

  it('validates objects (rejects arrays/primitives)', () => {
    expect(coerceToType('{ "a": 1 }', 'object')).toBe('{"a":1}')
    expect(() => coerceToType('[1,2]', 'object')).toThrow()
    expect(() => coerceToType('42', 'object')).toThrow()
  })

  it('validates & compacts JSON', () => {
    expect(coerceToType('{ "a": 1 }', 'json')).toBe('{"a":1}')
    expect(coerceToType('[1, 2, 3]', 'json')).toBe('[1,2,3]')
    expect(() => coerceToType('{bad}', 'json')).toThrow()
  })
})

describe('stringifyVarValue', () => {
  it('canonicalizes JS values to strings', () => {
    expect(stringifyVarValue('x')).toBe('x')
    expect(stringifyVarValue(5)).toBe('5')
    expect(stringifyVarValue(true)).toBe('true')
    expect(stringifyVarValue(false)).toBe('false')
    expect(stringifyVarValue(null)).toBe('')
    expect(stringifyVarValue(undefined)).toBe('')
    expect(stringifyVarValue({ a: 1 })).toBe('{"a":1}')
    expect(stringifyVarValue([1, 2])).toBe('[1,2]')
  })
})

describe('parseListItems', () => {
  it('parses JSON arrays, newlines, and commas', () => {
    expect(parseListItems('["a","b"]')).toEqual(['a', 'b'])
    expect(parseListItems('a\nb\nc')).toEqual(['a', 'b', 'c'])
    expect(parseListItems('a, b, c')).toEqual(['a', 'b', 'c'])
    expect(parseListItems('')).toEqual([])
  })
})

describe('switchHandle', () => {
  const vars = { tagCount: '2', status: 'OK' }

  it('routes to the first matching case', () => {
    const params = { switchValue: '{{tagCount}}', switchCases: [{ value: '0' }, { value: '2' }, { value: '2' }] }
    expect(switchHandle(params, vars)).toBe('case-1')
  })

  it('falls back to default when nothing matches', () => {
    const params = { switchValue: '{{tagCount}}', switchCases: [{ value: '5' }, { value: '9' }] }
    expect(switchHandle(params, vars)).toBe('default')
  })

  it('is case-insensitive by default and case-sensitive when asked', () => {
    expect(switchHandle({ switchValue: '{{status}}', switchCases: [{ value: 'ok' }] }, vars)).toBe('case-0')
    expect(
      switchHandle({ switchValue: '{{status}}', switchCases: [{ value: 'ok' }], switchCaseSensitive: true }, vars),
    ).toBe('default')
  })
})

describe('pickWeightedIndex', () => {
  it('selects a bucket proportional to weight', () => {
    // Buckets: [0,0.25) -> 0, [0.25,1) -> 1
    expect(pickWeightedIndex([1, 3], 0.1)).toBe(0)
    expect(pickWeightedIndex([1, 3], 0.5)).toBe(1)
    expect(pickWeightedIndex([1, 3], 0.99)).toBe(1)
  })

  it('ignores non-positive weights and handles the all-zero case', () => {
    expect(pickWeightedIndex([0, 0, 5], 0.5)).toBe(2)
    expect(pickWeightedIndex([0, 0, 0], 0.5)).toBe(0)
    expect(pickWeightedIndex([], 0.5)).toBe(0)
  })
})
