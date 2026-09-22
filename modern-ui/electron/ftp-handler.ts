import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable, Writable } from 'stream'
import { Client, FileType, type FileInfo } from 'basic-ftp'
import { normalizeRemotePath } from '../src/lib/sftp-remote-path.js'
import type { SftpFindMatch, SftpFindOptions, SftpListEntry, SftpPathStat } from './sftp-handler.js'

const READ_MAX_BYTES = 2 * 1024 * 1024
const MAX_FIND_MATCHES = 5000

export type FtpSecureMode = 'off' | 'explicit' | 'implicit'

export interface FtpConnectOptions {
  host: string
  port?: number
  user: string
  password: string
  secure?: FtpSecureMode
}

interface FtpSession {
  client: Client
  queue: Promise<unknown>
  findCancelRequested: boolean
}

const sessions = new Map<string, FtpSession>()

export function hasFtpSession(sessionId: string): boolean {
  return sessions.has(sessionId)
}

function getSession(sessionId: string): FtpSession | null {
  return sessions.get(sessionId) ?? null
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function runExclusive<T>(session: FtpSession, fn: (client: Client) => Promise<T>): Promise<T> {
  const next = session.queue.then(() => fn(session.client), () => fn(session.client))
  session.queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
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

function mtimeSec(info: FileInfo): number | undefined {
  if (info.modifiedAt instanceof Date && !Number.isNaN(info.modifiedAt.getTime())) {
    return Math.floor(info.modifiedAt.getTime() / 1000)
  }
  return undefined
}

function isFolderEntry(info: FileInfo): boolean {
  return info.isDirectory || info.type === FileType.Directory
}

function unixModeFromInfo(info: FileInfo): number | undefined {
  const p = info.permissions
  if (!p) return undefined
  const bits = ((p.user & 7) << 6) | ((p.group & 7) << 3) | (p.world & 7)
  const typeBits = isFolderEntry(info) ? 0o040000 : 0o100000
  return typeBits | bits
}

function defaultPort(secure: FtpSecureMode | undefined, port?: number): number {
  if (port && port > 0) return port
  return secure === 'implicit' ? 990 : 21
}

function toSecure(mode: FtpSecureMode | undefined): boolean | 'implicit' {
  if (mode === 'implicit') return 'implicit'
  if (mode === 'explicit') return true
  return false
}

async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  try {
    session.client.close()
  } catch {
    /* ignore */
  }
}

export async function ftpConnect(
  options: FtpConnectOptions,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const host = String(options.host ?? '').trim()
  const user = String(options.user ?? '').trim()
  const password = String(options.password ?? '')
  const secure = options.secure ?? 'off'
  if (!host) return { ok: false, error: 'Host is required' }
  if (!user) return { ok: false, error: 'Username is required' }
  const port = defaultPort(secure, options.port)
  const client = new Client(20000)
  try {
    await client.access({
      host,
      port,
      user,
      password,
      secure: toSecure(secure),
      secureOptions: { rejectUnauthorized: false },
    })
  } catch (e) {
    try {
      client.close()
    } catch {
      /* ignore */
    }
    return { ok: false, error: errMsg(e) }
  }
  const sessionId = randomUUID()
  sessions.set(sessionId, { client, queue: Promise.resolve(), findCancelRequested: false })
  return { ok: true, sessionId }
}

export async function ftpDisconnect(sessionId: string): Promise<void> {
  await closeSession(sessionId)
}

export async function ftpDisconnectAll(): Promise<void> {
  const ids = [...sessions.keys()]
  await Promise.all(ids.map((id) => closeSession(id)))
}

export async function ftpReaddir(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; entries: SftpListEntry[] } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const dir = normalizeRemotePath(remotePath)
  try {
    const list = await runExclusive(session, (c) => c.list(dir))
    const entries: SftpListEntry[] = list
      .filter((e) => e.name !== '.' && e.name !== '..')
      .map((e) => {
        const folder = isFolderEntry(e)
        return {
          name: e.name,
          type: folder ? 'folder' : 'file',
          size: typeof e.size === 'number' ? e.size : undefined,
          mtime: mtimeSec(e),
          mode: unixModeFromInfo(e),
        }
      })
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return { ok: true, entries }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

async function downloadToBuffer(session: FtpSession, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  const writable = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      cb()
    },
  })
  await runExclusive(session, (c) => c.downloadTo(writable, remotePath))
  return Buffer.concat(chunks)
}

export async function ftpReadFile(
  sessionId: string,
  remotePath: string,
): Promise<
  | { ok: true; text: string; isBinary: false; size: number }
  | { ok: true; isBinary: true; size: number; previewBase64: string }
  | { ok: false; error: string }
> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await ftpStat(sessionId, p)
    if (st.ok === false) return { ok: false, error: st.error }
    if (st.stat.isDirectory) return { ok: false, error: 'Path is a directory' }
    if (st.stat.size > READ_MAX_BYTES) {
      return {
        ok: false,
        error: `File too large (${st.stat.size} bytes). Maximum for preview is ${READ_MAX_BYTES} bytes.`,
      }
    }
    const buf = await downloadToBuffer(session, p)
    const size = buf.length
    if (isMostlyText(buf)) {
      return { ok: true, text: buf.toString('utf8'), isBinary: false, size }
    }
    return { ok: true, isBinary: true, size, previewBase64: buf.toString('base64') }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpWriteFile(
  sessionId: string,
  remotePath: string,
  base64Data: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    let buf: Buffer
    try {
      buf = Buffer.from(base64Data, 'base64')
    } catch {
      return { ok: false, error: 'Invalid base64 payload' }
    }
    await runExclusive(session, (c) => c.uploadFrom(Readable.from(buf), p))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpWriteTextFile(
  sessionId: string,
  remotePath: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return ftpWriteFile(sessionId, remotePath, Buffer.from(text, 'utf8').toString('base64'))
}

export async function ftpMkdir(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    await runExclusive(session, async (c) => {
      // Do not ignore errors here: a "550 already exists / permission denied"
      // must surface instead of reporting a phantom success.
      await c.send(`MKD ${p}`)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpRename(
  sessionId: string,
  oldPath: string,
  newPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const a = normalizeRemotePath(oldPath)
  const b = normalizeRemotePath(newPath)
  try {
    await runExclusive(session, (c) => c.rename(a, b))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpUnlink(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    await runExclusive(session, (c) => c.remove(p))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpRmrf(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await ftpStat(sessionId, p)
    if (st.ok === false) return { ok: false, error: st.error }
    if (st.stat.isDirectory) {
      await runExclusive(session, (c) => c.removeDir(p))
    } else {
      await runExclusive(session, (c) => c.remove(p))
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpDownloadToLocalFile(
  sessionId: string,
  remotePath: string,
  localPath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await ftpStat(sessionId, p)
    if (st.ok === false) return { ok: false, error: st.error }
    if (st.stat.isDirectory) return { ok: false, error: 'Cannot download a directory' }
    const total = st.stat.size
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true })
    await runExclusive(session, async (c) => {
      c.trackProgress((info) => onProgress?.(info.bytes, total))
      try {
        await c.downloadTo(localPath, p)
      } finally {
        c.trackProgress()
      }
    })
    onProgress?.(total, total)
    return { ok: true }
  } catch (e) {
    try {
      fs.unlinkSync(localPath)
    } catch {
      /* ignore */
    }
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpUploadFromLocalFile(
  sessionId: string,
  localPath: string,
  remotePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await fs.promises.stat(localPath)
    if (!st.isFile()) return { ok: false, error: 'Not a file' }
    const total = st.size
    await runExclusive(session, async (c) => {
      c.trackProgress((info) => onProgress?.(info.bytes, total))
      try {
        await c.uploadFrom(localPath, p)
      } finally {
        c.trackProgress()
      }
    })
    onProgress?.(total, total)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpCopyRemoteFile(
  sessionId: string,
  remoteSrc: string,
  remoteDest: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tmp = path.join(os.tmpdir(), `zeus-ftp-copy-${randomUUID()}`)
  try {
    // FTP has no server-side copy: download then re-upload. Report the two
    // halves as one 0→100% progress bar instead of two full sweeps.
    const down = await ftpDownloadToLocalFile(sessionId, remoteSrc, tmp, (loaded, total) =>
      onProgress?.(loaded, total * 2),
    )
    if (!down.ok) return down
    return await ftpUploadFromLocalFile(sessionId, tmp, remoteDest, (loaded, total) =>
      onProgress?.(total + loaded, total * 2),
    )
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

export async function ftpStat(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; stat: SftpPathStat } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    if (p === '/') {
      return {
        ok: true,
        stat: { path: p, isDirectory: true, size: 0, mode: 0, uid: 0, gid: 0 },
      }
    }
    const parent = path.posix.dirname(p) || '/'
    const name = path.posix.basename(p)
    const list = await runExclusive(session, (c) => c.list(parent))
    const entry = list.find((e) => e.name === name)
    if (entry) {
      const folder = isFolderEntry(entry)
      return {
        ok: true,
        stat: {
          path: p,
          isDirectory: folder,
          size: typeof entry.size === 'number' ? entry.size : 0,
          mode: unixModeFromInfo(entry) ?? 0,
          uid: 0,
          gid: 0,
          mtime: mtimeSec(entry),
        },
      }
    }
    const size = await runExclusive(session, (c) => c.size(p))
    let mtime: number | undefined
    try {
      const d = await runExclusive(session, (c) => c.lastMod(p))
      mtime = Math.floor(d.getTime() / 1000)
    } catch {
      /* optional */
    }
    return {
      ok: true,
      stat: { path: p, isDirectory: false, size, mode: 0, uid: 0, gid: 0, mtime },
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpCalculateSize(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; size: number; fileCount: number } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  try {
    const st = await ftpStat(sessionId, p)
    if (st.ok === false) return { ok: false, error: st.error }
    if (!st.stat.isDirectory) {
      return { ok: true, size: st.stat.size, fileCount: 1 }
    }
    let totalSize = 0
    let fileCount = 0
    const walk = async (dir: string) => {
      const list = await runExclusive(session, (c) => c.list(dir))
      for (const e of list) {
        if (e.name === '.' || e.name === '..') continue
        const full = path.posix.join(dir, e.name)
        if (isFolderEntry(e)) {
          await walk(full)
        } else {
          totalSize += typeof e.size === 'number' ? e.size : 0
          fileCount += 1
        }
      }
    }
    await walk(p)
    return { ok: true, size: totalSize, fileCount }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function ftpSetAttributes(): Promise<{ ok: true } | { ok: false; error: string }> {
  return { ok: false, error: 'FTP does not support Unix permission edits' }
}

export function cancelFtpFind(sessionId: string): void {
  const session = getSession(sessionId)
  if (session) session.findCancelRequested = true
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

function nameMatches(name: string, patterns: string[], caseSensitive: boolean): boolean {
  return patterns.some((p) => globToRegex(p, caseSensitive).test(name))
}

export async function ftpFindFiles(
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
  },
): Promise<
  | { ok: true; matchCount: number; cancelled: boolean; limitReached?: boolean }
  | { ok: false; error: string }
> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  session.findCancelRequested = false
  const root = normalizeRemotePath(options.rootPath)
  const patterns = parseFindPatterns(options.pattern)
  let scannedDirs = 0
  let matchCount = 0
  let limitReached = false

  const shouldCancel = () => session.findCancelRequested
  const emit = (match: SftpFindMatch): boolean => {
    matchCount += 1
    callbacks?.onMatch?.(match)
    if (matchCount >= MAX_FIND_MATCHES) {
      limitReached = true
      return false
    }
    return true
  }

  try {
    const walk = async (dir: string) => {
      if (shouldCancel() || limitReached) return
      scannedDirs += 1
      callbacks?.onProgress?.({
        scannedDirs,
        matchCount,
        currentDir: dir,
        limitReached: limitReached || undefined,
      })
      const list = await runExclusive(session, (c) => c.list(dir))
      for (const e of list) {
        if (shouldCancel() || limitReached) return
        if (e.name === '.' || e.name === '..') continue
        const full = path.posix.join(dir, e.name)
        const folder = isFolderEntry(e)
        if ((options.filesOnly && folder) || (options.foldersOnly && !folder)) {
          if (folder && options.recursive) await walk(full)
          continue
        }
        if (nameMatches(e.name, patterns, options.caseSensitive)) {
          if (
            !emit({
              path: full,
              name: e.name,
              type: folder ? 'folder' : 'file',
              size: typeof e.size === 'number' ? e.size : undefined,
              mtime: mtimeSec(e),
            })
          ) {
            return
          }
        }
        if (folder && options.recursive) await walk(full)
      }
    }
    await walk(root)
    return {
      ok: true,
      matchCount,
      cancelled: shouldCancel(),
      limitReached: limitReached || undefined,
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}
