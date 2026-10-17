import { readFile } from 'node:fs/promises'
import pg from 'pg'

export interface Database {
  query<T extends Record<string, any> = Record<string, any>>(sql: string, params?: any[]): Promise<{ rows: T[] }>
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>
  close(): Promise<void>
}
export async function postgres(url: string): Promise<Database> {
  const pool = new pg.Pool({ connectionString: url })
  const db: Database = {
    query: (sql, params) => pool.query(sql, params),
    transaction: async fn => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const value = await fn({ ...db, query: (sql, params) => client.query(sql, params) })
        await client.query('COMMIT')
        return value
      } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
    },
    close: () => pool.end(),
  }
  return db
}
export async function migrate(db: Database) {
  // Individual statements work with both pg and embedded Postgres's prepared query API.
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  for (const statement of schema.split(';').filter(s => s.trim())) await db.query(statement)
}
