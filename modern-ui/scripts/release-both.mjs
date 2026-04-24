import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const required = [
  'ZEUS_RELEASE_OWNER',
  'ZEUS_RELEASE_REPO',
  'ZEUS_SECOND_RELEASE_OWNER',
  'ZEUS_SECOND_RELEASE_REPO',
  'GH_TOKEN',
]

const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim())
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('Building app once...')
run('vite', ['build'], process.env)

console.log(`Publishing release to ${process.env.ZEUS_RELEASE_OWNER}/${process.env.ZEUS_RELEASE_REPO}...`)
run('electron-builder', ['--publish', 'always'], process.env)

const secondEnv = {
  ...process.env,
  ZEUS_RELEASE_OWNER: process.env.ZEUS_SECOND_RELEASE_OWNER,
  ZEUS_RELEASE_REPO: process.env.ZEUS_SECOND_RELEASE_REPO,
}

console.log(
  `Publishing release to ${secondEnv.ZEUS_RELEASE_OWNER}/${secondEnv.ZEUS_RELEASE_REPO}...`
)
run('electron-builder', ['--publish', 'always'], secondEnv)

console.log('Done: published to both repositories.')
