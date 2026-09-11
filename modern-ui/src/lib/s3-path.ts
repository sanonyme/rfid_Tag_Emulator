import { normalizeRemotePath } from './sftp-remote-path'

/** Bucket prefix with a trailing slash, or empty for the bucket root. */
export function normalizeS3Prefix(prefix: string): string {
  const trimmed = String(prefix ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
  return trimmed ? `${trimmed}/` : ''
}

export function uiPathToRelative(uiPath: string): string {
  const n = normalizeRemotePath(uiPath)
  if (n === '/') return ''
  return n.replace(/^\//, '').replace(/\/+$/, '')
}

/** Object key for a file (no trailing slash). */
export function uiPathToKey(uiPath: string, prefix: string): string {
  const pfx = normalizeS3Prefix(prefix)
  const rel = uiPathToRelative(uiPath)
  if (!rel) return pfx.replace(/\/+$/, '')
  return `${pfx}${rel}`
}

/** List prefix for a directory (empty or trailing slash). */
export function uiDirToPrefix(uiPath: string, prefix: string): string {
  const pfx = normalizeS3Prefix(prefix)
  const rel = uiPathToRelative(uiPath)
  if (!rel) return pfx
  return `${pfx}${rel}/`
}

export function keyToUiPath(key: string, prefix: string): string {
  const pfx = normalizeS3Prefix(prefix)
  let rest = String(key ?? '').replace(/\\/g, '/')
  if (pfx && rest.startsWith(pfx)) rest = rest.slice(pfx.length)
  rest = rest.replace(/\/+$/, '')
  return rest ? `/${rest}` : '/'
}

export function s3CopySource(bucket: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${bucket}/${encodedKey}`
}
