import path from 'path'

/** POSIX remote path normalization (shared with electron SFTP handler). */
export function normalizeRemotePath(p: string): string {
  if (!p || p === '.') return '/'
  const normalized = path.posix.normalize(String(p).replace(/\\/g, '/'))
  if (!normalized.startsWith('/')) return `/${normalized}`
  return normalized || '/'
}
