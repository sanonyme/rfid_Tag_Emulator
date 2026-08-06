import { describe, expect, it } from 'vitest'
import { BUILTIN_QUERIES, escapeSqlString, getBuiltinQuery } from '../db-builtin-queries'

describe('db-builtin-queries', () => {
  it('escapes single quotes in values', () => {
    expect(escapeSqlString("O'Brien")).toBe("O''Brien")
  })

  it('builds container-by-sscc lookup', () => {
    const sql = getBuiltinQuery('container-by-sscc')!.buildSql('006141411234567890')
    expect(sql).toContain('FROM container')
    expect(sql).toContain("WHERE sscc = '006141411234567890'")
  })

  it('quotes reserved order table name', () => {
    const sql = getBuiltinQuery('order-by-number')!.buildSql("SO-1")
    expect(sql).toContain('FROM `order`')
    expect(sql).toContain("WHERE orderNumber = 'SO-1'")
  })

  it('builds item-by-barcode lookup', () => {
    const sql = getBuiltinQuery('item-by-barcode')!.buildSql('09521234123453')
    expect(sql).toContain('FROM item')
    expect(sql).toContain("WHERE barcode = '09521234123453'")
  })

  it('joins container → container_item → item by sscc', () => {
    const sql = getBuiltinQuery('container-items-by-sscc')!.buildSql('006141411234567890')
    expect(sql).toContain('FROM container c')
    expect(sql).toContain('INNER JOIN container_item ci')
    expect(sql).toContain('ON ci.containerId = c.id')
    expect(sql).toContain('INNER JOIN item i')
    expect(sql).toContain('ON i.id = ci.itemId')
    expect(sql).toContain("WHERE c.sscc = '006141411234567890'")
  })

  it('exposes four built-in templates', () => {
    expect(BUILTIN_QUERIES).toHaveLength(4)
  })
})
