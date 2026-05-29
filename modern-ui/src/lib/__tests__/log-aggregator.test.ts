import { describe, expect, it } from 'vitest'
import {
  aggregatedFilename,
  classifyLogFilename,
  groupClassifiedFiles,
  shouldAggregateCategory,
  sortLogFiles,
} from '../log-aggregator'

describe('classifyLogFilename', () => {
  it('classifies vsbl hourly files', () => {
    expect(classifyLogFilename('vsbl.2026-05-28-07.log')).toEqual({
      kind: 'vsbl',
      folder: 'vsbl.2026-05-28-07',
      filename: 'vsbl.2026-05-28-07.log',
      sortKey: '2026-05-28-07',
    })
  })

  it('classifies vsbl current log', () => {
    expect(classifyLogFilename('vsbl.log')).toEqual({
      kind: 'vsbl',
      folder: 'vsbl',
      filename: 'vsbl.log',
      sortKey: '9999-99-99-99',
    })
  })

  it('classifies rotated category logs', () => {
    expect(classifyLogFilename('core.log.2026-05-28-07')).toEqual({
      kind: 'category',
      folder: 'core',
      filename: 'core.log.2026-05-28-07',
      sortKey: '2026-05-28-07',
      category: 'core',
    })
  })

  it('classifies current category logs', () => {
    expect(classifyLogFilename('access.log')).toEqual({
      kind: 'category',
      folder: 'access',
      filename: 'access.log',
      sortKey: '9999-99-99-99',
      category: 'access',
    })
  })

  it('handles nested zip paths via basename', () => {
    expect(classifyLogFilename('logs/core.log.2026-05-28-09')?.filename).toBe('core.log.2026-05-28-09')
  })

  it('classifies hyphenated categories', () => {
    expect(classifyLogFilename('input-states.log.2026-05-28-10')?.category).toBe('input-states')
    expect(classifyLogFilename('devices-statistics.log')?.category).toBe('devices-statistics')
  })

  it('classifies underscored categories', () => {
    expect(classifyLogFilename('system_info.log.2026-05-28-07')?.category).toBe('system_info')
    expect(classifyLogFilename('system_info.log')?.category).toBe('system_info')
  })

  it('returns null for unknown files', () => {
    expect(classifyLogFilename('readme.txt')).toBeNull()
  })
})

describe('sortLogFiles', () => {
  it('orders hourly rotations before the current log', () => {
    const files = [
      classifyLogFilename('core.log')!,
      classifyLogFilename('core.log.2026-05-28-09')!,
      classifyLogFilename('core.log.2026-05-28-07')!,
    ]
    const sorted = sortLogFiles(files)
    expect(sorted.map((f) => f.filename)).toEqual([
      'core.log.2026-05-28-07',
      'core.log.2026-05-28-09',
      'core.log',
    ])
  })
})

describe('groupClassifiedFiles', () => {
  it('groups categories and vsbl separately', () => {
    const files = [
      classifyLogFilename('core.log.2026-05-28-07')!,
      classifyLogFilename('core.log')!,
      classifyLogFilename('vsbl.2026-05-28-07.log')!,
    ]
    const { categories, vsbl } = groupClassifiedFiles(files)
    expect(categories.get('core')?.map((f) => f.filename)).toEqual([
      'core.log.2026-05-28-07',
      'core.log',
    ])
    expect(vsbl).toHaveLength(1)
  })
})

describe('aggregation helpers', () => {
  it('aggregates only when there are 2+ files', () => {
    expect(shouldAggregateCategory([classifyLogFilename('core.log')!])).toBe(false)
    expect(
      shouldAggregateCategory([
        classifyLogFilename('core.log.2026-05-28-07')!,
        classifyLogFilename('core.log')!,
      ]),
    ).toBe(true)
  })

  it('names aggregated files consistently', () => {
    expect(aggregatedFilename('input-states')).toBe('aggregated_input-states.log')
  })
})
