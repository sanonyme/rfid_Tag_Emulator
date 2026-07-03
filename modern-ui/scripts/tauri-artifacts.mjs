import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false
  fs.copyFileSync(src, dest)
  return true
}

function archSuffix() {
  const a = os.arch()
  if (a === 'x64') return 'x64'
  if (a === 'arm64') return 'arm64'
  return a
}

/** Mirror Electron artifact naming: versioned exe + friendly setup names. */
export function finalizeTauriArtifacts(version) {
  const releaseDir = path.join(root, 'src-tauri', 'target', 'release')
  const outputs = []
  const arch = archSuffix()

  if (process.platform === 'win32') {
    const rawExe = path.join(releaseDir, 'zeus-rfid-emulator.exe')
    const versionedExe = path.join(releaseDir, `zeus-rfid-emulator_${version}_${arch}.exe`)
    if (copyIfExists(rawExe, versionedExe)) {
      outputs.push(versionedExe)
    }

    const nsisDir = path.join(releaseDir, 'bundle', 'nsis')
    if (fs.existsSync(nsisDir)) {
      for (const file of fs.readdirSync(nsisDir)) {
        if (file.endsWith('-setup.exe')) {
          const friendly = path.join(nsisDir, `Zeus RFID Emulator Setup ${version}.exe`)
          copyIfExists(path.join(nsisDir, file), friendly)
          outputs.push(friendly)
        }
        if (file.endsWith('-setup.exe.sig')) {
          outputs.push(path.join(nsisDir, file))
        }
      }
    }

    const msiDir = path.join(releaseDir, 'bundle', 'msi')
    if (fs.existsSync(msiDir)) {
      for (const file of fs.readdirSync(msiDir)) {
        if (file.endsWith('.msi')) {
          const friendly = path.join(msiDir, `Zeus RFID Emulator Setup ${version}.msi`)
          copyIfExists(path.join(msiDir, file), friendly)
          outputs.push(friendly)
        }
        if (file.endsWith('.msi.sig')) {
          outputs.push(path.join(msiDir, file))
        }
      }
    }
  }

  if (process.platform === 'linux') {
    const rawBin = path.join(releaseDir, 'zeus-rfid-emulator')
    const versionedBin = path.join(releaseDir, `zeus-rfid-emulator_${version}_${arch}`)
    if (copyIfExists(rawBin, versionedBin)) {
      outputs.push(versionedBin)
    }

    const appImageDir = path.join(releaseDir, 'bundle', 'appimage')
    if (fs.existsSync(appImageDir)) {
      for (const file of fs.readdirSync(appImageDir)) {
        if (file.endsWith('.AppImage') && !file.endsWith('.sig')) {
          const friendly = path.join(appImageDir, `zeus-rfid-emulator_${version}_${arch}.AppImage`)
          copyIfExists(path.join(appImageDir, file), friendly)
          outputs.push(friendly)
        }
        if (file.endsWith('.AppImage.sig')) {
          outputs.push(path.join(appImageDir, file))
        }
      }
    }

    const debDir = path.join(releaseDir, 'bundle', 'deb')
    if (fs.existsSync(debDir)) {
      for (const file of fs.readdirSync(debDir)) {
        if (file.endsWith('.deb')) {
          const friendly = path.join(debDir, `zeus-rfid-emulator_${version}_${arch}.deb`)
          copyIfExists(path.join(debDir, file), friendly)
          outputs.push(friendly)
        }
        if (file.endsWith('.deb.sig')) {
          outputs.push(path.join(debDir, file))
        }
      }
    }
  }

  return outputs
}

function collectPlatformEntry(releaseDir, platformKey, dir, preferSuffixes, baseUrl) {
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  for (const suffix of preferSuffixes) {
    const bundle = files.find((f) => f.endsWith(suffix) && !f.endsWith('.sig'))
    if (!bundle) continue
    const sigFile = `${bundle}.sig`
    if (!files.includes(sigFile)) continue
    return {
      platformKey,
      entry: {
        url: `${baseUrl}/${encodeURIComponent(bundle)}`,
        signature: fs.readFileSync(path.join(dir, sigFile), 'utf8').trim(),
      },
    }
  }
  return null
}

export function buildLatestJson({ owner, repo, version, notes = '', releaseDir = null }) {
  const baseReleaseDir = releaseDir ?? path.join(root, 'src-tauri', 'target', 'release')
  const platforms = {}
  const tag = version.startsWith('v') ? version : `v${version}`
  const baseUrl = `https://github.com/${owner}/${repo}/releases/download/${tag}`

  const candidates = [
    collectPlatformEntry(
      baseReleaseDir,
      'windows-x86_64',
      path.join(baseReleaseDir, 'bundle', 'nsis'),
      ['-setup.exe'],
      baseUrl,
    ),
    collectPlatformEntry(
      baseReleaseDir,
      'windows-x86_64',
      path.join(baseReleaseDir, 'bundle', 'msi'),
      ['.msi'],
      baseUrl,
    ),
    collectPlatformEntry(
      baseReleaseDir,
      'linux-x86_64',
      path.join(baseReleaseDir, 'bundle', 'appimage'),
      ['.AppImage'],
      baseUrl,
    ),
    collectPlatformEntry(
      baseReleaseDir,
      'linux-x86_64',
      path.join(baseReleaseDir, 'bundle', 'deb'),
      ['.deb'],
      baseUrl,
    ),
  ]

  for (const hit of candidates) {
    if (hit && !platforms[hit.platformKey]) {
      platforms[hit.platformKey] = hit.entry
    }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error(
      'No signed updater bundles found. Build with TAURI_SIGNING_PRIVATE_KEY and createUpdaterArtifacts enabled.',
    )
  }

  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  }
}

/** Merge platform entries from partial latest.json files (CI matrix builds). */
export function mergeLatestJsonParts(parts) {
  const merged = {
    version: parts[0]?.version ?? '',
    notes: parts[0]?.notes ?? '',
    pub_date: new Date().toISOString(),
    platforms: {},
  }
  for (const part of parts) {
    if (!merged.version && part.version) merged.version = part.version
    if (!merged.notes && part.notes) merged.notes = part.notes
    Object.assign(merged.platforms, part.platforms ?? {})
  }
  return merged
}

export function writeLatestJson(latest, outPath) {
  fs.writeFileSync(outPath, `${JSON.stringify(latest, null, 2)}\n`)
  return outPath
}

export function readLatestJson(fromPath) {
  return JSON.parse(fs.readFileSync(fromPath, 'utf8'))
}
