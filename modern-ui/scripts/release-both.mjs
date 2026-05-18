import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { electronBuilderPublishArgs } from './electron-builder-publish-args.mjs'
import { runCommand } from './run-command.mjs'

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

const primaryOwner = process.env.ZEUS_RELEASE_OWNER.trim()
const primaryRepo = process.env.ZEUS_RELEASE_REPO.trim()
const secondOwner = process.env.ZEUS_SECOND_RELEASE_OWNER.trim()
const secondRepo = process.env.ZEUS_SECOND_RELEASE_REPO.trim()

console.log('Building app once...')
runCommand('vite', ['build'], process.env, cwd)

console.log(`Publishing release to ${primaryOwner}/${primaryRepo}...`)
runCommand('electron-builder', electronBuilderPublishArgs(), process.env, cwd)

const secondEnv = {
  ...process.env,
  ZEUS_RELEASE_OWNER: secondOwner,
  ZEUS_RELEASE_REPO: secondRepo,
}

console.log(`Publishing release to ${secondOwner}/${secondRepo}...`)
runCommand('electron-builder', electronBuilderPublishArgs(), secondEnv, cwd)

console.log('Done: published to both repositories.')
