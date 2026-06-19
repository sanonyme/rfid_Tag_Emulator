import { describe, it, expect } from 'vitest'
import { mergeProcessIntoList } from '../edge-api-client'
import { buildSerialInvokeBody, recordToInvokeParams } from '../edge-api-types'

describe('mergeProcessIntoList', () => {
  it('appends unknown processes', () => {
    const next = mergeProcessIntoList([{ name: 'A' }], { name: 'B', started: true })
    expect(next).toEqual([
      { name: 'A' },
      { name: 'B', started: true },
    ])
  })

  it('merges fields into an existing process', () => {
    const next = mergeProcessIntoList(
      [{ name: 'flow', started: false }],
      { name: 'flow', started: true },
    )
    expect(next).toEqual([{ name: 'flow', started: true }])
  })
})

describe('edge invoke body builders', () => {
  it('buildSerialInvokeBody uses ordered param names', () => {
    const body = buildSerialInvokeBody('MyBlock', { a: '1', b: '2' }, ['b', 'a'])
    expect(body.activityName).toBe('MyBlock')
    expect(body.params).toEqual([
      { key: 'b', value: '2' },
      { key: 'a', value: '1' },
    ])
  })

  it('recordToInvokeParams strips empty values', () => {
    const params = recordToInvokeParams({ keep: 'x', drop: '  ', nil: undefined })
    expect(params).toEqual([{ key: 'keep', value: 'x' }])
  })
})
