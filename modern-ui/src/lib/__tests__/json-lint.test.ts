import { describe, expect, it } from 'vitest'
import {
  analyzeJson,
  formatBytes,
  minifyJson,
  parseJsonErrorPosition,
  positionToLineCol,
  prettifyJson,
  repairJson,
  sortJsonKeys,
} from '../json-lint'

describe('analyzeJson', () => {
  it('accepts a valid object', () => {
    const result = analyzeJson('{"a":1,"b":[true,null]}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stats.rootType).toBe('object')
      expect(result.stats.keys).toBe(2)
      expect(result.stats.arrays).toBe(1)
      expect(result.stats.objects).toBe(1)
    }
  })

  it('rejects empty input', () => {
    const result = analyzeJson('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.line).toBe(1)
  })

  it('reports line and column for trailing commas', () => {
    const text = '{\n  "a": 1,\n}'
    const result = analyzeJson(text)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.line).toBeGreaterThanOrEqual(2)
      expect(result.error.position).toBeGreaterThan(0)
    }
  })
})

describe('prettify / minify / sort', () => {
  it('pretty-prints with the requested indent', () => {
    expect(prettifyJson('{"b":1,"a":2}', 2)).toBe('{\n  "b": 1,\n  "a": 2\n}\n')
  })

  it('minifies by stripping whitespace', () => {
    expect(minifyJson('{\n  "a": 1\n}')).toBe('{"a":1}')
  })

  it('sorts object keys recursively', () => {
    expect(sortJsonKeys('{"z":{"b":1,"a":2},"a":0}', 2)).toBe(
      '{\n  "a": 0,\n  "z": {\n    "a": 2,\n    "b": 1\n  }\n}\n',
    )
  })
})

describe('repairJson', () => {
  it('strips comments and trailing commas', () => {
    const messy = `{
      // heading
      "a": 1, /* keep */
      "b": [1, 2,],
    }`
    expect(JSON.parse(repairJson(messy))).toEqual({ a: 1, b: [1, 2] })
  })
})

describe('formatBytes', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
})

describe('position helpers', () => {
  it('maps a position onto 1-based line/column', () => {
    expect(positionToLineCol('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  it('reads V8 "at position N" messages', () => {
    expect(parseJsonErrorPosition('Unexpected token } in JSON at position 12', '{}')).toBe(12)
  })
})
