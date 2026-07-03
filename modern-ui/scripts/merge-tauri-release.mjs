import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mergeLatestJsonParts,
  readLatestJson,
  writeLatestJson,
} from './tauri-artifacts.mjs'
import { readAppVersion } from './sync-app-version.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactsRoot = process.argv[2]
if (!artifactsRoot) {
  console.error('Usage: node scripts/merge-tauri-release.mjs <artifacts-download-dir>')
  process.exit(1)
}

const outDir = path.join(root, 'dist', 'tauri-release')
fs.mkdirSync(outDir, { recursive: true })

const partialLatest = []
const copied = []

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (entry.name === 'latest.partial.json') {
      partialLatest.push(readLatestJson(full))
      continue
    }
    if (
      entry.name.endsWith('.exe') ||
      entry.name.endsWith('.msi') ||
      entry.name.endsWith('.deb') ||
      entry.name.endsWith('.AppImage') ||
      entry.name.endsWith('.sig')
    ) {
      const dest = path.join(outDir, entry.name)
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(full, dest)
        copied.push(dest)
      }
    }
  }
}

walk(path.resolve(artifactsRoot))

const version = readAppVersion()

const latest =
  partialLatest.length > 0
    ? mergeLatestJsonParts(partialLatest)
    : { version, notes: `Zeus RFID Emulator ${version}`, platforms: {} }

if (Object.keys(latest.platforms).length === 0) {
  console.warn('[merge-tauri-release] No signed updater platforms found in partial latest files.')
} else {
  const latestPath = path.join(outDir, 'latest.json')
  writeLatestJson(latest, latestPath)
  copied.push(latestPath)
}

console.log(`[merge-tauri-release] Prepared ${copied.length} files in ${outDir}`)
