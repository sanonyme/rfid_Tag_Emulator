import { describe, expect, it } from 'vitest'
import {
  MAX_EXECUTIONS,
  MAX_EXECUTION_LOG_LINES,
  formatDuration,
  formatRelativeTime,
  pushExecution,
  snapshotLog,
  updateExecution,
  type ExecutionRecord,
} from '../automation-executions'
import { resolveNodePolicy, nodeSupportsErrorPolicy } from '../automation-types'

function rec(id: string, startedAt = 0): ExecutionRecord {
  return { id, startedAt, status: 'success', scope: 'x', stepsRun: 0, log: [], logTruncated: false }
}

describe('execution history', () => {
  it('prepends and caps the list', () => {
    let list: ExecutionRecord[] = []
    for (let i = 0; i < MAX_EXECUTIONS + 5; i++) list = pushExecution(list, rec(`r${i}`, i))
    expect(list).toHaveLength(MAX_EXECUTIONS)
    expect(list[0].id).toBe(`r${MAX_EXECUTIONS + 4}`)
  })

  it('replaces an existing record instead of duplicating', () => {
    const list = pushExecution(pushExecution([], rec('a')), { ...rec('a'), status: 'error' })
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('error')
  })

  it('patches a record in place', () => {
    const list = updateExecution([rec('a'), rec('b')], 'b', { stepsRun: 7 })
    expect(list[1].stepsRun).toBe(7)
    expect(list[0].stepsRun).toBe(0)
  })

  it('keeps only the tail of long logs', () => {
    const lines = Array.from({ length: MAX_EXECUTION_LOG_LINES + 10 }, (_, i) => `l${i}`)
    const snap = snapshotLog(lines)
    expect(snap.logTruncated).toBe(true)
    expect(snap.log).toHaveLength(MAX_EXECUTION_LOG_LINES)
    expect(snap.log[snap.log.length - 1]).toBe(`l${MAX_EXECUTION_LOG_LINES + 9}`)
  })

  it('formats durations and relative times', () => {
    expect(formatDuration(250)).toBe('250 ms')
    expect(formatDuration(2500)).toBe('2.5 s')
    expect(formatDuration(65_000)).toBe('1m 05s')
    expect(formatRelativeTime(1000, 2000)).toBe('just now')
    expect(formatRelativeTime(0, 5 * 60_000)).toBe('5 min ago')
  })
})

describe('node retry / on-error policy', () => {
  it('defaults to a single try that stops the run', () => {
    expect(resolveNodePolicy({})).toEqual({ maxTries: 1, retryWaitMs: 1000, onError: 'stop' })
  })

  it('clamps retry settings', () => {
    expect(resolveNodePolicy({ retryOnFail: true, retryMaxTries: 99, retryWaitMs: -5 })).toEqual({
      maxTries: 10,
      retryWaitMs: 0,
      onError: 'stop',
    })
    expect(resolveNodePolicy({ retryOnFail: true }).maxTries).toBe(3)
  })

  it('accepts the continue modes', () => {
    expect(resolveNodePolicy({ onError: 'errorOutput' }).onError).toBe('errorOutput')
    expect(resolveNodePolicy({ onError: 'continue' }).onError).toBe('continue')
    expect(resolveNodePolicy({ onError: 'bogus' as never }).onError).toBe('stop')
  })

  it('excludes pure control-flow nodes', () => {
    expect(nodeSupportsErrorPolicy('CONDITION')).toBe(false)
    expect(nodeSupportsErrorPolicy('COMMENT')).toBe(false)
    expect(nodeSupportsErrorPolicy('HTTP_REQUEST')).toBe(true)
  })
})
