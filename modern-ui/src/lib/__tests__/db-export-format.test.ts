import { describe, expect, it } from 'vitest'
import { formatSqlInsertValue, formatSqlInserts } from '../db-export-format'

describe('db-export-format', () => {
  it('escapes SQL string values', () => {
    expect(formatSqlInsertValue(null)).toBe('NULL')
    expect(formatSqlInsertValue(42)).toBe('42')
    expect(formatSqlInsertValue("O'Brien")).toBe("'O''Brien'")
  })

  it('builds INSERT statements', () => {
    const sql = formatSqlInserts('items', ['id', 'name'], [
      { id: 1, name: 'alpha' },
      { id: 2, name: null },
    ])
    expect(sql).toContain('INSERT INTO `items` (`id`, `name`) VALUES (1, \'alpha\');')
    expect(sql).toContain('VALUES (2, NULL);')
  })
})
