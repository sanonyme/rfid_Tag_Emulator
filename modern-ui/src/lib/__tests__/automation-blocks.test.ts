import { describe, it, expect } from 'vitest'
import { parseHeaderLines, extractJsonPath } from '../automation-blocks'

describe('parseHeaderLines', () => {
  it('parses "Key: Value" lines and ignores blanks/comments', () => {
    const headers = parseHeaderLines(
      'Content-Type: application/json\n# a comment\n\nAuthorization: Bearer abc123',
    )
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc123',
    })
  })

  it('keeps colons inside the value', () => {
    expect(parseHeaderLines('X-Url: http://host:8081/x')).toEqual({
      'X-Url': 'http://host:8081/x',
    })
  })

  it('skips malformed lines', () => {
    expect(parseHeaderLines('no-colon-here\n: novalue')).toEqual({})
  })
})

describe('extractJsonPath', () => {
  const json = { data: { items: [{ epc: 'AAA' }, { epc: 'BBB' }], count: 2 }, ok: true }

  it('resolves dot paths', () => {
    expect(extractJsonPath(json, 'data.count')).toBe('2')
    expect(extractJsonPath(json, 'ok')).toBe('true')
  })

  it('resolves array indices via dot or bracket syntax', () => {
    expect(extractJsonPath(json, 'data.items.0.epc')).toBe('AAA')
    expect(extractJsonPath(json, 'data.items[1].epc')).toBe('BBB')
  })

  it('stringifies objects and returns empty for missing paths', () => {
    expect(extractJsonPath(json, 'data.items.0')).toBe('{"epc":"AAA"}')
    expect(extractJsonPath(json, 'data.missing.deep')).toBe('')
    expect(extractJsonPath(json, '')).toBe('')
  })
})
