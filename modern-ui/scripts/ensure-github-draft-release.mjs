/**
 * Pre-create an empty draft GitHub release before electron-builder publishes.
 *
 * electron-builder 26.x uploads installer, blockmap, and latest.yml in parallel.
 * Without an existing release, each upload can race to create one, producing two
 * draft releases with assets split between them.
 */
export function releaseTag(version) {
  const trimmed = String(version).trim()
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
}

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

export async function getGithubRelease({ owner, repo, version, token, releaseId }) {
  const tag = releaseTag(version)
  const headers = githubHeaders(token)
  const repoLabel = `${owner}/${repo}`

  if (releaseId) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${releaseId}`, { headers })
    if (res.ok) {
      return githubJson(res)
    }
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const byTagRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
      headers,
    })
    if (byTagRes.ok) {
      return githubJson(byTagRes)
    }

    const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`, {
      headers,
    })
    if (listRes.ok) {
      const releases = await githubJson(listRes)
      const match = Array.isArray(releases) ? releases.find((release) => release.tag_name === tag) : null
      if (match) {
        return match
      }
    }

    if (attempt < 10) {
      await sleep(500 * attempt)
    }
  }

  throw new Error(`Release ${tag} not found on ${repoLabel}`)
}

const SILENT_UPDATE_MARKER = '<!-- zeus:silent -->'

async function ensureSilentMarkerOnRelease({ owner, repo, release, token }) {
  if (!release?.id) return release
  const existingBody = typeof release.body === 'string' ? release.body : ''
  if (existingBody.includes(SILENT_UPDATE_MARKER)) return release

  const nextBody = existingBody.trim()
    ? `${SILENT_UPDATE_MARKER}\n${existingBody}`
    : `${SILENT_UPDATE_MARKER}\nSilent background maintenance update.`

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: nextBody }),
  })
  if (res.ok) {
    console.log(`Marked release ${release.tag_name} on ${owner}/${repo} as silent update`)
    return githubJson(res)
  }
  return release
}

export async function ensureGithubDraftRelease({ owner, repo, version, token, silent = false }) {
  const tag = releaseTag(version)
  const headers = githubHeaders(token)
  const repoLabel = `${owner}/${repo}`

  const existingRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers,
  })

  if (existingRes.ok) {
    const release = await githubJson(existingRes)
    console.log(`Using existing release ${tag} on ${repoLabel} (draft=${release?.draft === true})`)
    return silent ? ensureSilentMarkerOnRelease({ owner, repo, release, token }) : release
  }

  if (existingRes.status !== 404) {
    const body = await githubJson(existingRes)
    throw new Error(`Failed to check release ${tag} on ${repoLabel}: HTTP ${existingRes.status} ${body?.message ?? ''}`)
  }

  // Drafts are often not reachable by tag. Prefer an existing draft (with assets if duplicates exist).
  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`, { headers })
  if (listRes.ok) {
    const releases = await githubJson(listRes)
    const matches = Array.isArray(releases) ? releases.filter((release) => release.tag_name === tag) : []
    const withAssets = matches.find((release) => Array.isArray(release.assets) && release.assets.length > 0)
    const existing = withAssets ?? matches[0]
    if (existing) {
      console.log(`Using existing release ${tag} on ${repoLabel} (draft=${existing.draft === true})`)
      return silent ? ensureSilentMarkerOnRelease({ owner, repo, release: existing, token }) : existing
    }
  }

  console.log(`Creating empty draft release ${tag} on ${repoLabel}${silent ? ' [silent]' : ''}...`)
  const createBody = {
    tag_name: tag,
    name: tag.replace(/^v/, ''),
    draft: true,
    generate_release_notes: false,
    ...(silent ? { body: `${SILENT_UPDATE_MARKER}\nSilent background maintenance update.` } : {}),
  }
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })

  if (createRes.ok) {
    const release = await githubJson(createRes)
    console.log(`Created draft release ${tag} on ${repoLabel}`)
    return release
  }

  const body = await githubJson(createRes)
  const message = body?.message ?? 'unknown error'

  if (createRes.status === 422 && /already exists/i.test(message)) {
    console.log(`Draft release ${tag} on ${repoLabel} was created concurrently; continuing.`)
    const concurrent = await getGithubRelease({ owner, repo, version, token })
    return silent ? ensureSilentMarkerOnRelease({ owner, repo, release: concurrent, token }) : concurrent
  }

  throw new Error(`Failed to create draft release ${tag} on ${repoLabel}: HTTP ${createRes.status} ${message}`)
}
