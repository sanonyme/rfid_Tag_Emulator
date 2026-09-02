import { describe, expect, it } from 'vitest'
import type { SchemaData } from '../db-tab-shared'
import {
  buildCartonInspectSql,
  buildCartonListSql,
  buildOrderInspectSql,
  buildOrderListSql,
  groupCartonInspectRows,
  groupOrderInspectRows,
  parsePackingChoices,
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

  it('selects Edge carton/order columns and lookup joins when the schema has them', () => {
    const col = (name: string, key = '') => ({ name, type: 'varchar', key })
    const edge: SchemaData = {
      tables: [
        {
          name: 'order',
          columns: [
            col('id', 'PRI'), col('orderNumber'), col('completed'), col('statusId', 'MUL'),
            col('type'), col('generated'), col('customerId', 'MUL'),
            col('sourceOrganizationId', 'MUL'), col('destinationOrganizationId', 'MUL'),
            col('sourceLocationId', 'MUL'), col('destinationLocationId', 'MUL'),
            col('field1'), col('field2'), col('field3'), col('field4'), col('field5'),
            col('field6'), col('field7'), col('field8'), col('field9'), col('field10'),
          ],
        },
        {
          name: 'container',
          columns: [
            col('id', 'PRI'), col('sscc'), col('epc'), col('orderId', 'MUL'),
            col('weight'), col('type'), col('poNumber'), col('isVirtual'),
            col('expectedItems'), col('generated'), col('statusId', 'MUL'),
            col('customerId', 'MUL'), col('currentLocationId', 'MUL'),
            col('sourceOrganizationId'), col('destinationOrganizationId'),
            col('sourceLocationId', 'MUL'), col('destinationLocationId', 'MUL'),
            col('field1'), col('field2'), col('field3'), col('field4'), col('field5'),
            col('field6'), col('field7'), col('field8'), col('field9'), col('field10'),
          ],
        },
        { name: 'container_item', columns: [col('id', 'PRI'), col('containerId', 'MUL'), col('itemId', 'MUL'), col('quantity'), col('deleted')] },
        { name: 'item', columns: [col('id', 'PRI'), col('barcode'), col('name')] },
        { name: 'organization', columns: [col('id', 'PRI'), col('name'), col('code')] },
        { name: 'status', columns: [col('id', 'PRI'), col('status')] },
        { name: 'customer', columns: [col('id', 'PRI'), col('name')] },
        { name: 'location', columns: [col('id', 'PRI'), col('name')] },
      ],
      foreignKeys: [{
        constraintName: 'fk_container_order',
        childTable: 'container',
        childColumns: ['orderId'],
        parentTable: 'order',
        parentColumns: ['id'],
      }],
    }
    const built = buildCartonInspectSql(edge, '401960485')
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.sql).toContain('c.`generated` AS `cartonGenerated`')
    expect(built.sql).toContain('c.`expectedItems` AS `cartonExpectedItems`')
    expect(built.sql).toContain('c.`field1` AS `cartonField1`')
    expect(built.sql).toContain('c.`field10` AS `cartonField10`')
    expect(built.sql).toContain('o.`generated` AS `orderGenerated`')
    expect(built.sql).toContain('o.`field1` AS `orderField1`')
    expect(built.sql).toContain('LEFT JOIN `organization` csorg')
    expect(built.sql).toContain('csorg.`name` AS `cartonSourceOrg`')
    expect(built.sql).toContain('LEFT JOIN `organization` osorg')
    expect(built.sql).toContain('LEFT JOIN `status` cst')
    expect(built.sql).toContain('LEFT JOIN `customer` ccust')
    expect(built.sql).toContain('LEFT JOIN `location` cloc')
  })

  it('groups carton rows with generated, expected, org, and custom fields', () => {
    const model = groupCartonInspectRows([
      {
        containerId: 10,
        sscc: 'SSCC-A',
        orderNumber: '5003',
        cartonGenerated: 1,
        cartonExpectedItems: 12,
        cartonSourceOrg: 'DC East',
        cartonField1: 'alpha',
        cartonField2: 'beta',
        orderGenerated: 0,
        orderSourceOrg: 'HQ',
        orderField1: 'po-9',
        quantity: 2,
        itemId: 5,
        barcode: '111',
        itemLabel: 'Shirt',
      },
    ], 'SSCC-A')
    expect(model.fields.find((f) => f.key === 'cartonGenerated')?.value).toBe('Yes')
    expect(model.fields.find((f) => f.key === 'cartonExpectedItems')?.value).toBe('12')
    expect(model.fields.find((f) => f.key === 'cartonSourceOrg')?.value).toBe('DC East')
    expect(model.fields.find((f) => f.key === 'cartonField1')?.value).toBe('alpha')
    expect(model.fields.find((f) => f.key === 'cartonField2')?.value).toBe('beta')
    expect(model.orderFields.find((f) => f.key === 'orderGenerated')?.value).toBe('No')
    expect(model.orderFields.find((f) => f.key === 'orderSourceOrg')?.value).toBe('HQ')
    expect(model.orderFields.find((f) => f.key === 'orderField1')?.value).toBe('po-9')
  })

  it('lists available orders and cartons', () => {
    const orders = buildOrderListSql(schema)
    expect(orders.ok).toBe(true)
    if (orders.ok) {
      expect(orders.sql).toContain('FROM `order` o')
      expect(orders.sql).toContain('AS value')
      expect(orders.sql).not.toMatch(/LIMIT\s+\d+/i)
    }
    const cartons = buildCartonListSql(schema)
    expect(cartons.ok).toBe(true)
    if (cartons.ok) {
      expect(cartons.sql).toContain('FROM `container` c')
      expect(cartons.sql).toContain('LEFT JOIN `order` o')
      expect(cartons.sql).toContain('AS hint')
      expect(cartons.sql).not.toMatch(/LIMIT\s+\d+/i)
    }
    expect(parsePackingChoices([
      { value: '5003', hint: null },
      { value: '5003', hint: 'dup' },
      { value: '401960485', hint: '5003' },
    ]).map((c) => c.value)).toEqual(['5003', '401960485'])
  })
})
