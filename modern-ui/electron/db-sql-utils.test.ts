// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { assertSafeSqlIdentifier, DB_QUERY_MAX_ROWS } from './db-sql-utils.js'

describe('assertSafeSqlIdentifier', () => {
  it('accepts simple identifiers', () => {
    expect(assertSafeSqlIdentifier('my_db')).toBe('my_db')
    expect(assertSafeSqlIdentifier(' Table1 ')).toBe('Table1')
  })

  it('rejects injection-like names', () => {
    expect(assertSafeSqlIdentifier('db;drop')).toBeNull()
    expect(assertSafeSqlIdentifier('')).toBeNull()
    expect(assertSafeSqlIdentifier('a-b')).toBeNull()
  })
})

describe('DB_QUERY_MAX_ROWS', () => {
  it('caps ad-hoc SELECT results', () => {
    expect(DB_QUERY_MAX_ROWS).toBe(1000)
  })
})
