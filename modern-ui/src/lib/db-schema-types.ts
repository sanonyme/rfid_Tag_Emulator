export interface DbSchemaColumn {
  name: string
  type: string
  key: string
}

export interface DbSchemaTable {
  name: string
  columns: DbSchemaColumn[]
}

export interface DbSchemaForeignKey {
  constraintName: string
  childTable: string
  childColumns: string[]
  parentTable: string
  parentColumns: string[]
}
