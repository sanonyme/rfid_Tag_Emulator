import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { electronBuilderOutputArgs, resolveBuildOutput } from './clean-electron-output.mjs'
import { ensureGithubDraftRelease } from './ensure-github-draft-release.mjs'
import { electronBuilderPublishArgs } from './electron-builder-publish-args.mjs'
import { runCommand } from './run-command.mjs'
import { uploadGithubReleaseAssets } from './upload-github-release-assets.mjs'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
}

const required = ['ZEUS_RELEASE_OWNER', 'ZEUS_RELEASE_REPO', 'GH_TOKEN']
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim())
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const owner = process.env.ZEUS_RELEASE_OWNER.trim()
const repo = process.env.ZEUS_RELEASE_REPO.trim()
const token = process.env.GH_TOKEN.trim()
const version = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')).version
const outputDir = resolveBuildOutput(cwd)

await ensureGithubDraftRelease({ owner, repo, version, token })

console.log(`Packaging Windows installer for ${owner}/${repo}...`)
runCommand(
  'electron-builder',
  [...electronBuilderPublishArgs(), ...electronBuilderOutputArgs(outputDir)],
  process.env,
  cwd,
)

const release = await ensureGithubDraftRelease({ owner, repo, version, token })

console.log(`Uploading release assets to ${owner}/${repo}...`)
await uploadGithubReleaseAssets({ owner, repo, version, token, distDir: outputDir, releaseId: release?.id })

console.log(`Done: published to ${owner}/${repo}.`)
