import { describe, expect, it } from 'vitest'
import { buildExplainSql, extractCreateTableName, isDirectlyExplainable } from '../sql-explain'

describe('extractCreateTableName', () => {
  it('parses backtick-quoted table names', () => {
    const ddl = `CREATE TABLE \`retained_import_definition_data\` (\`id\` INT (11) NOT NULL AUTO_INCREMENT)`
    expect(extractCreateTableName(ddl)).toBe('`retained_import_definition_data`')
  })

  it('parses IF NOT EXISTS', () => {
    expect(extractCreateTableName('CREATE TABLE IF NOT EXISTS foo (id INT)')).toBe('foo')
  })
})

describe('isDirectlyExplainable', () => {
  it('accepts SELECT and EXPLAIN SELECT', () => {
    expect(isDirectlyExplainable('SELECT * FROM t')).toBe(true)
    expect(isDirectlyExplainable('EXPLAIN SELECT * FROM t')).toBe(true)
    expect(isDirectlyExplainable('EXPLAIN ANALYZE SELECT * FROM t')).toBe(true)
  })

  it('rejects CREATE TABLE', () => {
    expect(isDirectlyExplainable('CREATE TABLE t (id INT)')).toBe(false)
  })

  it('accepts SELECT after line comments', () => {
    expect(isDirectlyExplainable('-- Write your SQL query here\nSELECT * FROM t')).toBe(true)
    expect(isDirectlyExplainable('/* setup */\nEXPLAIN SELECT * FROM t')).toBe(true)
  })
})

describe('buildExplainSql', () => {
  it('wraps SELECT with EXPLAIN', () => {
    expect(buildExplainSql('SELECT 1')).toEqual({ ok: true, sql: 'EXPLAIN SELECT 1' })
  })

  it('wraps SELECT with EXPLAIN after line comments', () => {
    expect(buildExplainSql('-- Write your SQL query here\nSELECT * FROM users')).toEqual({
      ok: true,
      sql: 'EXPLAIN SELECT * FROM users',
    })
  })

  it('passes through EXPLAIN after line comments', () => {
    expect(buildExplainSql('-- plan\nEXPLAIN SELECT * FROM users')).toEqual({
      ok: true,
      sql: 'EXPLAIN SELECT * FROM users',
    })
  })

  it('handles comments between EXPLAIN and SELECT', () => {
    expect(buildExplainSql('EXPLAIN /* plan */ SELECT * FROM users')).toEqual({
      ok: true,
      sql: 'EXPLAIN SELECT * FROM users',
    })
  })

  it('maps CREATE TABLE to EXPLAIN SELECT on that table', () => {
    const ddl = `CREATE TABLE \`retained_import_definition_data\` (\`id\` INT (11) NOT NULL AUTO_INCREMENT)`
    const result = buildExplainSql(ddl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.sql).toBe('EXPLAIN SELECT * FROM `retained_import_definition_data` LIMIT 0')
      expect(result.note).toContain('CREATE TABLE')
    }
  })

  it('rejects EXPLAIN CREATE TABLE', () => {
    const result = buildExplainSql('EXPLAIN CREATE TABLE t (id INT)')
    expect(result.ok).toBe(false)
  })
})
