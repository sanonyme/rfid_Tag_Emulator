import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { getGithubRelease } from './ensure-github-draft-release.mjs'

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'zeus-release-script',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function githubJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function getRelease({ owner, repo, version, token, releaseId }) {
  return getGithubRelease({ owner, repo, version, token, releaseId })
}

function sha512Base64(filePath) {
  const hash = createHash('sha512')
  hash.update(readFileSync(filePath))
  return hash.digest('base64')
}

function parseLatestYml(latestYml) {
  const version = latestYml.match(/^version:\s*(.+)$/m)?.[1]?.trim()
  const remoteExeName = latestYml.match(/^path:\s*(.+)$/m)?.[1]?.trim()
  const expectedSha512 = latestYml.match(/^sha512:\s*(.+)$/m)?.[1]?.trim()
  const expectedSize = Number(latestYml.match(/^size:\s*(\d+)$/m)?.[1])

  if (!version || !remoteExeName) {
    throw new Error('Could not read version or installer path from latest.yml')
  }

  return { version, remoteExeName, expectedSha512, expectedSize }
}

function findReleaseAssets(distDir) {
  const latestYmlPath = path.join(distDir, 'latest.yml')
  if (!existsSync(latestYmlPath)) {
    throw new Error(`latest.yml not found in ${distDir}. Run electron-builder first.`)
  }

  const latestYml = readFileSync(latestYmlPath, 'utf8')
  const { version, remoteExeName, expectedSha512, expectedSize } = parseLatestYml(latestYml)

  const files = readdirSync(distDir).filter((name) => {
    const fullPath = path.join(distDir, name)
    return statSync(fullPath).isFile()
  })

  const installers = files.filter((name) => name.endsWith('.exe') && !name.includes('__uninstaller'))
  const localExe = installers.find((name) => name.includes(version))
  if (!localExe) {
    throw new Error(
      `No installer for v${version} found in ${distDir}. Found: ${installers.join(', ') || 'none'}`,
    )
  }

  const localBlockmap = `${localExe}.blockmap`
  if (!files.includes(localBlockmap)) {
    throw new Error(`No blockmap for ${localExe} found in ${distDir}`)
  }

  const exePath = path.join(distDir, localExe)
  const actualSize = statSync(exePath).size
  if (Number.isFinite(expectedSize) && actualSize !== expectedSize) {
    throw new Error(
      `${localExe} size ${actualSize} does not match latest.yml size ${expectedSize}. Re-run electron-builder.`,
    )
  }

  if (expectedSha512) {
    const actualSha512 = sha512Base64(exePath)
    if (actualSha512 !== expectedSha512) {
      throw new Error(
        `${localExe} sha512 does not match latest.yml. Re-run electron-builder before uploading.`,
      )
    }
  }

  console.log(`Using ${localExe} for ${remoteExeName}`)

  return [
    { filePath: exePath, uploadName: remoteExeName },
    { filePath: path.join(distDir, localBlockmap), uploadName: `${remoteExeName}.blockmap` },
    { filePath: latestYmlPath, uploadName: 'latest.yml' },
  ]
}

async function deleteAsset({ owner, repo, assetId, token }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`, {
    method: 'DELETE',
    headers: githubHeaders(token),
  })
  if (!res.ok && res.status !== 404) {
    const body = await githubJson(res)
    throw new Error(`Failed to delete release asset ${assetId}: HTTP ${res.status} ${body?.message ?? ''}`)
  }
}

async function uploadAsset({ owner, repo, releaseId, filePath, uploadName, token }) {
  const size = statSync(filePath).size
  const url = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(uploadName)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
    },
    body: createReadStream(filePath),
    duplex: 'half',
  })

  if (!res.ok) {
    const body = await githubJson(res)
    throw new Error(`Failed to upload ${uploadName}: HTTP ${res.status} ${body?.message ?? ''}`)
  }
}

async function withRetries(label, fn, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const delayMs = 3000 * attempt
      console.warn(`${label} failed (attempt ${attempt}/${attempts}): ${error.message}. Retrying in ${delayMs / 1000}s...`)
      await sleep(delayMs)
    }
  }
  throw lastError
}

export async function uploadGithubReleaseAssets({ owner, repo, version, token, distDir, releaseId }) {
  const repoLabel = `${owner}/${repo}`
  const release = await getGithubRelease({ owner, repo, version, token, releaseId })
  const assets = findReleaseAssets(distDir)
  const existingByName = new Map((release.assets ?? []).map((asset) => [asset.name, asset]))

  for (const { filePath, uploadName } of assets) {
    const sizeMb = (statSync(filePath).size / (1024 * 1024)).toFixed(1)
    const existing = existingByName.get(uploadName)

    if (existing) {
      console.log(`Replacing ${uploadName} on ${repoLabel}...`)
      await withRetries(`Delete ${uploadName}`, () => deleteAsset({ owner, repo, assetId: existing.id, token }))
    } else {
      console.log(`Uploading ${uploadName} (${sizeMb} MB) to ${repoLabel}...`)
    }

    await withRetries(`Upload ${uploadName}`, () =>
      uploadAsset({ owner, repo, releaseId: release.id, filePath, uploadName, token }),
    )
    console.log(`Uploaded ${uploadName}`)
  }
}
