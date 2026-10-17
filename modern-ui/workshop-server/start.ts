import { postgres, migrate, type Database } from './database'
import { createWorkshopServer } from './server'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Server-only configuration. Never distribute this file with desktop installs.
dotenv.config({ path: process.env.WORKSHOP_ENV_FILE ?? fileURLToPath(new URL('./.env', import.meta.url)) })

let db: Database
if (process.env.DATABASE_URL) db = await postgres(process.env.DATABASE_URL)
else {
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production')
  // A real embedded Postgres engine for local development and the socket integration tests.
  const { PGlite } = await import('@electric-sql/pglite')
  const local = new PGlite(process.env.WORKSHOP_DATA_DIR ?? './.workshop-data')
  const wrap = (q: typeof local): Database => ({ query: (sql, params) => q.query(sql, params),
    transaction: fn => q.transaction(tx => fn(wrap(tx as unknown as typeof local))), close: () => local.close() })
  db = wrap(local)
}
await migrate(db)
const app = createWorkshopServer(db, (process.env.WORKSHOP_ORIGINS ?? 'null,file://,http://localhost:5173,http://127.0.0.1:5173').split(','))
const port = Number(process.env.PORT ?? 8787)
app.server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`Workshop listening on port ${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => db.close()).then(() => process.exit(0)) })
