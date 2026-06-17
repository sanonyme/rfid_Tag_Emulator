import type { ElectronAPI } from '@/types/electron.d'

function posixJoin(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '') || '/'
  const seg = name.replace(/^\/+/, '')
  if (d === '/') return `/${seg}`.replace(/\/+/g, '/')
  return `${d}/${seg}`.replace(/\/+/g, '/')
}

export type RemoteFileRef = { remotePath: string; relPath: string }

/** Recursively list all files under a remote directory (relative paths from that directory). */
export async function collectRemoteFiles(
  api: ElectronAPI,
  remoteDir: string,
  relativePrefix = '',
): Promise<RemoteFileRef[]> {
  const r = await api.sftpReaddir(remoteDir)
  if (!r.ok) throw new Error(r.error)
  const out: RemoteFileRef[] = []
  for (const entry of r.entries) {
    const childRemote = posixJoin(remoteDir, entry.name)
    const childRel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
    if (entry.type === 'folder') {
      out.push(...(await collectRemoteFiles(api, childRemote, childRel)))
    } else {
      out.push({ remotePath: childRemote, relPath: childRel })
    }
  }
  return out
}
