/** Unix file type + rwxrwxrwx from numeric mode (SFTP attrs). */
const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000
const S_IFREG = 0o100000

export function formatUnixMode(mode: number | undefined): string {
  if (mode === undefined || Number.isNaN(mode)) return '—'
  const t = mode & S_IFMT
  const typeChar =
    t === S_IFDIR ? 'd' : t === S_IFLNK ? 'l' : t === S_IFREG ? '-' : '?'
  const tri = (n: number) =>
    ((n & 4) ? 'r' : '-') + ((n & 2) ? 'w' : '-') + ((n & 1) ? 'x' : '-')
  return typeChar + tri((mode >> 6) & 7) + tri((mode >> 3) & 7) + tri(mode & 7)
}

/** Human-readable size; folders use server `size` when non-zero (often block size), else "—". */
export function formatSftpSize(bytes: number | undefined, isFolder: boolean): string {
  if (bytes === undefined || bytes < 0) return '—'
  if (isFolder && bytes === 0) return '—'
  const n = bytes
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 * 1024 * 1024) return `${Math.max(1, Math.round(n / 1024 / 1024))} MB`
  return `${Math.max(1, Math.round(n / 1024 / 1024 / 1024))} GB`
}

export function formatSftpMtime(sec: number | undefined): string {
  if (sec === undefined || Number.isNaN(sec)) return '—'
  try {
    const d = new Date(sec * 1000)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return '—'
  }
}

/** No remote passwd lookup; common case root shown as label. */
export function formatSftpOwner(uid: number | undefined, gid: number | undefined): string {
  if (uid === undefined && gid === undefined) return '—'
  if (uid === 0 && gid === 0) return 'root'
  if (uid !== undefined && gid !== undefined) return `${uid}:${gid}`
  return String(uid ?? gid ?? '—')
}
