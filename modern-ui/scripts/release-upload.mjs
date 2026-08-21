/**
 * Retry uploading release assets without rebuilding.
 * Use when packaging succeeded but GitHub upload failed (e.g. ECONNABORTED).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { findPackagedOutputDir } from './clean-electron-output.mjs'
import { ensureGithubDraftRelease } from './ensure-github-draft-release.mjs'
import { uploadGithubReleaseAssets } from './upload-github-release-assets.mjs'

const cwd = process.cwd()
const envPath = path.join(cwd, '.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
}

const both = process.argv.includes('--both')
const required = both
  ? ['ZEUS_RELEASE_OWNER', 'ZEUS_RELEASE_REPO', 'ZEUS_SECOND_RELEASE_OWNER', 'ZEUS_SECOND_RELEASE_REPO', 'GH_TOKEN']
  : ['ZEUS_RELEASE_OWNER', 'ZEUS_RELEASE_REPO', 'GH_TOKEN']

const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim())
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const token = process.env.GH_TOKEN.trim()
const version = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')).version
const outputDir = findPackagedOutputDir(cwd)

const targets = both
  ? [
      { owner: process.env.ZEUS_RELEASE_OWNER.trim(), repo: process.env.ZEUS_RELEASE_REPO.trim() },
      { owner: process.env.ZEUS_SECOND_RELEASE_OWNER.trim(), repo: process.env.ZEUS_SECOND_RELEASE_REPO.trim() },
    ]
  : [{ owner: process.env.ZEUS_RELEASE_OWNER.trim(), repo: process.env.ZEUS_RELEASE_REPO.trim() }]

for (const { owner, repo } of targets) {
  const release = await ensureGithubDraftRelease({ owner, repo, version, token })
  console.log(`Uploading release assets to ${owner}/${repo}...`)
  await uploadGithubReleaseAssets({ owner, repo, version, token, distDir: outputDir, releaseId: release?.id })
}

console.log('Done.')
