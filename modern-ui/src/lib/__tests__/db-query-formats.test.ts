import { describe, expect, it } from 'vitest'
import {
  buildQueryFromFormat,
  DB_QUERY_FORMATS,
  getQueryFormatsForDatabase,
} from '../db-query-formats'

describe('getQueryFormatsForDatabase', () => {
  it('returns all formats when no ATS databases are available', () => {
    expect(getQueryFormatsForDatabase(['other_db'])).toEqual(DB_QUERY_FORMATS)
  })

  it('filters to staging-only formats when only staging exists', () => {
    const formats = getQueryFormatsForDatabase(['ats_db_staging'])
    expect(formats.every((f) => !f.database || f.database === 'ats_db_staging')).toBe(true)
    expect(formats.some((f) => f.database === 'ats_db_staging')).toBe(true)
    expect(formats.some((f) => f.database === 'ats_db')).toBe(false)
  })

  it('includes both staging and prod formats when both exist', () => {
    const formats = getQueryFormatsForDatabase(['ats_db_staging', 'ats_db'])
    expect(formats).toEqual(DB_QUERY_FORMATS)
  })
})

describe('buildQueryFromFormat', () => {
  it('replaces placeholders with supplied values', () => {
    const format = DB_QUERY_FORMATS[0]
    expect(buildQueryFromFormat(format, { container: 'ABC123' })).toContain("container = 'ABC123'")
  })

  it('leaves unknown placeholders intact', () => {
    const format = DB_QUERY_FORMATS[0]
    expect(buildQueryFromFormat(format, {})).toContain("container = '{{container}}'")
  })
})
