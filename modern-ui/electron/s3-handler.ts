import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
import { Upload } from '@aws-sdk/lib-storage'
import {
  keyToUiPath,
  normalizeS3Prefix,
  s3CopySource,
  uiDirToPrefix,
  uiPathToKey,
} from '../src/lib/s3-path.js'
import { normalizeRemotePath } from '../src/lib/sftp-remote-path.js'
import type { SftpFindMatch, SftpFindOptions, SftpListEntry, SftpPathStat } from './sftp-handler.js'

const READ_MAX_BYTES = 2 * 1024 * 1024
const DELETE_BATCH = 1000
const MAX_FIND_MATCHES = 5000

export interface S3ConnectOptions {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  prefix?: string
  endpoint?: string
  roleArn?: string
  roleSessionName?: string
  externalId?: string
  sourceIdentity?: string
}

interface S3Session {
  client: S3Client
  bucket: string
  prefix: string
  findCancelRequested: boolean
}

const sessions = new Map<string, S3Session>()

export function hasS3Session(sessionId: string): boolean {
  return sessions.has(sessionId)
}

function getSession(sessionId: string): S3Session | null {
  return sessions.get(sessionId) ?? null
}

function awsErrorDetails(e: unknown): { message: string; status?: number; code?: string; endpoint?: string } {
  if (!e || typeof e !== 'object') return { message: String(e) }
  const rec = e as {
    message?: string
    name?: string
    Code?: string
    Endpoint?: string
    $metadata?: { httpStatusCode?: number }
  }
  return {
    message: rec.message || String(e),
    status: rec.$metadata?.httpStatusCode,
    code: rec.Code || rec.name,
    endpoint: rec.Endpoint,
  }
}

function errMsg(e: unknown): string {
  const { message, status, code, endpoint } = awsErrorDetails(e)
  const region = bucketRegionFromError(e)
  const bits = [
    message && message !== 'UnknownError' ? message : null,
    code && code !== message ? code : message === 'UnknownError' ? 'UnknownError' : null,
    status ? `HTTP ${status}` : null,
    region ? `bucket region ${region}` : null,
    endpoint || null,
  ].filter(Boolean)
  return bits.join(' · ') || 'S3 request failed'
}

function bucketRegionFromError(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null
  const rec = e as {
    Endpoint?: string
    $response?: { headers?: Record<string, string> }
  }
  const headers = rec.$response?.headers ?? {}
  const fromHeader =
    headers['x-amz-bucket-region'] ||
    headers['X-Amz-Bucket-Region'] ||
    headers['x-amz-bucket-region'.toLowerCase()]
  if (fromHeader) return fromHeader
  const endpoint = rec.Endpoint ?? ''
  const hosted = endpoint.match(/\.s3[.-]([a-z0-9-]+)\.amazonaws\.com/i)
  if (hosted?.[1] && hosted[1] !== 'amazonaws') return hosted[1]
  if (/s3\.amazonaws\.com/i.test(endpoint)) return 'us-east-1'
  return null
}

function hintAccessDenied(message: string, usedAssumeRole: boolean): string {
  if (!/AccessDenied|Access Denied|HTTP 403/i.test(message)) return message
  if (usedAssumeRole) {
    return `${message}. The assumed role needs s3:ListBucket (and typically s3:GetObject) on this bucket.`
  }
  return `${message}. These access keys often cannot list the bucket until they assume a role — fill Role ARN (and External ID if the trust policy requires it).`
}

function accountIdFromIamArn(arn: string): string | null {
  const m = arn.match(/^arn:aws:iam::(\d+):/)
  return m?.[1] ?? null
}

function hintAssumeRoleDenied(
  message: string,
  details: { roleSessionName: string; sentExternalId: boolean },
): string {
  const bits = [`AssumeRole failed: ${message}`]
  if (!/AccessDenied|Access Denied|HTTP 403/i.test(message)) {
    return bits.join(' ')
  }
  const userArn = message.match(/User:\s*(arn:aws:iam::\d+:[^\s]+)/)?.[1]
  const roleArn = message.match(/resource:\s*(arn:aws:iam::\d+:role\/[^\s]+)/)?.[1]
  const userAccount = userArn ? accountIdFromIamArn(userArn) : null
  const roleAccount = roleArn ? accountIdFromIamArn(roleArn) : null
  const crossAccount = Boolean(userAccount && roleAccount && userAccount !== roleAccount)
  bits.push(
    `Session name sent: ${details.roleSessionName}. External ID: ${details.sentExternalId ? 'sent' : 'not sent'}.`,
  )
  if (crossAccount && !details.sentExternalId) {
    bits.push(
      'This is a cross-account assume with an empty External ID — the role trust policy almost always requires it.',
    )
  } else if (crossAccount) {
    bits.push(
      'Cross-account assume was denied. Use the Role ARN, External ID, and session name from the same working connection (do not mix rows). The IAM user must be listed in that role’s trust policy.',
    )
  } else {
    bits.push(
      'This IAM user is not allowed to assume that role. Confirm Role ARN, External ID, and session name match the working tool.',
    )
  }
  return bits.join(' ')
}

async function resolveS3Credentials(
  options: S3ConnectOptions,
  region: string,
): Promise<
  | { ok: true; accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  | { ok: false; error: string }
> {
  const accessKeyId = String(options.accessKeyId ?? '').trim()
  const secretAccessKey = String(options.secretAccessKey ?? '')
  const sessionToken = options.sessionToken?.trim() || undefined
  const roleArn = options.roleArn?.trim()
  if (!roleArn) {
    return { ok: true, accessKeyId, secretAccessKey, sessionToken }
  }

  const roleSessionName = options.roleSessionName?.trim()
  if (!roleSessionName) {
    return { ok: false, error: 'Session name is required when assuming a role' }
  }
  const externalId = options.externalId?.trim() || undefined

  const sts = new STSClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    },
  })
  try {
    const out = await sts.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
        ...(externalId ? { ExternalId: externalId } : {}),
        ...(options.sourceIdentity?.trim() ? { SourceIdentity: options.sourceIdentity.trim() } : {}),
      }),
    )
    const creds = out.Credentials
    if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
      return { ok: false, error: 'AssumeRole did not return credentials' }
    }
    return {
      ok: true,
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    }
  } catch (e) {
    return {
      ok: false,
      error: hintAssumeRoleDenied(errMsg(e), {
        roleSessionName,
        sentExternalId: Boolean(externalId),
      }),
    }
  } finally {
    try {
      sts.destroy()
    } catch {
      /* ignore */
    }
  }
}

function createS3Client(options: {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  endpoint?: string
  forcePathStyle?: boolean
}): S3Client {
  const endpoint = options.endpoint?.trim()
  const pathStyle = Boolean(endpoint) || Boolean(options.forcePathStyle)
  return new S3Client({
    region: options.region,
    followRegionRedirects: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
    },
    ...(endpoint ? { endpoint } : {}),
    ...(pathStyle ? { forcePathStyle: true } : {}),
  })
}

export async function s3Connect(
  options: S3ConnectOptions,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const bucket = String(options.bucket ?? '').trim()
  const region = String(options.region ?? '').trim()
  const accessKeyId = String(options.accessKeyId ?? '').trim()
  const secretAccessKey = String(options.secretAccessKey ?? '')
  if (!bucket) return { ok: false, error: 'Bucket is required' }
  if (!region) return { ok: false, error: 'Region is required' }
  if (!accessKeyId || !secretAccessKey) return { ok: false, error: 'Access key and secret are required' }

  const assumed = await resolveS3Credentials(options, region)
  if (!assumed.ok) return assumed
  const usedAssumeRole = Boolean(options.roleArn?.trim())

  const endpoint = String(options.endpoint ?? '').trim()
  const creds = {
    region,
    accessKeyId: assumed.accessKeyId,
    secretAccessKey: assumed.secretAccessKey,
    sessionToken: assumed.sessionToken,
    endpoint: endpoint || undefined,
  }
  let client = createS3Client(creds)

  const probe = async (c: S3Client) => {
    await c.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
        Prefix: normalizeS3Prefix(options.prefix ?? '') || undefined,
      }),
    )
  }

  const replaceClient = (next: S3Client) => {
    try {
      client.destroy()
    } catch {
      /* ignore */
    }
    client = next
  }

  try {
    try {
      await probe(client)
    } catch (first) {
      const hinted = bucketRegionFromError(first)
      if (hinted && hinted !== region && !endpoint) {
        replaceClient(createS3Client({ ...creds, region: hinted }))
        try {
          await probe(client)
        } catch (second) {
          replaceClient(createS3Client({ ...creds, region: hinted, forcePathStyle: true }))
          await probe(client).catch(() => {
            throw second
          })
        }
      } else if (!endpoint) {
        replaceClient(createS3Client({ ...creds, forcePathStyle: true }))
        await probe(client).catch(() => {
          throw first
        })
      } else {
        throw first
      }
    }
  } catch (e) {
    try {
      client.destroy()
    } catch {
      /* ignore */
    }
    return { ok: false, error: hintAccessDenied(errMsg(e), usedAssumeRole) }
  }

  const sessionId = randomUUID()
  sessions.set(sessionId, {
    client,
    bucket,
    prefix: normalizeS3Prefix(options.prefix ?? ''),
    findCancelRequested: false,
  })
  return { ok: true, sessionId }
}

export async function s3Disconnect(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  sessions.delete(sessionId)
  try {
    session.client.destroy()
  } catch {
    /* ignore */
  }
}

export async function s3DisconnectAll(): Promise<void> {
  const ids = [...sessions.keys()]
  await Promise.all(ids.map((id) => s3Disconnect(id)))
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

function folderNameFromPrefix(commonPrefix: string, dirPrefix: string): string {
  const rest = dirPrefix ? commonPrefix.slice(dirPrefix.length) : commonPrefix
  return rest.replace(/\/+$/, '')
}

export async function s3Readdir(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; entries: SftpListEntry[] } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const dirPrefix = uiDirToPrefix(remotePath, session.prefix)
  const folders = new Map<string, SftpListEntry>()
  const files: SftpListEntry[] = []
  let token: string | undefined
  try {
    do {
      const page = await session.client.send(
        new ListObjectsV2Command({
          Bucket: session.bucket,
          Prefix: dirPrefix || undefined,
          Delimiter: '/',
          ContinuationToken: token,
        }),
      )
      for (const p of page.CommonPrefixes ?? []) {
        const raw = p.Prefix ?? ''
        const name = folderNameFromPrefix(raw, dirPrefix)
        if (!name || folders.has(name)) continue
        folders.set(name, { name, type: 'folder' })
      }
      for (const obj of page.Contents ?? []) {
        const key = obj.Key ?? ''
        if (!key || key === dirPrefix) continue
        const name = dirPrefix ? key.slice(dirPrefix.length) : key
        if (!name || name.includes('/')) continue
        files.push({
          name,
          type: 'file',
          size: typeof obj.Size === 'number' ? obj.Size : undefined,
          mtime: obj.LastModified ? Math.floor(obj.LastModified.getTime() / 1000) : undefined,
        })
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    const entries = [...folders.values(), ...files]
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return { ok: true, entries }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

async function streamToBuffer(body: unknown, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0)
  if (Buffer.isBuffer(body)) return body.subarray(0, Math.min(body.length, maxBytes + 1))
  if (body instanceof Uint8Array) return Buffer.from(body.subarray(0, Math.min(body.length, maxBytes + 1)))
  if (typeof (body as Readable).on === 'function') {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        chunks.push(buf)
        break
      }
      chunks.push(buf)
    }
    return Buffer.concat(chunks)
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    return Buffer.from(bytes.subarray(0, Math.min(bytes.length, maxBytes + 1)))
  }
  return Buffer.alloc(0)
}

export async function s3ReadFile(
  sessionId: string,
  remotePath: string,
): Promise<
  | { ok: true; text: string; isBinary: false; size: number }
  | { ok: true; isBinary: true; size: number; previewBase64: string }
  | { ok: false; error: string }
> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const key = uiPathToKey(remotePath, session.prefix)
  if (!key) return { ok: false, error: 'Path is a directory' }
  try {
    const head = await session.client.send(new HeadObjectCommand({ Bucket: session.bucket, Key: key }))
    const size = head.ContentLength ?? 0
    if (size > READ_MAX_BYTES) {
      return {
        ok: false,
        error: `File too large (${size} bytes). Maximum for preview is ${READ_MAX_BYTES} bytes.`,
      }
    }
    const obj = await session.client.send(new GetObjectCommand({ Bucket: session.bucket, Key: key }))
    const buf = await streamToBuffer(obj.Body, READ_MAX_BYTES)
    if (isMostlyText(buf)) {
      return { ok: true, text: buf.toString('utf8'), isBinary: false, size: buf.length }
    }
    const preview = buf.subarray(0, Math.min(buf.length, 512))
    return { ok: true, isBinary: true, size: buf.length, previewBase64: preview.toString('base64') }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3WriteFile(
  sessionId: string,
  remotePath: string,
  base64Data: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const key = uiPathToKey(remotePath, session.prefix)
  if (!key) return { ok: false, error: 'Invalid path' }
  try {
    const buf = Buffer.from(base64Data, 'base64')
    await session.client.send(
      new PutObjectCommand({ Bucket: session.bucket, Key: key, Body: buf }),
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3WriteTextFile(
  sessionId: string,
  remotePath: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return s3WriteFile(sessionId, remotePath, Buffer.from(text, 'utf8').toString('base64'))
}

export async function s3Mkdir(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const dirPrefix = uiDirToPrefix(remotePath, session.prefix)
  if (!dirPrefix) return { ok: false, error: 'Cannot create the bucket root' }
  try {
    await session.client.send(
      new PutObjectCommand({ Bucket: session.bucket, Key: dirPrefix, Body: Buffer.alloc(0) }),
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

async function listAllKeys(session: S3Session, prefix: string): Promise<_Object[]> {
  const out: _Object[] = []
  let token: string | undefined
  do {
    const page = await session.client.send(
      new ListObjectsV2Command({
        Bucket: session.bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      }),
    )
    out.push(...(page.Contents ?? []))
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return out
}

async function deleteKeys(session: S3Session, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    const chunk = keys.slice(i, i + DELETE_BATCH)
    if (chunk.length === 0) continue
    await session.client.send(
      new DeleteObjectsCommand({
        Bucket: session.bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    )
  }
}

async function copyObject(session: S3Session, srcKey: string, destKey: string): Promise<void> {
  if (srcKey === destKey) return
  await session.client.send(
    new CopyObjectCommand({
      Bucket: session.bucket,
      Key: destKey,
      CopySource: s3CopySource(session.bucket, srcKey),
    }),
  )
}

export async function s3Rename(
  sessionId: string,
  oldPath: string,
  newPath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const from = normalizeRemotePath(oldPath)
  const to = normalizeRemotePath(newPath)
  if (from === to) return { ok: true }
  try {
    const stat = await s3Stat(sessionId, from)
    if (!stat.ok) return { ok: false, error: (stat as { error: string }).error }
    if (!stat.stat.isDirectory) {
      const srcKey = uiPathToKey(from, session.prefix)
      const destKey = uiPathToKey(to, session.prefix)
      await copyObject(session, srcKey, destKey)
      await session.client.send(new DeleteObjectCommand({ Bucket: session.bucket, Key: srcKey }))
      return { ok: true }
    }
    const srcPrefix = uiDirToPrefix(from, session.prefix)
    const destPrefix = uiDirToPrefix(to, session.prefix)
    const objects = await listAllKeys(session, srcPrefix)
    if (objects.length === 0) {
      await session.client.send(
        new PutObjectCommand({ Bucket: session.bucket, Key: destPrefix, Body: Buffer.alloc(0) }),
      )
      return { ok: true }
    }
    for (const obj of objects) {
      const key = obj.Key ?? ''
      if (!key.startsWith(srcPrefix)) continue
      const destKey = `${destPrefix}${key.slice(srcPrefix.length)}`
      await copyObject(session, key, destKey)
    }
    await deleteKeys(
      session,
      objects.map((o) => o.Key).filter((k): k is string => Boolean(k)),
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3Unlink(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const key = uiPathToKey(remotePath, session.prefix)
  if (!key) return { ok: false, error: 'Invalid path' }
  try {
    await session.client.send(new DeleteObjectCommand({ Bucket: session.bucket, Key: key }))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3Rmrf(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  try {
    const stat = await s3Stat(sessionId, remotePath)
    if (!stat.ok) return { ok: false, error: (stat as { error: string }).error }
    if (!stat.stat.isDirectory) return s3Unlink(sessionId, remotePath)
    const prefix = uiDirToPrefix(remotePath, session.prefix)
    const objects = await listAllKeys(session, prefix)
    const keys = objects.map((o) => o.Key).filter((k): k is string => Boolean(k))
    if (keys.length === 0 && prefix) keys.push(prefix)
    await deleteKeys(session, keys)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3Stat(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; stat: SftpPathStat } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const p = normalizeRemotePath(remotePath)
  if (p === '/') {
    return {
      ok: true,
      stat: { path: '/', isDirectory: true, size: 0, mode: 0, uid: 0, gid: 0 },
    }
  }
  const key = uiPathToKey(p, session.prefix)
  const dirPrefix = uiDirToPrefix(p, session.prefix)
  try {
    try {
      const head = await session.client.send(new HeadObjectCommand({ Bucket: session.bucket, Key: key }))
      return {
        ok: true,
        stat: {
          path: p,
          isDirectory: false,
          size: head.ContentLength ?? 0,
          mode: 0,
          uid: 0,
          gid: 0,
          mtime: head.LastModified ? Math.floor(head.LastModified.getTime() / 1000) : undefined,
        },
      }
    } catch {
      /* might be a prefix/folder */
    }
    const page = await session.client.send(
      new ListObjectsV2Command({
        Bucket: session.bucket,
        Prefix: dirPrefix,
        MaxKeys: 1,
      }),
    )
    const found = (page.KeyCount ?? 0) > 0 || (page.Contents?.length ?? 0) > 0
    if (!found) return { ok: false, error: 'Not found' }
    return {
      ok: true,
      stat: { path: p, isDirectory: true, size: 0, mode: 0, uid: 0, gid: 0 },
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3CalculateSize(
  sessionId: string,
  remotePath: string,
): Promise<{ ok: true; size: number; fileCount: number } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  try {
    const stat = await s3Stat(sessionId, remotePath)
    if (!stat.ok) return { ok: false, error: (stat as { error: string }).error }
    if (!stat.stat.isDirectory) {
      return { ok: true, size: stat.stat.size, fileCount: 1 }
    }
    const objects = await listAllKeys(session, uiDirToPrefix(remotePath, session.prefix))
    let size = 0
    let fileCount = 0
    for (const obj of objects) {
      const key = obj.Key ?? ''
      if (!key || key.endsWith('/')) continue
      size += obj.Size ?? 0
      fileCount += 1
    }
    return { ok: true, size, fileCount }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3SetAttributes(): Promise<{ ok: true } | { ok: false; error: string }> {
  return { ok: false, error: 'S3 objects do not support Unix permissions' }
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

export function cancelS3Find(sessionId: string): void {
  const session = getSession(sessionId)
  if (session) session.findCancelRequested = true
}

export async function s3FindFiles(
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
  const patterns = parseFindPatterns(options.pattern)
  const rootPrefix = uiDirToPrefix(options.rootPath, session.prefix)
  let matchCount = 0
  let scannedDirs = 1
  let limitReached = false
  const seenFolders = new Set<string>()

  const emit = (match: SftpFindMatch) => {
    if (matchCount >= MAX_FIND_MATCHES) {
      limitReached = true
      return false
    }
    matchCount += 1
    callbacks?.onMatch?.(match)
    return true
  }

  try {
    let token: string | undefined
    do {
      if (session.findCancelRequested) {
        return { ok: true, matchCount, cancelled: true, limitReached }
      }
      const page = await session.client.send(
        new ListObjectsV2Command({
          Bucket: session.bucket,
          Prefix: rootPrefix || undefined,
          Delimiter: options.recursive ? undefined : '/',
          ContinuationToken: token,
        }),
      )

      if (!options.recursive) {
        for (const p of page.CommonPrefixes ?? []) {
          const name = folderNameFromPrefix(p.Prefix ?? '', rootPrefix)
          if (!name) continue
          if (!options.filesOnly && nameMatches(name, patterns, options.caseSensitive)) {
            if (!emit({ path: keyToUiPath(p.Prefix ?? '', session.prefix), name, type: 'folder' })) {
              return { ok: true, matchCount, cancelled: false, limitReached: true }
            }
          }
        }
      }

      for (const obj of page.Contents ?? []) {
        const key = obj.Key ?? ''
        if (!key || key === rootPrefix) continue
        const uiPath = keyToUiPath(key, session.prefix)
        const name = path.posix.basename(uiPath)
        const isFolder = key.endsWith('/')
        if (isFolder) {
          if (seenFolders.has(uiPath)) continue
          seenFolders.add(uiPath)
          scannedDirs += 1
          if (!options.filesOnly && nameMatches(name, patterns, options.caseSensitive)) {
            if (!emit({ path: uiPath, name, type: 'folder', mtime: obj.LastModified ? Math.floor(obj.LastModified.getTime() / 1000) : undefined })) {
              return { ok: true, matchCount, cancelled: false, limitReached: true }
            }
          }
          continue
        }
        if (options.recursive) {
          const rel = rootPrefix ? key.slice(rootPrefix.length) : key
          const parts = rel.split('/').slice(0, -1)
          let walk = options.rootPath === '/' ? '' : options.rootPath
          for (const part of parts) {
            walk = walk ? `${walk.replace(/\/+$/, '')}/${part}` : `/${part}`
            if (seenFolders.has(walk)) continue
            seenFolders.add(walk)
            scannedDirs += 1
            if (!options.filesOnly && nameMatches(part, patterns, options.caseSensitive)) {
              if (!emit({ path: walk, name: part, type: 'folder' })) {
                return { ok: true, matchCount, cancelled: false, limitReached: true }
              }
            }
          }
        }
        if (!options.foldersOnly && nameMatches(name, patterns, options.caseSensitive)) {
          if (
            !emit({
              path: uiPath,
              name,
              type: 'file',
              size: obj.Size,
              mtime: obj.LastModified ? Math.floor(obj.LastModified.getTime() / 1000) : undefined,
            })
          ) {
            return { ok: true, matchCount, cancelled: false, limitReached: true }
          }
        }
      }

      callbacks?.onProgress?.({
        scannedDirs,
        matchCount,
        currentDir: options.rootPath,
        limitReached,
      })
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token && !limitReached)

    return { ok: true, matchCount, cancelled: false, ...(limitReached ? { limitReached: true } : {}) }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3DownloadToLocalFile(
  sessionId: string,
  remotePath: string,
  localPath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const key = uiPathToKey(remotePath, session.prefix)
  if (!key) return { ok: false, error: 'Cannot download a directory' }
  try {
    const head = await session.client.send(new HeadObjectCommand({ Bucket: session.bucket, Key: key }))
    const total = head.ContentLength ?? 0
    const obj = await session.client.send(new GetObjectCommand({ Bucket: session.bucket, Key: key }))
    const body = obj.Body
    if (!body) return { ok: false, error: 'Empty object body' }
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true })
    const ws = fs.createWriteStream(localPath)
    let loaded = 0
    const readable =
      typeof (body as Readable).pipe === 'function'
        ? (body as Readable)
        : Readable.fromWeb(body as never)
    readable.on('data', (chunk: Buffer | Uint8Array) => {
      loaded += chunk.length
      onProgress?.(loaded, total)
    })
    await pipeline(readable, ws)
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

export async function s3UploadFromLocalFile(
  sessionId: string,
  localPath: string,
  remotePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  const key = uiPathToKey(remotePath, session.prefix)
  if (!key) return { ok: false, error: 'Invalid path' }
  try {
    const st = await fs.promises.stat(localPath)
    if (!st.isFile()) return { ok: false, error: 'Not a file' }
    const upload = new Upload({
      client: session.client,
      params: {
        Bucket: session.bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
      },
    })
    upload.on('httpUploadProgress', (p) => {
      onProgress?.(p.loaded ?? 0, p.total ?? st.size)
    })
    await upload.done()
    onProgress?.(st.size, st.size)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

export async function s3CopyRemoteFile(
  sessionId: string,
  remoteSrc: string,
  remoteDest: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = getSession(sessionId)
  if (!session) return { ok: false, error: 'Not connected' }
  try {
    const stat = await s3Stat(sessionId, remoteSrc)
    if (!stat.ok) return { ok: false, error: (stat as { error: string }).error }
    if (stat.stat.isDirectory) return { ok: false, error: 'Use download for folders' }
    const srcKey = uiPathToKey(remoteSrc, session.prefix)
    const destKey = uiPathToKey(remoteDest, session.prefix)
    onProgress?.(0, stat.stat.size)
    await copyObject(session, srcKey, destKey)
    onProgress?.(stat.stat.size, stat.stat.size)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}
