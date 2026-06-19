import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { Client } from 'ssh2'
import type { SFTPWrapper, FileEntry, Stats } from 'ssh2'
import { normalizeRemotePath } from '../src/lib/sftp-remote-path.js'

const READ_MAX_BYTES = 2 * 1024 * 1024
const S_IFMT = 0o170000
const S_IFDIR = 0o040000

interface SftpSession {
  client: Client
  sftp: SFTPWrapper
  findCancelRequested: boolean
}

const sessions = new Map<string, SftpSession>()

function getSession(sessionId: string): SftpSession | null {
  return sessions.get(sessionId) ?? null
}

function getSftp(sessionId: string): SFTPWrapper | null {
  return getSession(sessionId)?.sftp ?? null
}

function attrsIsDirectory(attrs: FileEntry['attrs'] | Stats): boolean {
  const a = attrs as Stats
  if (typeof a.isDirectory === 'function') return a.isDirectory()
  return (attrs.mode & S_IFMT) === S_IFDIR
}

function promisifySftp<T>(
  fn: (cb: (err: Error | null | undefined, result: T) => void) => void
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

async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  try {
    session.sftp.end()
  } catch {
    /* ignore */
  }
  try {
    session.client.end()
  } catch {
    /* ignore */
  }
}

export async function sftpConnect(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const sessionId = randomUUID()
  const c = new Client()
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: true; sessionId: string } | { ok: false; error: string }) => {
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
        sessions.set(sessionId, {
          client: c,
          sftp: sftpInst,
          findCancelRequested: false,
        })
        finish({ ok: true, sessionId })
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

    c.on('close', () => {
      sessions.delete(sessionId)
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

export async function sftpDisconnect(sessionId: string): Promise<void> {
  await closeSession(sessionId)
}

export async function sftpDisconnectAll(): Promise<void> {
  const ids = [...sessions.keys()]
  await Promise.all(ids.map((id) => closeSession(id)))
}

export async function sftpReaddir(
  sessionId: string,
  remotePath: string
): Promise<{ ok: true; entries: SftpListEntry[] } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string
): Promise<
  | { ok: true; text: string; isBinary: false; size: number }
  | { ok: true; isBinary: true; size: number; previewBase64: string }
  | { ok: false; error: string }
> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string,
  base64Data: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  oldPath: string,
  newPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remotePath: string,
  localPath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  localPath: string,
  remotePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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
  sessionId: string,
  remoteSrc: string,
  remoteDest: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
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

export interface SftpPathStat {
  path: string
  isDirectory: boolean
  size: number
  mode: number
  uid: number
  gid: number
  mtime?: number
}

export async function sftpStat(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; stat: SftpPathStat } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    return {
      ok: true,
      stat: {
        path: p,
        isDirectory: stats.isDirectory(),
        size: typeof stats.size === 'number' ? stats.size : 0,
        mode: typeof stats.mode === 'number' ? stats.mode : 0,
        uid: typeof stats.uid === 'number' ? stats.uid : 0,
        gid: typeof stats.gid === 'number' ? stats.gid : 0,
        mtime: typeof stats.mtime === 'number' ? stats.mtime : undefined,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

async function collectRemotePathsRecursive(s: SFTPWrapper, dirPath: string): Promise<string[]> {
  const out: string[] = [dirPath]
  const list = await promisifySftp<FileEntry[]>((cb) => s.readdir(dirPath, cb))
  for (const e of list) {
    if (e.filename === '.' || e.filename === '..') continue
    const full = path.posix.join(dirPath, e.filename)
    if (attrsIsDirectory(e.attrs)) {
      const nested = await collectRemotePathsRecursive(s, full)
      out.push(...nested.slice(1))
    } else {
      out.push(full)
    }
  }
  return out
}

export async function sftpCalculateSize(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; size: number; fileCount: number } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const stats = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    if (!stats.isDirectory()) {
      return { ok: true, size: typeof stats.size === 'number' ? stats.size : 0, fileCount: 1 }
    }
    let totalSize = 0
    let fileCount = 0
    const walk = async (dir: string) => {
      const list = await promisifySftp<FileEntry[]>((cb) => s.readdir(dir, cb))
      for (const e of list) {
        if (e.filename === '.' || e.filename === '..') continue
        const full = path.posix.join(dir, e.filename)
        if (attrsIsDirectory(e.attrs)) {
          await walk(full)
        } else {
          const st = await promisifySftp<Stats>((cb) => s.stat(full, cb))
          totalSize += typeof st.size === 'number' ? st.size : 0
          fileCount += 1
        }
      }
    }
    await walk(p)
    return { ok: true, size: totalSize, fileCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

function applyAddXToDirectory(mode: number): number {
  const perm = mode & 0o777
  const xBits = (perm & 0o444) >> 2
  return (mode & ~0o777) | (perm | xBits)
}

export async function sftpSetAttributes(
  sessionId: string,
  remotePath: string,
  attrs: { mode?: number; uid?: number; gid?: number },
  options?: { recursive?: boolean; addXToDirectories?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = getSftp(sessionId)
  if (!s) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const paths: string[] = []
    const rootStat = await promisifySftp<Stats>((cb) => s.stat(p, cb))
    if (options?.recursive && rootStat.isDirectory()) {
      paths.push(...(await collectRemotePathsRecursive(s, p)))
    } else {
      paths.push(p)
    }

    for (const target of paths) {
      const st = await promisifySftp<Stats>((cb) => s.stat(target, cb))
      const setAttrs: Record<string, number> = {}
      if (attrs.uid !== undefined) setAttrs.uid = attrs.uid
      if (attrs.gid !== undefined) setAttrs.gid = attrs.gid
      if (attrs.mode !== undefined) {
        let mode = attrs.mode
        if (options?.addXToDirectories && st.isDirectory()) {
          mode = applyAddXToDirectory(mode)
        }
        setAttrs.mode = mode
      }
      if (Object.keys(setAttrs).length > 0) {
        await promisifySftp<void>((cb) => s.setstat(target, setAttrs, cb))
      }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

const MAX_FIND_MATCHES = 5000

export function cancelSftpFind(sessionId: string): void {
  const session = getSession(sessionId)
  if (session) session.findCancelRequested = true
}

export interface SftpFindMatch {
  path: string
  name: string
  type: 'file' | 'folder'
  size?: number
  mtime?: number
}

export interface SftpFindOptions {
  rootPath: string
  pattern: string
  recursive: boolean
  caseSensitive: boolean
  filesOnly: boolean
  foldersOnly: boolean
}

function parseFindPatterns(pattern: string): string[] {
  const parts = pattern.split(';').map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 ? parts : ['*']
}

function globToRegex(pattern: string, caseSensitive: boolean): RegExp {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += `\\${ch}`
    else re += ch
  }
  re += '$'
  return new RegExp(re, caseSensitive ? '' : 'i')
}

function nameMatchesFindPattern(
  name: string,
  patterns: string[],
  caseSensitive: boolean,
): boolean {
  return patterns.some((p) => globToRegex(p, caseSensitive).test(name))
}

export async function sftpFindFiles(
  sessionId: string,
  options: SftpFindOptions,
  callbacks?: {
    onProgress?: (payload: {
      scannedDirs: number
      matchCount: number
      currentDir: string
      limitReached?: boolean
    }) => void
    onMatch?: (match: SftpFindMatch) => void
    shouldCancel?: () => boolean
  },
): Promise<
  | { ok: true; matchCount: number; cancelled: boolean; limitReached?: boolean }
  | { ok: false; error: string }
> {
  const s = getSftp(sessionId)
  if (!s) return { ok: false, error: 'Not connected' }

  const session = getSession(sessionId)
  if (session) session.findCancelRequested = false
  const root = normalizeRemotePath(options.rootPath)
  const patterns = parseFindPatterns(options.pattern)
  let scannedDirs = 0
  let matchCount = 0
  let limitReached = false

  const shouldCancel = () =>
    (session?.findCancelRequested ?? false) || callbacks?.shouldCancel?.() === true

  const emitProgress = (currentDir: string) => {
    callbacks?.onProgress?.({
      scannedDirs,
      matchCount,
      currentDir,
      limitReached: limitReached || undefined,
    })
  }

  const considerEntry = (
    fullPath: string,
    name: string,
    isFolder: boolean,
    size?: number,
    mtime?: number,
  ) => {
    if (options.filesOnly && isFolder) return
    if (options.foldersOnly && !isFolder) return
    if (!nameMatchesFindPattern(name, patterns, options.caseSensitive)) return

    matchCount += 1
    callbacks?.onMatch?.({
      path: fullPath,
      name,
      type: isFolder ? 'folder' : 'file',
      size,
      mtime,
    })
    if (matchCount >= MAX_FIND_MATCHES) {
      limitReached = true
    }
  }

  try {
    const rootStat = await promisifySftp<Stats>((cb) => s.stat(root, cb))
    if (!rootStat.isDirectory()) {
      const name = path.posix.basename(root)
      considerEntry(
        root,
        name,
        false,
        typeof rootStat.size === 'number' ? rootStat.size : undefined,
        typeof rootStat.mtime === 'number' ? rootStat.mtime : undefined,
      )
      emitProgress(root)
      return { ok: true, matchCount, cancelled: false, limitReached: limitReached || undefined }
    }

    const walk = async (dirPath: string) => {
      if (shouldCancel() || limitReached) return
      scannedDirs += 1
      emitProgress(dirPath)

      const list = await promisifySftp<FileEntry[]>((cb) => s.readdir(dirPath, cb))
      for (const e of list) {
        if (shouldCancel() || limitReached) return
        if (e.filename === '.' || e.filename === '..') continue

        const full = path.posix.join(dirPath, e.filename)
        const isFolder = attrsIsDirectory(e.attrs)
        const mtimeRaw = e.attrs.mtime
        const mtimeSec =
          mtimeRaw !== undefined
            ? typeof mtimeRaw === 'number'
              ? mtimeRaw
              : Math.floor(new Date(mtimeRaw).getTime() / 1000)
            : undefined

        considerEntry(
          full,
          e.filename,
          isFolder,
          typeof e.attrs.size === 'number' ? e.attrs.size : undefined,
          mtimeSec,
        )

        if (isFolder && options.recursive && !limitReached && !shouldCancel()) {
          await walk(full)
        }
      }
    }

    await walk(root)
    emitProgress(root)

    return {
      ok: true,
      matchCount,
      cancelled: shouldCancel(),
      limitReached: limitReached || undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
