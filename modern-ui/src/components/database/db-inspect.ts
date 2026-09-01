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

export const CUSTOM_FIELD_KEYS = [
  'field1', 'field2', 'field3', 'field4', 'field5',
  'field6', 'field7', 'field8', 'field9', 'field10',
] as const

export type InspectKv = {
  key: string
  label: string
  value: string
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
  fields: InspectKv[]
}

export type OrderInspectModel = {
  orderNumber: string
  orderId: string
  fields: InspectKv[]
  cartons: InspectCarton[]
  found: boolean
}

export type CartonInspectModel = {
  sscc: string
  containerId: string
  orderNumber: string
  orderFields: InspectKv[]
  fields: InspectKv[]
  lines: InspectLine[]
  found: boolean
}

export type InspectSqlResult =
  | { ok: true; sql: string }
  | { ok: false; error: string }

const ORDER_FALLBACK_COLS = [
  'id', 'orderNumber', 'completed', 'statusId', 'type', 'generated',
  'customerId', 'sourceOrganizationId', 'sourceLocationId',
  'destinationOrganizationId', 'destinationLocationId',
  'createTs', 'updateTs',
  ...CUSTOM_FIELD_KEYS,
]

const CONTAINER_FALLBACK_COLS = [
  'id', 'sscc', 'epc', 'orderId', 'weight', 'type', 'poNumber', 'isVirtual',
  'expectedItems', 'generated', 'statusId', 'customerId',
  'currentLocationId', 'sourceOrganizationId', 'sourceLocationId',
  'destinationOrganizationId', 'destinationLocationId',
  'createTs', 'updateTs',
  ...CUSTOM_FIELD_KEYS,
]

type ColSpec = { col: string | string[]; as: string }

function pickSelects(alias: string, columns: string[], specs: ColSpec[]): string[] {
  const lines: string[] = []
  for (const spec of specs) {
    const candidates = Array.isArray(spec.col) ? spec.col : [spec.col]
    const actual = findColumn(columns, candidates)
    if (actual) lines.push(`  ${alias}.${quoteIdent(actual)} AS ${quoteIdent(spec.as)}`)
  }
  return lines
}

function customFieldSelects(alias: string, columns: string[], prefix: 'order' | 'carton'): string[] {
  return CUSTOM_FIELD_KEYS.flatMap((key, i) =>
    pickSelects(alias, columns, [{ col: key, as: `${prefix}Field${i + 1}` }]),
  )
}

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

function addLookup(
  parts: { joins: string[]; selects: string[] },
  schema: SchemaData | null,
  fromAlias: string,
  fromCols: string[],
  fkCandidates: string[],
  tableCandidates: string[],
  nameCandidates: string[],
  asName: string,
  joinAlias: string,
): void {
  const fkCol = findColumn(fromCols, fkCandidates)
  const table = findTable(schema, tableCandidates)
  if (!fkCol || !table) return
  const pk = findColumn(table.columns, ['id']) ?? 'id'
  const nameCol = findColumn(table.columns, nameCandidates)
  if (!nameCol) return
  parts.joins.push(
    `LEFT JOIN ${quoteIdent(table.name)} ${joinAlias}`,
    `  ON ${joinAlias}.${quoteIdent(pk)} = ${fromAlias}.${quoteIdent(fkCol)}`,
  )
  parts.selects.push(`  ${joinAlias}.${quoteIdent(nameCol)} AS ${quoteIdent(asName)}`)
}

const ORDER_COL_SPECS: ColSpec[] = [
  { col: 'completed', as: 'orderCompleted' },
  { col: 'type', as: 'orderType' },
  { col: 'generated', as: 'orderGenerated' },
  { col: 'createTs', as: 'orderCreateTs' },
  { col: 'updateTs', as: 'orderUpdateTs' },
]

const CARTON_COL_SPECS: ColSpec[] = [
  { col: 'epc', as: 'cartonEpc' },
  { col: ['poNumber', 'po_number'], as: 'cartonPoNumber' },
  { col: 'type', as: 'cartonType' },
  { col: 'weight', as: 'cartonWeight' },
  { col: ['expectedItems', 'expected', 'expected_items'], as: 'cartonExpectedItems' },
  { col: 'generated', as: 'cartonGenerated' },
  { col: 'isVirtual', as: 'cartonIsVirtual' },
  { col: 'createTs', as: 'cartonCreateTs' },
  { col: 'updateTs', as: 'cartonUpdateTs' },
]

function orderLookups(schema: SchemaData | null, orderCols: string[]): { joins: string[]; selects: string[] } {
  const parts = { joins: [] as string[], selects: [] as string[] }
  addLookup(parts, schema, 'o', orderCols, ['statusId', 'status_id'], ['status'], ['status', 'name', 'description'], 'orderStatus', 'ost')
  addLookup(parts, schema, 'o', orderCols, ['customerId', 'customer_id'], ['customer'], ['name'], 'orderCustomer', 'ocust')
  addLookup(parts, schema, 'o', orderCols, ['sourceOrganizationId', 'source_organization_id'], ['organization', 'organisation'], ['name', 'code'], 'orderSourceOrg', 'osorg')
  addLookup(parts, schema, 'o', orderCols, ['destinationOrganizationId', 'destination_organization_id'], ['organization', 'organisation'], ['name', 'code'], 'orderDestOrg', 'odorg')
  addLookup(parts, schema, 'o', orderCols, ['sourceLocationId', 'source_location_id'], ['location'], ['name', 'barcode'], 'orderSourceLoc', 'osloc')
  addLookup(parts, schema, 'o', orderCols, ['destinationLocationId', 'destination_location_id'], ['location'], ['name', 'barcode'], 'orderDestLoc', 'odloc')
  return parts
}

function cartonLookups(schema: SchemaData | null, containerCols: string[]): { joins: string[]; selects: string[] } {
  const parts = { joins: [] as string[], selects: [] as string[] }
  addLookup(parts, schema, 'c', containerCols, ['statusId', 'status_id'], ['status'], ['status', 'name', 'description'], 'cartonStatus', 'cst')
  addLookup(parts, schema, 'c', containerCols, ['customerId', 'customer_id'], ['customer'], ['name'], 'cartonCustomer', 'ccust')
  addLookup(parts, schema, 'c', containerCols, ['sourceOrganizationId', 'source_organization_id'], ['organization', 'organisation'], ['name', 'code'], 'cartonSourceOrg', 'csorg')
  addLookup(parts, schema, 'c', containerCols, ['destinationOrganizationId', 'destination_organization_id'], ['organization', 'organisation'], ['name', 'code'], 'cartonDestOrg', 'cdorg')
  addLookup(parts, schema, 'c', containerCols, ['sourceLocationId', 'source_location_id'], ['location'], ['name', 'barcode'], 'cartonSourceLoc', 'csloc')
  addLookup(parts, schema, 'c', containerCols, ['destinationLocationId', 'destination_location_id'], ['location'], ['name', 'barcode'], 'cartonDestLoc', 'cdloc')
  addLookup(parts, schema, 'c', containerCols, ['currentLocationId', 'current_location_id'], ['location'], ['name', 'barcode'], 'cartonCurrentLoc', 'cloc')
  return parts
}

function commaJoin(lines: string[]): string[] {
  return lines.map((line, i) => (i === lines.length - 1 ? line : `${line},`))
}

/**
 * Build a packing-list SELECT: order → carton(s) → lines → item.
 * Uses foreign keys when the schema graph has them; otherwise common column names.
 */
export function buildOrderInspectSql(schema: SchemaData | null, orderNumber: string): InspectSqlResult {
  const order = findTable(schema, ['order']) ?? { name: 'order', columns: ORDER_FALLBACK_COLS }
  const container = findTable(schema, ['container', 'carton']) ?? { name: 'container', columns: CONTAINER_FALLBACK_COLS }
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

  const oLookups = orderLookups(schema, order.columns)
  const cLookups = cartonLookups(schema, container.columns)
  const selectLines = [
    `  o.${quoteIdent(orderIdCol)} AS orderId`,
    `  o.${quoteIdent(orderNumberCol)} AS orderNumber`,
    ...pickSelects('o', order.columns, ORDER_COL_SPECS),
    ...customFieldSelects('o', order.columns, 'order'),
    ...oLookups.selects,
    `  c.${quoteIdent(containerIdCol)} AS containerId`,
    `  c.${quoteIdent(ssccCol)} AS sscc`,
    ...pickSelects('c', container.columns, CARTON_COL_SPECS),
    ...customFieldSelects('c', container.columns, 'carton'),
    ...cLookups.selects,
    `  ci.${quoteIdent(qtyCol)} AS quantity`,
    `  i.${quoteIdent(itemIdCol)} AS itemId`,
    `  ${barcodeSelect}`,
    `  ${labelSelect}`,
  ]

  const sql = [
    'SELECT',
    ...commaJoin(selectLines),
    `FROM ${quoteIdent(order.name)} o`,
    ...oLookups.joins,
    `LEFT JOIN ${quoteIdent(container.name)} c`,
    `  ON ${join.sql}`,
    ...cLookups.joins,
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
  const order = findTable(schema, ['order']) ?? (schema ? null : { name: 'order', columns: ORDER_FALLBACK_COLS })
  const container = findTable(schema, ['container', 'carton']) ?? { name: 'container', columns: CONTAINER_FALLBACK_COLS }
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

  const join = order
    ? orderContainerJoin(schema, order.name, order.columns, container.name, container.columns)
    : null
  const oLookups = order && join ? orderLookups(schema, order.columns) : { joins: [] as string[], selects: [] as string[] }
  const cLookups = cartonLookups(schema, container.columns)

  const orderSelects: string[] = order && join
    ? [
        `  o.${quoteIdent(findColumn(order.columns, ['id']) ?? 'id')} AS orderId`,
        `  o.${quoteIdent(findColumn(order.columns, ['orderNumber', 'order_number', 'number']) ?? 'orderNumber')} AS orderNumber`,
        ...pickSelects('o', order.columns, ORDER_COL_SPECS),
        ...customFieldSelects('o', order.columns, 'order'),
        ...oLookups.selects,
      ]
    : ['  NULL AS orderNumber']

  const selectLines = [
    `  c.${quoteIdent(containerIdCol)} AS containerId`,
    `  c.${quoteIdent(ssccCol)} AS sscc`,
    ...orderSelects,
    ...pickSelects('c', container.columns, CARTON_COL_SPECS),
    ...customFieldSelects('c', container.columns, 'carton'),
    ...cLookups.selects,
    `  ci.${quoteIdent(qtyCol)} AS quantity`,
    `  i.${quoteIdent(itemIdCol)} AS itemId`,
    `  ${barcodeSelect}`,
    `  ${labelSelect}`,
  ]

  const sql = [
    'SELECT',
    ...commaJoin(selectLines),
    `FROM ${quoteIdent(container.name)} c`,
    ...cLookups.joins,
    ...(order && join
      ? [
          `LEFT JOIN ${quoteIdent(order.name)} o`,
          `  ON ${join.sql}`,
          ...oLookups.joins,
        ]
      : []),
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
  const v = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()]
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function num(row: Record<string, unknown>, key: string): number {
  const n = Number(row[key] ?? row[key.toLowerCase()])
  return Number.isFinite(n) ? n : 0
}

function rowHas(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key)
    || Object.keys(row).some((k) => k.toLowerCase() === key.toLowerCase())
}

function formatFlag(value: string): string {
  if (value === '1' || value.toLowerCase() === 'true') return 'Yes'
  if (value === '0' || value.toLowerCase() === 'false') return 'No'
  return value
}

function formatTs(value: string): string {
  if (!value) return ''
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1e11) return value
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function kvFromRow(
  row: Record<string, unknown>,
  key: string,
  label: string,
  format?: (v: string) => string,
): InspectKv | null {
  if (!rowHas(row, key)) return null
  const raw = str(row, key)
  return { key, label, value: format ? format(raw) : raw }
}

const ORDER_FIELD_SPECS: { key: string; label: string; format?: (v: string) => string }[] = [
  { key: 'orderStatus', label: 'Status' },
  { key: 'orderCompleted', label: 'Completed', format: formatFlag },
  { key: 'orderType', label: 'Type' },
  { key: 'orderGenerated', label: 'Generated', format: formatFlag },
  { key: 'orderCustomer', label: 'Customer' },
  { key: 'orderSourceOrg', label: 'Source organization' },
  { key: 'orderDestOrg', label: 'Destination organization' },
  { key: 'orderSourceLoc', label: 'Source location' },
  { key: 'orderDestLoc', label: 'Destination location' },
  ...CUSTOM_FIELD_KEYS.map((key, i) => ({ key: `orderField${i + 1}`, label: `Field ${i + 1}` })),
  { key: 'orderCreateTs', label: 'Created', format: formatTs },
  { key: 'orderUpdateTs', label: 'Updated', format: formatTs },
]

const CARTON_FIELD_SPECS: { key: string; label: string; format?: (v: string) => string }[] = [
  { key: 'cartonStatus', label: 'Status' },
  { key: 'cartonGenerated', label: 'Generated', format: formatFlag },
  { key: 'cartonExpectedItems', label: 'Expected items' },
  { key: 'cartonPoNumber', label: 'PO number' },
  { key: 'cartonType', label: 'Type' },
  { key: 'cartonWeight', label: 'Weight' },
  { key: 'cartonIsVirtual', label: 'Virtual', format: formatFlag },
  { key: 'cartonEpc', label: 'EPC' },
  { key: 'cartonCustomer', label: 'Customer' },
  { key: 'cartonSourceOrg', label: 'Source organization' },
  { key: 'cartonDestOrg', label: 'Destination organization' },
  { key: 'cartonSourceLoc', label: 'Source location' },
  { key: 'cartonDestLoc', label: 'Destination location' },
  { key: 'cartonCurrentLoc', label: 'Current location' },
  ...CUSTOM_FIELD_KEYS.map((key, i) => ({ key: `cartonField${i + 1}`, label: `Field ${i + 1}` })),
  { key: 'cartonCreateTs', label: 'Created', format: formatTs },
  { key: 'cartonUpdateTs', label: 'Updated', format: formatTs },
]

export function collectFields(
  row: Record<string, unknown>,
  specs: { key: string; label: string; format?: (v: string) => string }[],
): InspectKv[] {
  const out: InspectKv[] = []
  for (const spec of specs) {
    const kv = kvFromRow(row, spec.key, spec.label, spec.format)
    if (kv) out.push(kv)
  }
  return out
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
    return { orderNumber: lookup, orderId: '', fields: [], cartons: [], found: false }
  }
  const cartons = new Map<string, InspectCarton>()
  for (const row of rows) {
    const containerId = str(row, 'containerId')
    const sscc = str(row, 'sscc')
    if (!containerId && !sscc) continue
    const key = containerId || sscc
    let carton = cartons.get(key)
    if (!carton) {
      carton = {
        containerId,
        sscc,
        lines: [],
        totalQty: 0,
        fields: collectFields(row, CARTON_FIELD_SPECS),
      }
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
    fields: collectFields(first, ORDER_FIELD_SPECS),
    cartons: [...cartons.values()],
    found: true,
  }
}

export function groupCartonInspectRows(rows: Record<string, unknown>[], lookup: string): CartonInspectModel {
  if (rows.length === 0) {
    return {
      sscc: lookup,
      containerId: '',
      orderNumber: '',
      orderFields: [],
      fields: [],
      lines: [],
      found: false,
    }
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
    orderFields: collectFields(first, ORDER_FIELD_SPECS),
    fields: collectFields(first, CARTON_FIELD_SPECS),
    lines,
    found: true,
  }
}
