import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
const shellToken = process.env.GH_TOKEN?.trim()
const fileToken = existsSync(envPath)
  ? dotenv.parse(readFileSync(envPath, 'utf8')).GH_TOKEN?.trim()
  : undefined

async function testToken(label, token) {
  if (!token) {
    console.log(`${label}: (not set)`)
    return false
  }
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'zeus-release-verify' },
  })
  const data = await res.json()
  const ok = res.status === 200
  console.log(
    `${label}: HTTP ${res.status} → ${data.login ?? data.message} (${token.length} chars, ${token.slice(0, 11)}…)`,
  )
  return ok
}

if (shellToken && fileToken && shellToken !== fileToken) {
  console.warn(
    'Warning: GH_TOKEN in your shell differs from modern-ui/.env. dotenv does not override existing env vars, so release scripts may use the shell value.\n',
  )
}

const shellOk = await testToken('Shell GH_TOKEN', shellToken)
const fileOk = await testToken('.env GH_TOKEN', fileToken)

if (!shellOk && !fileOk) {
  console.error('\nNeither token works. Create a new PAT and update modern-ui/.env, then open a fresh terminal.')
  process.exit(1)
}

if (!shellOk && fileOk) {
  console.log('\n.env token is valid. Clear the stale shell token or open a new terminal, then run release.')
}

if (shellOk) {
  console.log('\nToken is valid for GitHub API.')
}
