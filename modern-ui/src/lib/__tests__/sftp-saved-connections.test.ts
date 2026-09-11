import { afterEach, describe, expect, it } from 'vitest'
import {
  connectionIdentity,
  connectionSubtitle,
  defaultConnectionName,
  LEGACY_SFTP_CREDS_KEY,
  loadSavedConnections,
  migrateLegacyIntoSaved,
  mutateSavedConnections,
  parseSavedConnections,
  removeSavedConnection,
  resetSavedConnectionsCache,
  resolvedConnectionName,
  SAVED_CONNECTIONS_KEY,
  upsertSavedConnection,
  partitionConnections,
  type SavedS3Connection,
  type SavedSftpConnection,
  type SavedFtpConnection,
} from '../sftp-saved-connections'

const sftp = (over: Partial<SavedSftpConnection> = {}): SavedSftpConnection => ({
  id: 'sftp-1',
  name: 'Edge prod',
  protocol: 'sftp',
  host: '10.0.0.8',
  port: '22',
  user: 'reader',
  pass: 'secret',
  updatedAt: 100,
  pinned: false,
  ...over,
})

const s3 = (over: Partial<SavedS3Connection> = {}): SavedS3Connection => ({
  id: 's3-1',
  name: 'Alo Yoga',
  protocol: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secret',
  assumeRole: true,
  roleArn: 'arn:aws:iam::1:role/demo',
  roleSessionName: 'zeus-s3',
  externalId: 'ext',
  updatedAt: 200,
  pinned: false,
  ...over,
})

describe('defaultConnectionName', () => {
  it('formats sftp as user@host, omitting port 22', () => {
    expect(defaultConnectionName(sftp())).toBe('reader@10.0.0.8')
    expect(defaultConnectionName(sftp({ port: '2222' }))).toBe('reader@10.0.0.8:2222')
  })

  it('formats s3 as s3://bucket[/prefix]', () => {
    expect(defaultConnectionName(s3())).toBe('s3://my-bucket')
    expect(defaultConnectionName(s3({ prefix: 'exports/edge' }))).toBe('s3://my-bucket/exports/edge')
  })
})

describe('resolvedConnectionName', () => {
  it('does not keep an sftp user@host label on an s3 connection', () => {
    expect(resolvedConnectionName(s3({ name: 'root@172.16.0.91' }))).toBe('s3://my-bucket')
  })

  it('keeps a custom s3 label', () => {
    expect(resolvedConnectionName(s3({ name: 'Alo Yoga' }))).toBe('Alo Yoga')
  })
})

describe('connectionIdentity', () => {
  it('treats sftp host as case-insensitive and keeps user', () => {
    expect(connectionIdentity(sftp({ host: 'EDGE.local' }))).toBe(
      connectionIdentity(sftp({ host: 'edge.local' })),
    )
  })

  it('separates s3 roles on the same bucket and key', () => {
    expect(connectionIdentity(s3())).not.toBe(connectionIdentity(s3({ assumeRole: false, roleArn: '' })))
  })

  it('separates ftp from sftp on the same host', () => {
    const ftpConn: SavedFtpConnection = {
      id: 'ftp-1',
      name: 'Drop',
      protocol: 'ftp',
      host: '10.0.0.8',
      port: '21',
      user: 'reader',
      pass: 'secret',
      secure: 'off',
      updatedAt: 50,
      pinned: false,
    }
    expect(connectionIdentity(ftpConn)).not.toBe(connectionIdentity(sftp()))
    expect(connectionIdentity(ftpConn)).toContain('ftp|')
  })

  it('includes custom endpoint for s3-compatible identities', () => {
    const minio = s3({ protocol: 's3compat', endpoint: 'https://minio.local', assumeRole: false, roleArn: '' })
    expect(connectionIdentity(minio)).toContain('s3compat|')
    expect(connectionIdentity(minio)).not.toBe(connectionIdentity(s3()))
  })
})

describe('parseSavedConnections', () => {
  it('returns [] for empty or invalid JSON', () => {
    expect(parseSavedConnections(null)).toEqual([])
    expect(parseSavedConnections('nope')).toEqual([])
    expect(parseSavedConnections('{}')).toEqual([])
  })

  it('keeps valid mixed connections and drops incomplete ones', () => {
    const parsed = parseSavedConnections(
      JSON.stringify([
        sftp(),
        s3(),
        { protocol: 'sftp', host: 'x' },
        { protocol: 's3', bucket: 'b' },
        { protocol: 'ftp', host: 'ftp.example', user: 'u', pass: 'p' },
        { protocol: 's3compat', bucket: 'b', accessKeyId: 'k' },
      ]),
    )
    expect(parsed.map((c) => c.protocol).sort()).toEqual(['ftp', 's3', 'sftp'])
  })

  it('parses s3-compatible when endpoint is present', () => {
    const parsed = parseSavedConnections(
      JSON.stringify([
        {
          protocol: 's3compat',
          bucket: 'local',
          region: 'us-east-1',
          accessKeyId: 'minio',
          secretAccessKey: 'minio123',
          endpoint: 'http://127.0.0.1:9000',
          updatedAt: 3,
        },
      ]),
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.protocol).toBe('s3compat')
    expect(connectionSubtitle(parsed[0]!)).toContain('127.0.0.1')
  })

  it('sorts most recently updated first', () => {
    const parsed = parseSavedConnections(JSON.stringify([sftp({ updatedAt: 1 }), s3({ updatedAt: 9 })]))
    expect(parsed[0]?.protocol).toBe('s3')
  })
})

describe('upsertSavedConnection', () => {
  it('inserts a new connection at the front', () => {
    const next = upsertSavedConnection([sftp()], s3({ id: 's3-new', updatedAt: 500 }))
    expect(next[0]?.id).toBe('s3-new')
    expect(next).toHaveLength(2)
  })

  it('updates the same sftp host/user instead of duplicating', () => {
    const next = upsertSavedConnection(
      [sftp()],
      { ...sftp({ pass: 'new-pass', name: 'Renamed', updatedAt: 300 }), id: undefined },
    )
    expect(next).toHaveLength(1)
    expect(next[0]?.protocol === 'sftp' && next[0].pass).toBe('new-pass')
    expect(next[0]?.name).toBe('Renamed')
    expect(next[0]?.id).toBe('sftp-1')
  })

  it('keeps the previous name when the incoming name is blank', () => {
    const next = upsertSavedConnection([sftp()], { ...sftp(), name: '  ', updatedAt: 400 })
    expect(next[0]?.name).toBe('Edge prod')
  })

  it('does not demote a saved connection when recording a recent connect', () => {
    const pinned = sftp({ pinned: true })
    const next = upsertSavedConnection([pinned], { ...pinned, pinned: false, pass: 'newer', updatedAt: 500 })
    expect(next).toHaveLength(1)
    expect(next[0]?.pinned).toBe(true)
    expect(next[0]?.protocol === 'sftp' && next[0].pass).toBe('newer')
  })

  it('pins a recent connection when saved', () => {
    const next = upsertSavedConnection([sftp({ pinned: false })], { ...sftp(), pinned: true, updatedAt: 500 })
    expect(next[0]?.pinned).toBe(true)
    expect(partitionConnections(next).saved).toHaveLength(1)
    expect(partitionConnections(next).recents).toHaveLength(0)
  })
})

describe('removeSavedConnection', () => {
  it('removes by id', () => {
    expect(removeSavedConnection([sftp(), s3()], 'sftp-1').map((c) => c.id)).toEqual(['s3-1'])
  })
})

describe('migrateLegacyIntoSaved', () => {
  it('imports last-used sftp and s3 creds when the list is empty', () => {
    const next = migrateLegacyIntoSaved([], {
      sftp: { host: '1.2.3.4', port: '22', user: 'u', pass: 'p' },
      s3: { bucket: 'b', region: 'eu-west-1', accessKeyId: 'k', secretAccessKey: 's' },
    })
    expect(next).toHaveLength(2)
    expect(next.every((c) => c.pinned === false)).toBe(true)
    expect(next.some((c) => c.protocol === 'sftp' && c.host === '1.2.3.4')).toBe(true)
    expect(next.some((c) => c.protocol === 's3' && c.bucket === 'b')).toBe(true)
  })

  it('does not overwrite an already saved matching connection', () => {
    const existing = sftp({ host: '1.2.3.4', user: 'u', pass: 'kept', updatedAt: 999 })
    const next = migrateLegacyIntoSaved([existing], {
      sftp: { host: '1.2.3.4', user: 'u', pass: 'legacy' },
    })
    expect(next).toHaveLength(1)
    expect(next[0]?.protocol === 'sftp' && next[0].pass).toBe('kept')
    expect(next[0]?.updatedAt).toBe(999)
  })
})

describe('connectionSubtitle', () => {
  it('shows host:port and s3 region', () => {
    expect(connectionSubtitle(sftp())).toBe('10.0.0.8:22')
    expect(connectionSubtitle(s3())).toContain('us-east-1')
    expect(connectionSubtitle(s3())).toContain('assume role')
  })
})

function memoryStore(initial: Record<string, string | null> = {}) {
  const data = new Map<string, string>(
    Object.entries(initial).filter((entry): entry is [string, string] => entry[1] != null),
  )
  return {
    safeStoreGet: async (key: string) => data.get(key) ?? null,
    safeStoreSet: async (key: string, value: string) => {
      data.set(key, value)
      return true
    },
    safeStoreDelete: async (key: string) => {
      data.delete(key)
    },
    data,
  }
}

describe('shared saved-connection store', () => {
  afterEach(() => {
    resetSavedConnectionsCache()
  })

  it('does not resurrect a deleted connection from leftover sftp-creds', async () => {
    const api = memoryStore({
      [SAVED_CONNECTIONS_KEY]: JSON.stringify([sftp({ pinned: true })]),
      [LEGACY_SFTP_CREDS_KEY]: JSON.stringify({ host: '10.0.0.8', user: 'reader', pass: 'legacy' }),
    })
    await loadSavedConnections(api)
    await mutateSavedConnections((list) => removeSavedConnection(list, 'sftp-1'), api)
    resetSavedConnectionsCache()
    const again = await loadSavedConnections(api)
    expect(again.map((c) => c.id)).toEqual([])
    expect(api.data.has(LEGACY_SFTP_CREDS_KEY)).toBe(false)
  })

  it('serializes a delete ahead of an upsert so the deleted row stays gone', async () => {
    const api = memoryStore({
      [SAVED_CONNECTIONS_KEY]: JSON.stringify([sftp({ pinned: true }), s3({ pinned: true })]),
    })
    await loadSavedConnections(api)
    const deleteP = mutateSavedConnections((list) => removeSavedConnection(list, 'sftp-1'), api)
    const upsertP = mutateSavedConnections(
      (list) => upsertSavedConnection(list, { ...s3(), name: 'Renamed S3', updatedAt: 900 }),
      api,
    )
    await Promise.all([deleteP, upsertP])
    resetSavedConnectionsCache()
    const again = await loadSavedConnections(api)
    expect(again.map((c) => c.id).sort()).toEqual(['s3-1'])
    expect(again[0]?.name).toBe('Renamed S3')
  })
})
