/**
 * Built-in lookup queries for the Database SQL panel.
 * Each template asks for a single value, then fills a parameterized SELECT.
 */

export type BuiltinQueryId =
  | 'container-by-sscc'
  | 'order-by-number'
  | 'item-by-barcode'
  | 'container-items-by-sscc'

export interface BuiltinQueryTemplate {
  id: BuiltinQueryId
  /** Short menu label */
  label: string
  /** One-line description under the label */
  description: string
  /** Input field label shown in the value dialog */
  valueLabel: string
  /** Placeholder for the value field */
  placeholder: string
  /** Build the SQL with the user-supplied value already escaped. */
  buildSql: (value: string) => string
}

/** Escape a SQL string literal (single quotes). */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

function lit(value: string): string {
  return `'${escapeSqlString(value.trim())}'`
}

export const BUILTIN_QUERIES: BuiltinQueryTemplate[] = [
  {
    id: 'container-by-sscc',
    label: 'Container by SSCC',
    description: 'SELECT from container where sscc = …',
    valueLabel: 'SSCC',
    placeholder: 'e.g. 006141411234567890',
    buildSql: (value) =>
      `SELECT *\nFROM container\nWHERE sscc = ${lit(value)};`,
  },
  {
    id: 'order-by-number',
    label: 'Order by order number',
    description: 'SELECT from order where orderNumber = …',
    valueLabel: 'Order number',
    placeholder: 'e.g. SO-12345',
    buildSql: (value) =>
      `SELECT *\nFROM \`order\`\nWHERE orderNumber = ${lit(value)};`,
  },
  {
    id: 'item-by-barcode',
    label: 'Item by barcode',
    description: 'SELECT from item where barcode = …',
    valueLabel: 'Barcode',
    placeholder: 'e.g. 09521234123453',
    buildSql: (value) =>
      `SELECT *\nFROM item\nWHERE barcode = ${lit(value)};`,
  },
  {
    id: 'container-items-by-sscc',
    label: 'Items in container (by SSCC)',
    description: 'container → container_item → item via container.id',
    valueLabel: 'SSCC',
    placeholder: 'e.g. 006141411234567890',
    buildSql: (value) =>
      [
        'SELECT',
        '  c.sscc,',
        '  c.id AS containerId,',
        '  ci.id AS containerItemId,',
        '  ci.quantity,',
        '  i.*',
        'FROM container c',
        'INNER JOIN container_item ci',
        '  ON ci.containerId = c.id',
        '  AND IFNULL(ci.deleted, 0) = 0',
        'INNER JOIN item i',
        '  ON i.id = ci.itemId',
        `WHERE c.sscc = ${lit(value)};`,
      ].join('\n'),
  },
]

export function getBuiltinQuery(id: BuiltinQueryId): BuiltinQueryTemplate | undefined {
  return BUILTIN_QUERIES.find((q) => q.id === id)
}
