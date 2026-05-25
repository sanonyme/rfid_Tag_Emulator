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

// CI sets GITHUB_TOKEN; local dev uses GH_TOKEN from .env
if (!process.env.GH_TOKEN?.trim() && process.env.GITHUB_TOKEN?.trim()) {
  process.env.GH_TOKEN = process.env.GITHUB_TOKEN.trim()
}

const required = ['ZEUS_RELEASE_OWNER', 'ZEUS_RELEASE_REPO', 'GH_TOKEN']
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim())
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const owner = process.env.ZEUS_RELEASE_OWNER.trim()
const repo = process.env.ZEUS_RELEASE_REPO.trim()

const platform = process.env.RELEASE_PLATFORM?.trim()
const builderArgs = [...electronBuilderPublishArgs()]
if (platform === 'win' || platform === 'linux') {
  builderArgs.push(`--${platform}`)
}

console.log(`Publishing release to ${owner}/${repo}...`)
runCommand('electron-builder', builderArgs, process.env, cwd)

console.log(`Done: published to ${owner}/${repo}.`)
