import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { buildLatestJson, writeLatestJson } from './tauri-artifacts.mjs'
import { readAppVersion } from './sync-app-version.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })

const owner = process.env.ZEUS_RELEASE_OWNER?.trim() || 'sanonyme'
const repo = process.env.ZEUS_RELEASE_REPO?.trim() || 'zeus-releases'
const version = readAppVersion()

const releaseDir = path.join(root, 'src-tauri', 'target', 'release')
const outPath = path.join(releaseDir, 'latest.partial.json')

try {
  writeLatestJson(
    buildLatestJson({
      owner,
      repo,
      version,
      notes: `Zeus RFID Emulator ${version}`,
      releaseDir,
    }),
    outPath,
  )
  console.log(`[write-partial-latest] Wrote ${outPath}`)
} catch (error) {
  console.warn(`[write-partial-latest] Skipped: ${error instanceof Error ? error.message : error}`)
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ version, notes: '', platforms: {} }, null, 2)}\n`,
  )
}
