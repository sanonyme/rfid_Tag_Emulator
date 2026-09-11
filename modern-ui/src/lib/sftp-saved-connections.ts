export const SAVED_CONNECTIONS_KEY = 'sftp-saved-connections'
export const MAX_SAVED_CONNECTIONS = 40
export const MAX_RECENT_CONNECTIONS = 8

export type SavedSftpConnection = {
  id: string
  name: string
  protocol: 'sftp'
  host: string
  port: string
  user: string
  pass: string
  privateKeyPath?: string
  passphrase?: string
  updatedAt: number
  pinned: boolean
}

export type SavedFtpConnection = {
  id: string
  name: string
  protocol: 'ftp'
  host: string
  port: string
  user: string
  pass: string
  secure: 'off' | 'explicit' | 'implicit'
  updatedAt: number
  pinned: boolean
}

export type SavedS3Connection = {
  id: string
  name: string
  protocol: 's3' | 's3compat'
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  prefix?: string
  endpoint?: string
  assumeRole?: boolean
  roleArn?: string
  roleSessionName?: string
  externalId?: string
  sourceIdentity?: string
  updatedAt: number
  pinned: boolean
}

export type SavedExplorerConnection = SavedSftpConnection | SavedFtpConnection | SavedS3Connection
export type SavedSftpDraft = Omit<SavedSftpConnection, 'id' | 'updatedAt' | 'pinned'> & { pinned?: boolean }
export type SavedFtpDraft = Omit<SavedFtpConnection, 'id' | 'updatedAt' | 'pinned'> & { pinned?: boolean }
export type SavedS3Draft = Omit<SavedS3Connection, 'id' | 'updatedAt' | 'pinned'> & { pinned?: boolean }
export type SavedConnectionDraft = SavedSftpDraft | SavedFtpDraft | SavedS3Draft
export type ExplorerProtocol = SavedExplorerConnection['protocol']

export function isObjectStoreProtocol(p: ExplorerProtocol): p is 's3' | 's3compat' {
  return p === 's3' || p === 's3compat'
}

export function isObjectStoreConnection(
  c: SavedExplorerConnection | SavedConnectionDraft,
): c is Extract<SavedExplorerConnection | SavedConnectionDraft, { protocol: 's3' | 's3compat' }> {
  return isObjectStoreProtocol(c.protocol)
}

export function protocolShortLabel(p: ExplorerProtocol): string {
  if (p === 's3') return 'S3'
  if (p === 's3compat') return 'S3-compatible'
  if (p === 'ftp') return 'FTP'
  return 'SFTP'
}

export type LegacySftpCreds = {
  host?: string
  port?: string
  user?: string
  pass?: string
}

export type LegacyS3Creds = {
  bucket?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  prefix?: string
  endpoint?: string
  assumeRole?: boolean
  roleArn?: string
  roleSessionName?: string
  externalId?: string
  sourceIdentity?: string
}

type StoreApi = {
  safeStoreGet?: (key: string) => Promise<string | null>
  safeStoreSet?: (key: string, value: string) => Promise<boolean>
}

function newId(): string {
  return crypto.randomUUID()
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBool(value: unknown): boolean {
  return value === true
}

export function defaultConnectionName(c: SavedExplorerConnection | SavedConnectionDraft): string {
  if (isObjectStoreConnection(c)) {
    const bucket = c.bucket.trim() || 'bucket'
    const prefix = (c.prefix ?? '').trim().replace(/^\/+|\/+$/g, '')
    return prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`
  }
  const host = c.host.trim() || 'host'
  const defaultPort = c.protocol === 'ftp' ? '21' : '22'
  const port = (c.port || defaultPort).trim()
  const user = c.user.trim()
  const hostPort = port && port !== defaultPort ? `${host}:${port}` : host
  return user ? `${user}@${hostPort}` : hostPort
}

export function nameFitsProtocol(name: string, protocol: ExplorerProtocol): boolean {
  const n = name.trim()
  if (!n) return false
  if (isObjectStoreProtocol(protocol)) return !/@/.test(n) || /^s3:\/\//i.test(n)
  return !/^s3:\/\//i.test(n)
}

export function resolvedConnectionName(
  c: SavedExplorerConnection | SavedConnectionDraft,
  preferred?: string,
): string {
  const candidate = (preferred ?? c.name).trim()
  if (candidate && nameFitsProtocol(candidate, c.protocol)) return candidate
  return defaultConnectionName(c)
}

export function connectionIdentity(c: SavedExplorerConnection | SavedConnectionDraft): string {
  if (isObjectStoreConnection(c)) {
    const role = (c.assumeRole ? c.roleArn : '')?.trim() || ''
    const endpoint = (c.endpoint ?? '').trim().toLowerCase()
    return `${c.protocol}|${c.bucket.trim().toLowerCase()}|${c.accessKeyId.trim()}|${role}|${endpoint}`
  }
  const defaultPort = c.protocol === 'ftp' ? '21' : '22'
  const port = (c.port || defaultPort).trim() || defaultPort
  return `${c.protocol}|${c.host.trim().toLowerCase()}|${port}|${c.user.trim()}`
}

export function connectionSubtitle(c: SavedExplorerConnection): string {
  if (isObjectStoreConnection(c)) {
    if (c.protocol === 's3compat') {
      try {
        const host = c.endpoint ? new URL(c.endpoint).host : ''
        return host || c.endpoint?.trim() || 'custom endpoint'
      } catch {
        return c.endpoint?.trim() || 'custom endpoint'
      }
    }
    const region = c.region.trim() || 'region'
    const role = c.assumeRole && c.roleArn?.trim() ? ' · assume role' : ''
    return `${c.region ? region : 's3'}${role}`
  }
  const defaultPort = c.protocol === 'ftp' ? '21' : '22'
  const port = (c.port || defaultPort).trim() || defaultPort
  const extra = c.protocol === 'ftp' && c.secure !== 'off' ? ` · ${c.secure === 'implicit' ? 'FTPS implicit' : 'FTPS'}` : ''
  return `${c.host}:${port}${extra}`
}

function parseSftp(raw: Record<string, unknown>): SavedSftpConnection | null {
  const host = asString(raw.host).trim()
  const user = asString(raw.user).trim()
  if (!host || !user) return null
  const port = asString(raw.port).trim() || '22'
  const name = asString(raw.name).trim()
  const privateKeyPath = asString(raw.privateKeyPath).trim() || undefined
  const passphrase = asString(raw.passphrase) || undefined
  const conn: SavedSftpConnection = {
    id: asString(raw.id).trim() || newId(),
    name: resolvedConnectionName({ protocol: 'sftp', name, host, port, user, pass: '' }),
    protocol: 'sftp',
    host,
    port,
    user,
    pass: asString(raw.pass),
    privateKeyPath,
    passphrase,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    pinned: asBool(raw.pinned),
  }
  return conn
}

function parseFtpSecure(value: unknown): 'off' | 'explicit' | 'implicit' {
  if (value === 'explicit' || value === 'implicit' || value === 'off') return value
  if (value === true || value === 'true') return 'explicit'
  return 'off'
}

function parseFtp(raw: Record<string, unknown>): SavedFtpConnection | null {
  const host = asString(raw.host).trim()
  const user = asString(raw.user).trim()
  if (!host || !user) return null
  const port = asString(raw.port).trim() || '21'
  const name = asString(raw.name).trim()
  const conn: SavedFtpConnection = {
    id: asString(raw.id).trim() || newId(),
    name: resolvedConnectionName({ protocol: 'ftp', name, host, port, user, pass: '', secure: 'off' }),
    protocol: 'ftp',
    host,
    port,
    user,
    pass: asString(raw.pass),
    secure: parseFtpSecure(raw.secure),
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    pinned: asBool(raw.pinned),
  }
  return conn
}

function parseS3(raw: Record<string, unknown>): SavedS3Connection | null {
  const bucket = asString(raw.bucket).trim()
  const accessKeyId = asString(raw.accessKeyId).trim()
  const secretAccessKey = asString(raw.secretAccessKey)
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  const protocol: 's3' | 's3compat' = raw.protocol === 's3compat' ? 's3compat' : 's3'
  const endpoint = asString(raw.endpoint).trim() || undefined
  if (protocol === 's3compat' && !endpoint) return null
  const region = asString(raw.region).trim() || 'us-east-1'
  const assumeRole = protocol === 's3compat' ? false : asBool(raw.assumeRole) || Boolean(asString(raw.roleArn).trim())
  const name = asString(raw.name).trim()
  const conn: SavedS3Connection = {
    id: asString(raw.id).trim() || newId(),
    name: resolvedConnectionName({
      protocol,
      name,
      bucket,
      region: 'us-east-1',
      accessKeyId: accessKeyId,
      secretAccessKey: '',
      prefix: asString(raw.prefix),
    }),
    protocol,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: asString(raw.sessionToken) || undefined,
    prefix: asString(raw.prefix) || undefined,
    endpoint,
    assumeRole,
    roleArn: assumeRole ? asString(raw.roleArn) || undefined : undefined,
    roleSessionName: assumeRole ? asString(raw.roleSessionName) || undefined : undefined,
    externalId: assumeRole ? asString(raw.externalId) || undefined : undefined,
    sourceIdentity: assumeRole ? asString(raw.sourceIdentity) || undefined : undefined,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    pinned: asBool(raw.pinned),
  }
  return conn
}

export function parseSavedConnections(raw: string | null | undefined): SavedExplorerConnection[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const items = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { connections?: unknown }).connections)
      ? (parsed as { connections: unknown[] }).connections
      : []
    const out: SavedExplorerConnection[] = []
    const seen = new Set<string>()
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const conn =
        rec.protocol === 's3' || rec.protocol === 's3compat'
          ? parseS3(rec)
          : rec.protocol === 'ftp'
            ? parseFtp(rec)
            : rec.protocol === 'sftp'
              ? parseSftp(rec)
              : null
      if (!conn) continue
      const key = connectionIdentity(conn)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(conn)
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt)
    return pruneConnectionList(out)
  } catch {
    return []
  }
}

export function pruneConnectionList(list: SavedExplorerConnection[]): SavedExplorerConnection[] {
  const saved = list.filter((c) => c.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_CONNECTIONS)
  const recents = list.filter((c) => !c.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECENT_CONNECTIONS)
  return [...saved, ...recents]
}

export function partitionConnections(list: SavedExplorerConnection[]): {
  saved: SavedExplorerConnection[]
  recents: SavedExplorerConnection[]
} {
  return {
    saved: list.filter((c) => c.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
    recents: list.filter((c) => !c.pinned).sort((a, b) => b.updatedAt - a.updatedAt),
  }
}

export function upsertSavedConnection(
  list: SavedExplorerConnection[],
  incoming: SavedConnectionDraft & { id?: string; updatedAt?: number },
): SavedExplorerConnection[] {
  const identity = connectionIdentity(incoming)
  const existing = list.find((c) => c.id === incoming.id || connectionIdentity(c) === identity)
  const now = incoming.updatedAt ?? Date.now()
  const name = resolvedConnectionName(incoming, incoming.name.trim() || existing?.name)
  const pinned = existing?.pinned === true || incoming.pinned === true
  const next: SavedExplorerConnection =
    incoming.protocol === 's3' || incoming.protocol === 's3compat'
      ? {
          ...(incoming as Omit<SavedS3Connection, 'id' | 'updatedAt' | 'name' | 'pinned'>),
          protocol: incoming.protocol,
          id: existing?.id ?? incoming.id ?? newId(),
          name,
          updatedAt: now,
          pinned,
        }
      : incoming.protocol === 'ftp'
        ? {
            ...(incoming as Omit<SavedFtpConnection, 'id' | 'updatedAt' | 'name' | 'pinned'>),
            protocol: 'ftp',
            id: existing?.id ?? incoming.id ?? newId(),
            name,
            updatedAt: now,
            pinned,
          }
        : {
            ...(incoming as Omit<SavedSftpConnection, 'id' | 'updatedAt' | 'name' | 'pinned'>),
            protocol: 'sftp',
            id: existing?.id ?? incoming.id ?? newId(),
            name,
            updatedAt: now,
            pinned,
          }
  const without = list.filter((c) => c.id !== next.id && connectionIdentity(c) !== identity)
  return pruneConnectionList([next, ...without])
}

export function removeSavedConnection(list: SavedExplorerConnection[], id: string): SavedExplorerConnection[] {
  return list.filter((c) => c.id !== id)
}

export function migrateLegacyIntoSaved(
  list: SavedExplorerConnection[],
  legacy: { sftp?: LegacySftpCreds | null; s3?: LegacyS3Creds | null },
): SavedExplorerConnection[] {
  let next = list
  const sftp = legacy.sftp
  if (sftp?.host?.trim() && sftp.user?.trim()) {
    const draft: SavedSftpDraft = {
      protocol: 'sftp',
      name: '',
      host: sftp.host.trim(),
      port: (sftp.port || '22').trim() || '22',
      user: sftp.user.trim(),
      pass: sftp.pass ?? '',
    }
    if (!next.some((c) => connectionIdentity(c) === connectionIdentity(draft))) {
      next = upsertSavedConnection(next, { ...draft, pinned: false, updatedAt: 1 })
    }
  }
  const s3 = legacy.s3
  if (s3?.bucket?.trim() && s3.accessKeyId?.trim() && s3.secretAccessKey) {
    const draft: SavedS3Draft = {
      protocol: 's3',
      name: '',
      bucket: s3.bucket.trim(),
      region: (s3.region || 'us-east-1').trim() || 'us-east-1',
      accessKeyId: s3.accessKeyId.trim(),
      secretAccessKey: s3.secretAccessKey,
      sessionToken: s3.sessionToken,
      prefix: s3.prefix,
      endpoint: s3.endpoint,
      assumeRole: s3.assumeRole === true || Boolean(s3.roleArn),
      roleArn: s3.roleArn,
      roleSessionName: s3.roleSessionName,
      externalId: s3.externalId,
      sourceIdentity: s3.sourceIdentity,
    }
    if (!next.some((c) => connectionIdentity(c) === connectionIdentity(draft))) {
      next = upsertSavedConnection(next, { ...draft, pinned: false, updatedAt: 1 })
    }
  }
  return next
}

async function readKey(api: StoreApi | undefined, key: string): Promise<string | null> {
  try {
    if (api?.safeStoreGet) {
      const raw = await api.safeStoreGet(key)
      if (raw) return raw
    }
  } catch {
    /* fall through */
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function loadSavedConnections(api?: StoreApi): Promise<SavedExplorerConnection[]> {
  const raw = await readKey(api, SAVED_CONNECTIONS_KEY)
  let list = parseSavedConnections(raw)
  let sftp: LegacySftpCreds | null = null
  let s3: LegacyS3Creds | null = null
  try {
    const sftpRaw = await readKey(api, 'sftp-creds')
    if (sftpRaw) sftp = JSON.parse(sftpRaw) as LegacySftpCreds
  } catch {
    sftp = null
  }
  try {
    const s3Raw = await readKey(api, 's3-creds')
    if (s3Raw) s3 = JSON.parse(s3Raw) as LegacyS3Creds
  } catch {
    s3 = null
  }
  const migrated = migrateLegacyIntoSaved(list, { sftp, s3 })
  if (migrated.length !== list.length) {
    await persistSavedConnections(migrated, api)
  }
  return migrated
}

export async function persistSavedConnections(list: SavedExplorerConnection[], api?: StoreApi): Promise<void> {
  const payload = JSON.stringify(list)
  try {
    if (api?.safeStoreSet) {
      await api.safeStoreSet(SAVED_CONNECTIONS_KEY, payload)
      try {
        localStorage.removeItem(SAVED_CONNECTIONS_KEY)
      } catch {
        /* ignore */
      }
      return
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(SAVED_CONNECTIONS_KEY, payload)
  } catch {
    /* ignore */
  }
}
