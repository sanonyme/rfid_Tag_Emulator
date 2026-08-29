import { describe, expect, it } from 'vitest'
import type { SchemaData } from '../db-tab-shared'
import {
  buildCartonInspectSql,
  buildOrderInspectSql,
  groupCartonInspectRows,
  groupOrderInspectRows,
} from '../db-inspect'

const schema: SchemaData = {
  tables: [
    { name: 'order', columns: [{ name: 'id', type: 'int', key: 'PRI' }, { name: 'orderNumber', type: 'varchar', key: '' }] },
    { name: 'container', columns: [{ name: 'id', type: 'int', key: 'PRI' }, { name: 'sscc', type: 'varchar', key: '' }, { name: 'orderId', type: 'int', key: 'MUL' }] },
    { name: 'container_item', columns: [
      { name: 'id', type: 'int', key: 'PRI' },
      { name: 'containerId', type: 'int', key: 'MUL' },
      { name: 'itemId', type: 'int', key: 'MUL' },
      { name: 'quantity', type: 'int', key: '' },
      { name: 'deleted', type: 'tinyint', key: '' },
    ] },
    { name: 'item', columns: [{ name: 'id', type: 'int', key: 'PRI' }, { name: 'barcode', type: 'varchar', key: '' }, { name: 'name', type: 'varchar', key: '' }] },
  ],
  foreignKeys: [
    {
      constraintName: 'fk_container_order',
      childTable: 'container',
      childColumns: ['orderId'],
      parentTable: 'order',
      parentColumns: ['id'],
    },
  ],
}

describe('db-inspect', () => {
  it('builds an order packing-list join using orderId', () => {
    const built = buildOrderInspectSql(schema, "SO-1")
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.sql).toContain('FROM `order` o')
    expect(built.sql).toContain('LEFT JOIN `container` c')
    expect(built.sql).toContain('c.`orderId` = o.`id`')
    expect(built.sql).toContain('LEFT JOIN `container_item` ci')
    expect(built.sql).toContain('LEFT JOIN `item` i')
    expect(built.sql).toContain("WHERE o.`orderNumber` = 'SO-1'")
    expect(built.sql).toContain('IFNULL(ci.`deleted`, 0) = 0')
  })

  it('escapes quotes in the lookup value', () => {
    const built = buildOrderInspectSql(schema, "SO-'99")
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.sql).toContain("WHERE o.`orderNumber` = 'SO-''99'")
  })

  it('builds a carton inspect query by SSCC', () => {
    const built = buildCartonInspectSql(schema, '006141411234567890')
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.sql).toContain('FROM `container` c')
    expect(built.sql).toContain('LEFT JOIN `order` o')
    expect(built.sql).toContain("WHERE c.`sscc` = '006141411234567890'")
  })

  it('groups order rows into cartons with quantities', () => {
    const model = groupOrderInspectRows([
      { orderId: 1, orderNumber: 'SO-1', containerId: 10, sscc: 'SSCC-A', quantity: 2, itemId: 5, barcode: '111', itemLabel: 'Shirt' },
      { orderId: 1, orderNumber: 'SO-1', containerId: 10, sscc: 'SSCC-A', quantity: 1, itemId: 6, barcode: '222', itemLabel: 'Hat' },
      { orderId: 1, orderNumber: 'SO-1', containerId: 11, sscc: 'SSCC-B', quantity: 4, itemId: 5, barcode: '111', itemLabel: 'Shirt' },
    ], 'SO-1')
    expect(model.found).toBe(true)
    expect(model.cartons).toHaveLength(2)
    expect(model.cartons[0]!.sscc).toBe('SSCC-A')
    expect(model.cartons[0]!.lines).toHaveLength(2)
    expect(model.cartons[0]!.totalQty).toBe(3)
    expect(model.cartons[1]!.totalQty).toBe(4)
  })

  it('groups carton rows into item lines', () => {
    const model = groupCartonInspectRows([
      { containerId: 10, sscc: 'SSCC-A', orderNumber: 'SO-1', quantity: 2, itemId: 5, barcode: '111', itemLabel: 'Shirt' },
      { containerId: 10, sscc: 'SSCC-A', orderNumber: 'SO-1', quantity: 1, itemId: 6, barcode: '222', itemLabel: 'Hat' },
    ], 'SSCC-A')
    expect(model.found).toBe(true)
    expect(model.orderNumber).toBe('SO-1')
    expect(model.lines).toHaveLength(2)
    expect(model.lines[0]!.quantity).toBe(2)
  })

  it('marks missing lookups as not found', () => {
    expect(groupOrderInspectRows([], 'SO-X').found).toBe(false)
    expect(groupCartonInspectRows([], 'SSCC-X').found).toBe(false)
  })
})
