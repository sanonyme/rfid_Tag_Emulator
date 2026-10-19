/**
 * Run against a Postgres DATABASE_URL (staging tunnel or CT 251 port-forward).
 * Never point this at production unless you mean to.
 *
 *   set DATABASE_URL=postgresql://workshop:…@127.0.0.1:15432/workshop
 *   npm run workshop:staging -- health
 *   npm run workshop:staging -- event-up
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL to the staging Postgres (not production).')
  process.exit(1)
}
// Soft guard: CT 250 is production. Override with WORKSHOP_STAGING_OK=1 if intentional.
if (url.includes('192.168.10.250') && process.env.WORKSHOP_STAGING_OK !== '1') {
  console.error('Refusing DATABASE_URL that looks like production CT 250. Set WORKSHOP_STAGING_OK=1 to override.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })
const sqlDir = join(fileURLToPath(new URL('.', import.meta.url)), 'staging', 'sql')

async function q(sql: string) {
  const { rows } = await pool.query(sql)
  if (rows.length) console.table(rows)
  else console.log('ok')
}

async function file(name: string) {
  const text = await readFile(join(sqlDir, name), 'utf8')
  await pool.query(text)
  console.log(`applied ${name}`)
}

const cmd = process.argv[2] ?? 'help'
try {
  switch (cmd) {
    case 'health':
      await q('SELECT now() AS db_time, current_database() AS db')
      break
    case 'users':
      await q('SELECT email, display_name, crew, handle FROM users ORDER BY created_at')
      break
    case 'bags':
      await q(`SELECT u.email, u.display_name, item->>'item' AS item_id, item->>'from' AS origin
        FROM users u JOIN profiles p ON p.user_id=u.id
        CROSS JOIN LATERAL jsonb_array_elements(p.data->'bag') AS item
        ORDER BY u.display_name, item_id`)
      break
    case 'events':
      await q('SELECT id, title, enabled, kind, start_at, end_at FROM live_events ORDER BY start_at')
      break
    case 'event-up':
      await file('announcement.sql')
      break
    case 'event-down':
      await q(`UPDATE live_events SET enabled=false, end_at=now() WHERE id='dev-banner' RETURNING id, enabled, end_at`)
      break
    case 'event-santa':
      await q(`UPDATE live_events SET enabled=false, end_at=now(), pairing=NULL WHERE pairing='same-crew' OR id LIKE 'secret-santa%' RETURNING id, enabled, pairing`)
      break
    default:
      console.log(`Commands: health | users | bags | events | event-up | event-down | event-santa`)
  }
} finally {
  await pool.end()
}
