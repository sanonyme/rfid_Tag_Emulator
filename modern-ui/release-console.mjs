import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const deployDir = join(root, 'workshop-server', '.workshop-deploy')
const html = readFileSync(join(root, 'release-console.html'), 'utf8')
const state = { artifact: false, staging: false, confirmed: false, players: [], log: [] }
const log = message => { state.log.push(`[${new Date().toISOString()}] ${message}`); state.log = state.log.slice(-100) }

function run(name, command) {
  log(`${name}: ${command}`)
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: root, windowsHide: true })
    let output = ''
    child.stdout.on('data', data => { output += data; log(data.toString().trim()) })
    child.stderr.on('data', data => { output += data; log(data.toString().trim()) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(output || `exit ${code}`)))
  })
}

async function action(name, fn) {
  try { log(`${name} started`); await fn(); log(`${name} complete`); return { ok: true } }
  catch (error) { const message = error instanceof Error ? error.message : String(error); log(`${name} failed: ${message}`); return { ok: false, error: message } }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html) }
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/state') return res.end(JSON.stringify(state))
  if (req.method !== 'POST') return res.writeHead(405).end()
  const url = new URL(req.url ?? '/', 'http://localhost')
  let result
  if (url.pathname === '/api/build') result = await action('Build', async () => {
    await run('Build', 'npm run workshop:prepare-deploy')
    if (!existsSync(join(deployDir, 'server.mjs'))) throw new Error('Artifact missing')
    state.artifact = true
  })
  else if (url.pathname === '/api/stage') result = await action('Deploy staging', async () => {
    if (!state.artifact) throw new Error('Build the artifact first')
    await run('Stage', `scp -r "${deployDir}" root@192.168.10.200:/tmp/zeus-release`)
    await run('Stage', 'ssh root@192.168.10.200 "pct push 251 /tmp/zeus-release/.workshop-deploy/server.mjs /opt/zeus-workshop/server.mjs && pct push 251 /tmp/zeus-release/.workshop-deploy/schema.sql /opt/zeus-workshop/schema.sql && pct exec 251 -- systemctl restart zeus-workshop && sleep 2 && pct exec 251 -- curl -fsS http://127.0.0.1:8787/health"')
    state.staging = true; state.confirmed = false
  })
  else if (url.pathname === '/api/confirm') result = await action('Confirm staging', async () => {
    if (!state.staging) throw new Error('Deploy and test staging first')
    state.confirmed = true
  })
  else if (url.pathname === '/api/prod') result = await action('Promote production', async () => {
    if (!state.confirmed) throw new Error('Confirm staging first')
    await run('Production', 'ssh root@192.168.10.200 "set -e; stamp=$(date -u +%Y%m%dT%H%M%SZ); pct snapshot 250 zeus-release-$stamp; pct exec 250 -- runuser -u postgres -- pg_dump -Fc workshop -f /tmp/workshop-$stamp.dump; pct push 250 /tmp/zeus-release/.workshop-deploy/server.mjs /opt/zeus-workshop/server.mjs; pct push 250 /tmp/zeus-release/.workshop-deploy/schema.sql /opt/zeus-workshop/schema.sql; pct exec 250 -- systemctl restart zeus-workshop; sleep 2; pct exec 250 -- curl -fsS http://127.0.0.1:8787/health"')
  })
  else if (url.pathname === '/api/dev/add-player') result = await action('Add staging player', async () => {
    const number = Number(url.searchParams.get('n') ?? state.players.length + 1)
    const profile = join(process.env.TEMP ?? 'C:/Temp', `zeus-staging-player-${Date.now()}-${number}`)
    const child = spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: false,
      env: { ...process.env, WORKSHOP_URL: 'http://192.168.10.251:8787', ZEUS_USER_DATA_DIR: profile },
    })
    child.unref(); state.players.push({ number, profile }); log(`Player ${number}: ${profile}`)
  })
  else result = { ok: false, error: 'Unknown action' }
  res.end(JSON.stringify(result))
})

server.listen(5899, '127.0.0.1', () => console.log('Release Console: http://127.0.0.1:5899'))
