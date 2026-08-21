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

export async function ensureGithubDraftRelease({ owner, repo, version, token }) {
  const tag = releaseTag(version)
  const headers = githubHeaders(token)
  const repoLabel = `${owner}/${repo}`

  const existingRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers,
  })

  if (existingRes.ok) {
    const release = await githubJson(existingRes)
    console.log(`Using existing release ${tag} on ${repoLabel} (draft=${release?.draft === true})`)
    return release
  }

  if (existingRes.status !== 404) {
    const body = await githubJson(existingRes)
    throw new Error(`Failed to check release ${tag} on ${repoLabel}: HTTP ${existingRes.status} ${body?.message ?? ''}`)
  }

  console.log(`Creating empty draft release ${tag} on ${repoLabel}...`)
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: tag.replace(/^v/, ''),
      draft: true,
      generate_release_notes: false,
    }),
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
    return getGithubRelease({ owner, repo, version, token })
  }

  throw new Error(`Failed to create draft release ${tag} on ${repoLabel}: HTTP ${createRes.status} ${message}`)
}
