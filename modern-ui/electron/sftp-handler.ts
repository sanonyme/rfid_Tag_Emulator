import fs from 'fs'
import path from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { Client } from 'ssh2'
import type { SFTPWrapper, FileEntry, Stats } from 'ssh2'

const READ_MAX_BYTES = 2 * 1024 * 1024
const S_IFMT = 0o170000
const S_IFDIR = 0o040000

let client: Client | null = null
let sftp: SFTPWrapper | null = null

function normalizeRemotePath(p: string): string {
  if (!p || p === '.') return '/'
  const normalized = path.posix.normalize(String(p).replace(/\\/g, '/'))
  if (!normalized.startsWith('/')) return `/${normalized}`
  return normalized || '/'
}

function getSftp(): SFTPWrapper | null {
  return sftp
}

function attrsIsDirectory(attrs: FileEntry['attrs'] | Stats): boolean {
  const a = attrs as Stats
  if (typeof a.isDirectory === 'function') return a.isDirectory()
  return (attrs.mode & S_IFMT) === S_IFDIR
}

function promisifySftp<T>(
  fn: (cb: (err: Error | undefined, result: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

export interface SftpListEntry {
  name: string
  type: 'file' | 'folder'
  size?: number
  mtime?: number
  /** Raw st_mode (incl. type bits) for permission string */
  mode?: number
  uid?: number
  gid?: number
}

export async function sftpConnect(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await sftpDisconnect()
  const c = new Client()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      clearTimeout(t)
      resolve(result)
    }

    const t = setTimeout(() => {
      try {
        c.end()
      } catch {
        /* ignore */
      }
      finish({ ok: false, error: 'Connection timed out' })
    }, 25000)

    c.on('ready', () => {
      c.sftp((err, sftpInst) => {
        if (err) {
          try {
            c.end()
          } catch {
            /* ignore */
          }
          finish({ ok: false, error: err.message })
          return
        }
        client = c
        sftp = sftpInst
        finish({ ok: true })
      })
    })

    c.on('error', (err: Error) => {
      try {
        c.end()
      } catch {
        /* ignore */
      }
      finish({ ok: false, error: err.message })
    })

    try {
      c.connect({
        host: host.trim(),
        port: port && port > 0 ? port : 22,
        username: username.trim(),
        password,
        readyTimeout: 20000,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      finish({ ok: false, error: msg })
    }
  })
}

export async function sftpDisconnect(): Promise<void> {
  if (sftp) {
    try {
      sftp.end()
    } catch {
      /* ignore */
    }
    sftp = null
  }
  if (client) {
    try {
      client.end()
    } catch {
      /* ignore */
    }
    client = null
  }
}

export async function sftpReaddir(
  remotePath: string
): Promise<{ ok: true; entries: SftpListEntry[] } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const dir = normalizeRemotePath(remotePath)
  try {
    const list = await promisifySftp<FileEntry[]>((cb) => s.readdir(dir, cb))
    const entries: SftpListEntry[] = list
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => {
        const isFolder = attrsIsDirectory(e.attrs)
        const mtimeRaw = e.attrs.mtime
        const mtimeSec =
          mtimeRaw !== undefined
            ? typeof mtimeRaw === 'number'
              ? mtimeRaw
              : Math.floor(new Date(mtimeRaw).getTime() / 1000)
            : undefined
        return {
          name: e.filename,
          type: isFolder ? 'folder' : 'file',
          size: typeof e.attrs.size === 'number' ? e.attrs.size : undefined,
          mtime: mtimeSec,
          mode: typeof e.attrs.mode === 'number' ? e.attrs.mode : undefined,
          uid: typeof e.attrs.uid === 'number' ? e.attrs.uid : undefined,
          gid: typeof e.attrs.gid === 'number' ? e.attrs.gid : undefined,
        }
      })
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return { ok: true, entries }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

function isMostlyText(buf: Buffer): boolean {
  if (buf.length === 0) return true
  const sample = buf.subarray(0, Math.min(buf.length, 8000))
  let bad = 0
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]
    if (b === undefined) continue
    if (b === 0) return false
    if (b < 9 || (b > 13 && b < 32 && b !== 27)) bad++
  }
  return bad / sample.length < 0.02
}

export async function sftpReadFile(
  remotePath: string
): Promise<
  | { ok: true; text: string; isBinary: false; size: number }
  | { ok: true; isBinary: true; size: number; previewBase64: string }
  | { ok: false; error: string }
> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    if (stats.isDirectory()) return { ok: false, error: 'Path is a directory' }
    if (stats.size > READ_MAX_BYTES) {
      return {
        ok: false,
        error: `File too large (${stats.size} bytes). Maximum for preview is ${READ_MAX_BYTES} bytes.`,
      }
    }
    const buf = await promisifySftp<Buffer>((cb) => s.readFile(p, cb))
    const size = buf.length
    if (isMostlyText(buf)) {
      return { ok: true, text: buf.toString('utf8'), isBinary: false, size }
    }
    const preview = buf.subarray(0, Math.min(buf.length, 512))
    return {
      ok: true,
      isBinary: true,
      size,
      previewBase64: preview.toString('base64'),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function sftpWriteFile(
  remotePath: string,
  base64Data: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    let buf: Buffer
    try {
      buf = Buffer.from(base64Data, 'base64')
    } catch {
      return { ok: false, error: 'Invalid base64 payload' }
    }
    await promisifySftp<void>((cb) => s.writeFile(p, buf, cb))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function sftpWriteTextFile(
  remotePath: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    await promisifySftp<void>((cb) =>
      s.writeFile(p, Buffer.from(text, 'utf8'), { mode: 0o644, flag: 'w' }, cb)
    )
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function sftpMkdir(
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    await promisifySftp<void>((cb) => s.mkdir(p, { mode: 0o755 }, cb))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function sftpRename(
  oldPath: string,
  newPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const a = normalizeRemotePath(oldPath)
  const b = normalizeRemotePath(newPath)
  try {
    await promisifySftp<void>((cb) => s.rename(a, b, cb))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function sftpUnlink(
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    await promisifySftp<void>((cb) => s.unlink(p, cb))
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

async function rmrfRecursive(s: SFTPWrapper, dirPath: string): Promise<void> {
  const list = await promisifySftp<FileEntry[]>((cb) => s.readdir(dirPath, cb))
  for (const e of list) {
    if (e.filename === '.' || e.filename === '..') continue
    const full = path.posix.join(dirPath, e.filename)
    if (attrsIsDirectory(e.attrs)) {
      await rmrfRecursive(s, full)
      await promisifySftp<void>((cb) => s.rmdir(full, cb))
    } else {
      await promisifySftp<void>((cb) => s.unlink(full, cb))
    }
  }
}

export async function sftpRmrf(
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    if (stats.isDirectory()) {
      await rmrfRecursive(s, p)
      await promisifySftp<void>((cb) => s.rmdir(p, cb))
    } else {
      await promisifySftp<void>((cb) => s.unlink(p, cb))
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/** Stream remote file to local path (any size). */
export async function sftpDownloadToLocalFile(
  remotePath: string,
  localPath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    if (stats.isDirectory()) return { ok: false, error: 'Cannot download a directory' }
    const total = typeof stats.size === 'number' ? stats.size : 0
    let loaded = 0
    const rs = s.createReadStream(p)
    const ws = fs.createWriteStream(localPath)
    const t = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        loaded += chunk.length
        onProgress?.(loaded, total)
        cb(null, chunk)
      },
    })
    await pipeline(rs, t, ws)
    onProgress?.(total, total)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      fs.unlinkSync(localPath)
    } catch {
      /* ignore */
    }
    return { ok: false, error: msg }
  }
}

/** Stream local file to remote path (any size). */
export async function sftpUploadFromLocalFile(
  localPath: string,
  remotePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await fs.promises.stat(localPath)
    if (!st.isFile()) return { ok: false, error: 'Not a file' }
    const total = st.size
    let loaded = 0
    const rs = fs.createReadStream(localPath)
    const ws = s.createWriteStream(p)
    const t = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        loaded += chunk.length
        onProgress?.(loaded, total)
        cb(null, chunk)
      },
    })
    await pipeline(rs, t, ws)
    onProgress?.(total, total)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/** Copy a remote file to another path on the same server (streaming). */
export async function sftpCopyRemoteFile(
  remoteSrc: string,
  remoteDest: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp()
  if (!s) return { ok: false, error: 'Not connected' }
  const a = normalizeRemotePath(remoteSrc)
  const b = normalizeRemotePath(remoteDest)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(a, cb))
    if (stats.isDirectory()) return { ok: false, error: 'Use download for folders' }
    const total = typeof stats.size === 'number' ? stats.size : 0
    let loaded = 0
    const rs = s.createReadStream(a)
    const ws = s.createWriteStream(b)
    const t = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        loaded += chunk.length
        onProgress?.(loaded, total)
        cb(null, chunk)
      },
    })
    await pipeline(rs, t, ws)
    onProgress?.(total, total)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
