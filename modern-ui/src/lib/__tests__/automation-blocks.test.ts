import { describe, it, expect } from 'vitest'
import { parseHeaderLines, extractJsonPath, parseCodeStdout, executeAssert, executeGenerate, executeCode, applyTransform, executeTransform } from '../automation-blocks'
import type { AutomationStep } from '../automation-types'

function step(partial: Partial<AutomationStep> & { type: AutomationStep['type'] }): AutomationStep {
  return {
    id: 't',
    name: 't',
    params: {},
    ...partial,
  }
}

describe('executeAssert', () => {
  it('passes when condition is true and throws when false', async () => {
    const logs: string[] = []
    await executeAssert(
      step({ type: 'ASSERT', params: { condLeft: '3', condOp: 'gt', condRight: '0' } }),
      {},
      (m) => logs.push(m),
    )
    expect(logs.some((l) => l.includes('passed'))).toBe(true)

    await expect(
      executeAssert(
        step({
          type: 'ASSERT',
          params: { condLeft: '0', condOp: 'gt', condRight: '0', assertMessage: 'no tags' },
        }),
        {},
        () => {},
      ),
    ).rejects.toThrow('no tags')
  })
})

describe('executeGenerate', () => {
  it('writes a uuid into the save-as variable', async () => {
    const vars: Record<string, string> = {}
    await executeGenerate(
      step({ type: 'GENERATE', params: { generateKind: 'uuid', generateSaveAs: 'id' } }),
      vars,
      () => {},
    )
    expect(vars.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('rejects legacy java code nodes', async () => {
    await expect(
      executeCode(
        step({ type: 'CODE', params: { codeLanguage: 'java', codeSource: 'public class Main {}' } }),
        {},
        () => {},
      ),
    ).rejects.toThrow(/Java Code nodes were removed/)
  })
})


describe('applyTransform', () => {
  it('applies text operations', () => {
    expect(applyTransform('upper', 'abc', '', '')).toBe('ABC')
    expect(applyTransform('lower', 'ABC', '', '')).toBe('abc')
    expect(applyTransform('trim', '  x  ', '', '')).toBe('x')
    expect(applyTransform('length', 'abcd', '', '')).toBe('4')
    expect(applyTransform('replace', 'a-b-c', '-', '_')).toBe('a_b_c')
    expect(applyTransform('slice', 'abcdef', '1', '3')).toBe('bc')
    expect(applyTransform('prefix', 'id', 'X-', '')).toBe('X-id')
    expect(applyTransform('suffix', 'id', '!', '')).toBe('id!')
    expect(applyTransform('padStart', '7', '3', '0')).toBe('007')
    expect(applyTransform('default', '', 'fallback', '')).toBe('fallback')
    expect(applyTransform('default', 'here', 'fallback', '')).toBe('here')
  })

  it('applies number operations', () => {
    expect(applyTransform('round', '3.6', '', '')).toBe('4')
    expect(applyTransform('floor', '3.9', '', '')).toBe('3')
    expect(applyTransform('ceil', '3.1', '', '')).toBe('4')
    expect(applyTransform('abs', '-5', '', '')).toBe('5')
    expect(applyTransform('add', '2', '3', '')).toBe('5')
    expect(applyTransform('subtract', '9', '4', '')).toBe('5')
    expect(applyTransform('multiply', '3', '4', '')).toBe('12')
    expect(applyTransform('divide', '10', '4', '')).toBe('2.5')
    expect(applyTransform('modulo', '10', '3', '')).toBe('1')
    expect(applyTransform('toFixed', '3.14159', '2', '')).toBe('3.14')
  })

  it('extracts JSON and throws on invalid numeric / json input', () => {
    expect(applyTransform('jsonExtract', '{"a":{"b":7}}', 'a.b', '')).toBe('7')
    expect(() => applyTransform('add', 'x', '1', '')).toThrow()
    expect(() => applyTransform('divide', '1', '0', '')).toThrow(/zero/)
    expect(() => applyTransform('jsonExtract', 'not json', 'a', '')).toThrow(/JSON/)
  })
})

describe('executeTransform', () => {
  it('templates the input and stores the result', async () => {
    const vars: Record<string, string> = { epc: 'abc123' }
    await executeTransform(
      step({ type: 'TRANSFORM', params: { transformInput: '{{epc}}', transformOp: 'upper', transformSaveAs: 'out' } }),
      vars,
      () => {},
    )
    expect(vars.out).toBe('ABC123')
  })

  it('requires a valid save-as name', async () => {
    await expect(
      executeTransform(
        step({ type: 'TRANSFORM', params: { transformInput: 'x', transformOp: 'upper', transformSaveAs: '' } }),
        {},
        () => {},
      ),
    ).rejects.toThrow()
  })
})

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

describe('parseCodeStdout', () => {
  it('prefers a trailing JSON object', () => {
    const out = parseCodeStdout('some log line\n{"a":"1","b":2,"c":true}')
    expect(out).toEqual({ a: '1', b: '2', c: 'true' })
  })

  it('ignores non-object JSON and log noise, using the last object', () => {
    const out = parseCodeStdout('debugging...\n{"x":"first"}\nmore\n{"x":"last"}')
    expect(out).toEqual({ x: 'last' })
  })

  it('falls back to KEY=VALUE lines', () => {
    const out = parseCodeStdout('greeting=hello world\ncount=3\nnot a pair')
    expect(out).toEqual({ greeting: 'hello world', count: '3' })
  })

  it('returns empty when there is nothing to parse', () => {
    expect(parseCodeStdout('just some text\nno assignments')).toEqual({})
  })
})
