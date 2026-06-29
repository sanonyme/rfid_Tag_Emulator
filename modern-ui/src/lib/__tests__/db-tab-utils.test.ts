import { describe, expect, it } from 'vitest'
import { parseCsvImport, parseJsonImport, coerceImportValue } from '../db-import-parse'
import { prettifySql } from '../sql-format'

describe('prettifySql', () => {
  it('formats a simple SELECT', () => {
    const out = prettifySql('select a,b from t where x=1 order by a desc')
    expect(out).toContain('SELECT')
    expect(out).toContain('FROM')
    expect(out).toContain('WHERE')
    expect(out).toContain('ORDER')
  })

  it('preserves quoted strings', () => {
    const out = prettifySql("SELECT name FROM item WHERE barcode = '12,34'")
    expect(out).toContain("'12,34'")
  })
})

describe('parseCsvImport', () => {
  it('parses header and rows', () => {
    const parsed = parseCsvImport('id,name\n1,alpha\n2,"beta, two"')
    expect(parsed.columns).toEqual(['id', 'name'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[1].name).toBe('beta, two')
  })
})

describe('parseJsonImport', () => {
  it('parses array of objects', () => {
    const parsed = parseJsonImport('[{"id":1,"name":"a"},{"id":2,"name":"b"}]')
    expect(parsed.columns).toEqual(expect.arrayContaining(['id', 'name']))
    expect(parsed.rows).toHaveLength(2)
  })
})

describe('coerceImportValue', () => {
  it('maps NULL tokens', () => {
    expect(coerceImportValue('NULL')).toBeNull()
    expect(coerceImportValue('')).toBeNull()
  })
  it('parses numbers', () => {
    expect(coerceImportValue('42')).toBe(42)
    expect(coerceImportValue('-3.5')).toBe(-3.5)
  })
})
