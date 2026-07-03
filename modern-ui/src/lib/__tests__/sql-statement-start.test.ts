import { describe, expect, it } from 'vitest'
import {
  hasLimitClause,
  isReadQuery,
  prepareReadQuery,
  sqlExplainTarget,
  sqlStatementStart,
} from '../sql-statement-start'

describe('sqlStatementStart', () => {
  it('skips leading line and block comments', () => {
    expect(sqlStatementStart('-- Write your SQL query here\nSELECT * FROM users')).toBe(
      'SELECT * FROM users',
    )
    expect(sqlStatementStart('/* setup */\r\nEXPLAIN SELECT * FROM t')).toBe('EXPLAIN SELECT * FROM t')
  })
})

describe('isReadQuery', () => {
  it('treats EXPLAIN after comments as read-only', () => {
    expect(isReadQuery('-- plan\nEXPLAIN SELECT * FROM users')).toBe(true)
  })
})

describe('prepareReadQuery', () => {
  it('strips comments and appends LIMIT for read queries', () => {
    expect(prepareReadQuery('-- Write your SQL query here\nSELECT * FROM users', 1000)).toBe(
      'SELECT * FROM users LIMIT 1000',
    )
    expect(prepareReadQuery('-- plan\nEXPLAIN SELECT * FROM users', 1000)).toBe(
      'EXPLAIN SELECT * FROM users LIMIT 1000',
    )
  })

  it('does not treat limit in identifiers as a LIMIT clause', () => {
    expect(prepareReadQuery("SELECT * FROM products WHERE category = 'limit_offers'", 1000)).toBe(
      "SELECT * FROM products WHERE category = 'limit_offers' LIMIT 1000",
    )
    expect(hasLimitClause("SELECT * FROM products WHERE category = 'limit_offers'")).toBe(false)
  })
})

describe('sqlExplainTarget', () => {
  it('removes EXPLAIN prefix and comments before the core statement', () => {
    expect(sqlExplainTarget('EXPLAIN /* plan */ SELECT * FROM users')).toBe('SELECT * FROM users')
  })
})
