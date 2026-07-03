import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { buildLatestJson, finalizeTauriArtifacts, writeLatestJson } from './tauri-artifacts.mjs'
import { readAppVersion } from './sync-app-version.mjs'
import { runCommand } from './run-command.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
}

const required = ['ZEUS_RELEASE_OWNER', 'ZEUS_RELEASE_REPO', 'GH_TOKEN']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const owner = process.env.ZEUS_RELEASE_OWNER.trim()
const repo = process.env.ZEUS_RELEASE_REPO.trim()
const version = readAppVersion()
const tag = `v${version}`

console.log(`[tauri:release] Building and publishing ${tag} to ${owner}/${repo}...`)
runCommand('node', ['scripts/tauri-build.mjs'], process.env, root)

finalizeTauriArtifacts(version)

const releaseDir = path.join(root, 'src-tauri', 'target', 'release')
const latestPath = path.join(releaseDir, 'latest.json')
writeLatestJson(
  buildLatestJson({
    owner,
    repo,
    version,
    notes: `Zeus RFID Emulator ${version}`,
  }),
  latestPath,
)
console.log(`[tauri:release] Wrote ${latestPath}`)

const assets = []
const collect = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file)
    if (
      file.endsWith('.exe') ||
      file.endsWith('.msi') ||
      file.endsWith('.deb') ||
      file.endsWith('.AppImage') ||
      file.endsWith('.sig') ||
      file === 'latest.json'
    ) {
      assets.push(full)
    }
  }
}

collect(path.join(releaseDir, 'bundle', 'nsis'))
collect(path.join(releaseDir, 'bundle', 'msi'))
collect(path.join(releaseDir, 'bundle', 'deb'))
collect(path.join(releaseDir, 'bundle', 'appimage'))
assets.push(latestPath)
collect(releaseDir)

const uniqueAssets = [...new Set(assets)].filter((p) => fs.existsSync(p))
if (uniqueAssets.length === 0) {
  console.error('[tauri:release] No release assets found.')
  process.exit(1)
}

runCommand(
  'gh',
  ['release', 'create', tag, '--title', `Zeus RFID Emulator ${version}`, '--notes', `Release ${version}`, ...uniqueAssets.flatMap((a) => ['--attach', a])],
  process.env,
  root,
)

console.log(`[tauri:release] Published ${tag} to https://github.com/${owner}/${repo}/releases/tag/${tag}`)
