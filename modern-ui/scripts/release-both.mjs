import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {
  electronBuilderOutputArgs,
  resolveBuildOutput,
} from './clean-electron-output.mjs'
import { ensureGithubDraftRelease } from './ensure-github-draft-release.mjs'
import { electronBuilderPublishArgs } from './electron-builder-publish-args.mjs'
import { runCommand } from './run-command.mjs'
import { uploadGithubReleaseAssets } from './upload-github-release-assets.mjs'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
const existingGhToken = process.env.GH_TOKEN?.trim()
if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
}
if (existingGhToken) {
  process.env.GH_TOKEN = existingGhToken
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
const token = process.env.GH_TOKEN.trim()
const version = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')).version

const targets = [
  { owner: primaryOwner, repo: primaryRepo },
  { owner: secondOwner, repo: secondRepo },
]

console.log('Building app once...')
runCommand('vite', ['build'], process.env, cwd)

const outputDir = resolveBuildOutput(cwd)

for (const { owner, repo } of targets) {
  await ensureGithubDraftRelease({ owner, repo, version, token })
}

console.log('Packaging Windows installer...')
runCommand(
  'electron-builder',
  [...electronBuilderPublishArgs(), ...electronBuilderOutputArgs(outputDir)],
  process.env,
  cwd,
)

for (const { owner, repo } of targets) {
  const release = await ensureGithubDraftRelease({ owner, repo, version, token })
  console.log(`Uploading release assets to ${owner}/${repo}...`)
  await uploadGithubReleaseAssets({ owner, repo, version, token, distDir: outputDir, releaseId: release?.id })
}

console.log('Done: published to both repositories.')
