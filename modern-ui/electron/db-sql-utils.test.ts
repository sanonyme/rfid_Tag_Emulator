// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyQueryRowLimit, assertSafeSqlIdentifier, DB_QUERY_MAX_ROWS } from './db-sql-utils.js'

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

describe('applyQueryRowLimit', () => {
  it('appends LIMIT to SELECT without one', () => {
    expect(applyQueryRowLimit('SELECT * FROM t;', 1000)).toBe('SELECT * FROM t LIMIT 1000')
  })

  it('leaves SELECT with an existing LIMIT alone', () => {
    expect(applyQueryRowLimit('SELECT * FROM t LIMIT 5', 1000)).toBe('SELECT * FROM t LIMIT 5')
  })

  it('does not append LIMIT to SHOW / DESCRIBE / EXPLAIN', () => {
    expect(applyQueryRowLimit('SHOW FULL processlist;', 1000)).toBe('SHOW FULL processlist;')
    expect(applyQueryRowLimit('SHOW TABLES', 1000)).toBe('SHOW TABLES')
    expect(applyQueryRowLimit('DESCRIBE users', 1000)).toBe('DESCRIBE users')
    expect(applyQueryRowLimit('EXPLAIN SELECT * FROM t', 1000)).toBe('EXPLAIN SELECT * FROM t')
  })

  it('appends LIMIT to WITH … SELECT', () => {
    expect(applyQueryRowLimit('WITH c AS (SELECT 1 AS n) SELECT * FROM c', 50)).toBe(
      'WITH c AS (SELECT 1 AS n) SELECT * FROM c LIMIT 50',
    )
  })
})
