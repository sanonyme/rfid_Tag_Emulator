import { escapeSqlString } from './db-builtin-queries'
import { quoteIdent, type SchemaData } from './db-tab-shared'

function lit(value: string): string {
  return `'${escapeSqlString(value.trim())}'`
}

function norm(name: string): string {
  return name.replace(/[`"]/g, '').toLowerCase()
}

function findTable(schema: SchemaData | null, candidates: string[]): { name: string; columns: string[] } | null {
  if (!schema) return null
  const wanted = new Set(candidates.map(norm))
  for (const t of schema.tables) {
    if (wanted.has(norm(t.name))) {
      return { name: t.name, columns: t.columns.map((c) => c.name) }
    }
  }
  return null
}

function findColumn(columns: string[], candidates: string[]): string | null {
  const wanted = new Set(candidates.map(norm))
  for (const col of columns) {
    if (wanted.has(norm(col))) return col
  }
  return null
}

function findFk(
  schema: SchemaData | null,
  childName: string,
  parentName: string,
): { childCol: string; parentCol: string } | null {
  if (!schema) return null
  const child = norm(childName)
  const parent = norm(parentName)
  for (const fk of schema.foreignKeys) {
    if (norm(fk.childTable) === child && norm(fk.parentTable) === parent && fk.childColumns[0] && fk.parentColumns[0]) {
      return { childCol: fk.childColumns[0], parentCol: fk.parentColumns[0] }
    }
  }
  return null
}

export type InspectLine = {
  itemId: string
  quantity: number
  barcode: string
  label: string
}

export type InspectCarton = {
  containerId: string
  sscc: string
  lines: InspectLine[]
  totalQty: number
}

export type OrderInspectModel = {
  orderNumber: string
  orderId: string
  cartons: InspectCarton[]
  found: boolean
}

export type CartonInspectModel = {
  sscc: string
  containerId: string
  orderNumber: string
  lines: InspectLine[]
  found: boolean
}

export type InspectSqlResult =
  | { ok: true; sql: string }
  | { ok: false; error: string }

function itemJoinCols(itemCols: string[]): { barcode: string | null; label: string | null } {
  return {
    barcode: findColumn(itemCols, ['barcode', 'gtin', 'upc', 'ean', 'sku']),
    label: findColumn(itemCols, ['name', 'itemName', 'description', 'title', 'sku', 'itemNumber', 'partNumber']),
  }
}

function itemSelects(itemCols: string[], itemIdCol: string): { barcodeSelect: string; labelSelect: string } {
  const fields = itemJoinCols(itemCols)
  const barcodeSelect = fields.barcode
    ? `i.${quoteIdent(fields.barcode)} AS barcode`
    : `CAST(i.${quoteIdent(itemIdCol)} AS CHAR) AS barcode`
  const labelSelect = fields.label
    ? `i.${quoteIdent(fields.label)} AS itemLabel`
    : fields.barcode
      ? `i.${quoteIdent(fields.barcode)} AS itemLabel`
      : `CAST(i.${quoteIdent(itemIdCol)} AS CHAR) AS itemLabel`
  return { barcodeSelect, labelSelect }
}

function orderContainerJoin(
  schema: SchemaData | null,
  orderTable: string,
  orderCols: string[],
  containerTable: string,
  containerCols: string[],
): { sql: string } | null {
  const fk = findFk(schema, containerTable, orderTable)
  if (fk) {
    return {
      sql: `c.${quoteIdent(fk.childCol)} = o.${quoteIdent(fk.parentCol)}`,
    }
  }
  const orderIdCol = findColumn(orderCols, ['id'])
  const containerOrderId = findColumn(containerCols, ['orderId', 'order_id', 'idOrder', 'id_order'])
  if (orderIdCol && containerOrderId) {
    return { sql: `c.${quoteIdent(containerOrderId)} = o.${quoteIdent(orderIdCol)}` }
  }
  const orderNumberCol = findColumn(orderCols, ['orderNumber', 'order_number', 'number'])
  const containerOrderNumber = findColumn(containerCols, ['orderNumber', 'order_number'])
  if (orderNumberCol && containerOrderNumber) {
    return { sql: `c.${quoteIdent(containerOrderNumber)} = o.${quoteIdent(orderNumberCol)}` }
  }
  return null
}

function deletedPredicate(alias: string, columns: string[]): string {
  const deletedCol = findColumn(columns, ['deleted', 'isDeleted', 'is_deleted'])
  if (!deletedCol) return '1=1'
  return `IFNULL(${alias}.${quoteIdent(deletedCol)}, 0) = 0`
}

/**
 * Build a packing-list SELECT: order → carton(s) → lines → item.
 * Uses foreign keys when the schema graph has them; otherwise common column names.
 */
export function buildOrderInspectSql(schema: SchemaData | null, orderNumber: string): InspectSqlResult {
  const order = findTable(schema, ['order']) ?? { name: 'order', columns: ['id', 'orderNumber'] }
  const container = findTable(schema, ['container', 'carton']) ?? { name: 'container', columns: ['id', 'sscc', 'orderId'] }
  const containerItem = findTable(schema, ['container_item', 'containerItem', 'carton_item'])
    ?? { name: 'container_item', columns: ['id', 'containerId', 'itemId', 'quantity', 'deleted'] }
  const item = findTable(schema, ['item', 'items']) ?? { name: 'item', columns: ['id', 'barcode', 'name'] }

  const orderNumberCol = findColumn(order.columns, ['orderNumber', 'order_number', 'number']) ?? 'orderNumber'
  const orderIdCol = findColumn(order.columns, ['id']) ?? 'id'
  const ssccCol = findColumn(container.columns, ['sscc', 'SSCC', 'serial']) ?? 'sscc'
  const containerIdCol = findColumn(container.columns, ['id']) ?? 'id'
  const ciContainerCol = findColumn(containerItem.columns, ['containerId', 'container_id', 'idContainer']) ?? 'containerId'
  const ciItemCol = findColumn(containerItem.columns, ['itemId', 'item_id', 'idItem']) ?? 'itemId'
  const qtyCol = findColumn(containerItem.columns, ['quantity', 'qty', 'count']) ?? 'quantity'
  const itemIdCol = findColumn(item.columns, ['id']) ?? 'id'
  const { barcodeSelect, labelSelect } = itemSelects(item.columns, itemIdCol)

  const join = orderContainerJoin(schema, order.name, order.columns, container.name, container.columns)
  if (!join) {
    return {
      ok: false,
      error: 'Could not find how cartons link to orders. Expected container.orderId (or a foreign key to `order`).',
    }
  }

  const sql = [
    'SELECT',
    `  o.${quoteIdent(orderIdCol)} AS orderId,`,
    `  o.${quoteIdent(orderNumberCol)} AS orderNumber,`,
    `  c.${quoteIdent(containerIdCol)} AS containerId,`,
    `  c.${quoteIdent(ssccCol)} AS sscc,`,
    `  ci.${quoteIdent(qtyCol)} AS quantity,`,
    `  i.${quoteIdent(itemIdCol)} AS itemId,`,
    `  ${barcodeSelect},`,
    `  ${labelSelect}`,
    `FROM ${quoteIdent(order.name)} o`,
    `LEFT JOIN ${quoteIdent(container.name)} c`,
    `  ON ${join.sql}`,
    `LEFT JOIN ${quoteIdent(containerItem.name)} ci`,
    `  ON ci.${quoteIdent(ciContainerCol)} = c.${quoteIdent(containerIdCol)}`,
    `  AND ${deletedPredicate('ci', containerItem.columns)}`,
    `LEFT JOIN ${quoteIdent(item.name)} i`,
    `  ON i.${quoteIdent(itemIdCol)} = ci.${quoteIdent(ciItemCol)}`,
    `WHERE o.${quoteIdent(orderNumberCol)} = ${lit(orderNumber)}`,
    `ORDER BY c.${quoteIdent(ssccCol)}, i.${quoteIdent(itemIdCol)};`,
  ].join('\n')

  return { ok: true, sql }
}

export function buildCartonInspectSql(schema: SchemaData | null, sscc: string): InspectSqlResult {
  const order = findTable(schema, ['order'])
  const container = findTable(schema, ['container', 'carton']) ?? { name: 'container', columns: ['id', 'sscc', 'orderId'] }
  const containerItem = findTable(schema, ['container_item', 'containerItem', 'carton_item'])
    ?? { name: 'container_item', columns: ['id', 'containerId', 'itemId', 'quantity', 'deleted'] }
  const item = findTable(schema, ['item', 'items']) ?? { name: 'item', columns: ['id', 'barcode', 'name'] }

  const ssccCol = findColumn(container.columns, ['sscc', 'SSCC', 'serial']) ?? 'sscc'
  const containerIdCol = findColumn(container.columns, ['id']) ?? 'id'
  const ciContainerCol = findColumn(containerItem.columns, ['containerId', 'container_id', 'idContainer']) ?? 'containerId'
  const ciItemCol = findColumn(containerItem.columns, ['itemId', 'item_id', 'idItem']) ?? 'itemId'
  const qtyCol = findColumn(containerItem.columns, ['quantity', 'qty', 'count']) ?? 'quantity'
  const itemIdCol = findColumn(item.columns, ['id']) ?? 'id'
  const { barcodeSelect, labelSelect } = itemSelects(item.columns, itemIdCol)

  const orderSelect: string[] = ['  NULL AS orderNumber,']
  const orderJoin: string[] = []
  if (order) {
    const join = orderContainerJoin(schema, order.name, order.columns, container.name, container.columns)
    const orderNumberCol = findColumn(order.columns, ['orderNumber', 'order_number', 'number']) ?? 'orderNumber'
    if (join) {
      orderSelect[0] = `  o.${quoteIdent(orderNumberCol)} AS orderNumber,`
      orderJoin.push(`LEFT JOIN ${quoteIdent(order.name)} o`)
      orderJoin.push(`  ON ${join.sql}`)
    }
  }

  const sql = [
    'SELECT',
    `  c.${quoteIdent(containerIdCol)} AS containerId,`,
    `  c.${quoteIdent(ssccCol)} AS sscc,`,
    ...orderSelect,
    `  ci.${quoteIdent(qtyCol)} AS quantity,`,
    `  i.${quoteIdent(itemIdCol)} AS itemId,`,
    `  ${barcodeSelect},`,
    `  ${labelSelect}`,
    `FROM ${quoteIdent(container.name)} c`,
    ...orderJoin,
    `LEFT JOIN ${quoteIdent(containerItem.name)} ci`,
    `  ON ci.${quoteIdent(ciContainerCol)} = c.${quoteIdent(containerIdCol)}`,
    `  AND ${deletedPredicate('ci', containerItem.columns)}`,
    `LEFT JOIN ${quoteIdent(item.name)} i`,
    `  ON i.${quoteIdent(itemIdCol)} = ci.${quoteIdent(ciItemCol)}`,
    `WHERE c.${quoteIdent(ssccCol)} = ${lit(sscc)}`,
    `ORDER BY i.${quoteIdent(itemIdCol)};`,
  ].join('\n')

  return { ok: true, sql }
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v == null) return ''
  return String(v)
}

function num(row: Record<string, unknown>, key: string): number {
  const n = Number(row[key])
  return Number.isFinite(n) ? n : 0
}

function lineFromRow(row: Record<string, unknown>): InspectLine | null {
  const itemId = str(row, 'itemId')
  if (!itemId) return null
  const barcode = str(row, 'barcode')
  const label = str(row, 'itemLabel')
  return {
    itemId,
    quantity: num(row, 'quantity') || 1,
    barcode,
    label: label || barcode || itemId,
  }
}

export function groupOrderInspectRows(rows: Record<string, unknown>[], lookup: string): OrderInspectModel {
  if (rows.length === 0) {
    return { orderNumber: lookup, orderId: '', cartons: [], found: false }
  }
  const cartons = new Map<string, InspectCarton>()
  for (const row of rows) {
    const containerId = str(row, 'containerId')
    const sscc = str(row, 'sscc')
    if (!containerId && !sscc) continue
    const key = containerId || sscc
    let carton = cartons.get(key)
    if (!carton) {
      carton = { containerId, sscc, lines: [], totalQty: 0 }
      cartons.set(key, carton)
    }
    const line = lineFromRow(row)
    if (line) {
      carton.lines.push(line)
      carton.totalQty += line.quantity
    }
  }
  const first = rows[0]!
  return {
    orderNumber: str(first, 'orderNumber') || lookup,
    orderId: str(first, 'orderId'),
    cartons: [...cartons.values()],
    found: true,
  }
}

export function groupCartonInspectRows(rows: Record<string, unknown>[], lookup: string): CartonInspectModel {
  if (rows.length === 0) {
    return { sscc: lookup, containerId: '', orderNumber: '', lines: [], found: false }
  }
  const first = rows[0]!
  const lines: InspectLine[] = []
  for (const row of rows) {
    const line = lineFromRow(row)
    if (line) lines.push(line)
  }
  return {
    sscc: str(first, 'sscc') || lookup,
    containerId: str(first, 'containerId'),
    orderNumber: str(first, 'orderNumber'),
    lines,
    found: true,
  }
}
