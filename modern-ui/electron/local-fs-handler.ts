import fs from 'fs'
import path from 'path'

export interface LocalListEntry {
  name: string
  type: 'file' | 'folder'
  size?: number
  mtime?: number
  mode?: number
}

/** Resolve `target` and require it to be under `root` (both absolute). */
export function assertPathUnderRoot(root: string, target: string): string | null {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  const normRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  if (resolved !== resolvedRoot && !resolved.startsWith(normRoot)) return null
  return resolved
}

export async function localReaddir(
  root: string,
  dirPath: string,
): Promise<{ ok: true; entries: LocalListEntry[] } | { ok: false; error: string }> {
  const safe = assertPathUnderRoot(root, dirPath)
  if (!safe) return { ok: false, error: 'Path outside local root' }
  try {
    const st = await fs.promises.stat(safe)
    if (!st.isDirectory()) return { ok: false, error: 'Not a directory' }
    const names = await fs.promises.readdir(safe)
    const entries: LocalListEntry[] = []
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = path.join(safe, name)
      try {
        const s = await fs.promises.stat(full)
        entries.push({
          name,
          type: s.isDirectory() ? 'folder' : 'file',
          size: s.isFile() ? s.size : undefined,
          mtime: Math.floor(s.mtimeMs / 1000),
          mode: s.mode,
        })
      } catch {
        /* skip broken symlinks */
      }
    }
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

export function localParentDir(
  root: string,
  cwd: string,
): { ok: true; parent: string | null } | { ok: false; error: string } {
  const safeCwd = assertPathUnderRoot(root, cwd)
  if (!safeCwd) return { ok: false, error: 'Path outside local root' }
  const resolvedRoot = path.resolve(root)
  if (path.resolve(safeCwd) === resolvedRoot) return { ok: true, parent: null }
  const parent = path.dirname(safeCwd)
  const safeParent = assertPathUnderRoot(root, parent)
  if (!safeParent) return { ok: true, parent: resolvedRoot }
  return { ok: true, parent: safeParent }
}

export async function localWriteFileBase64(
  root: string,
  filePath: string,
  base64Data: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const safe = assertPathUnderRoot(root, filePath)
  if (!safe) return { ok: false, error: 'Path outside local root' }
  try {
    let buf: Buffer
    try {
      buf = Buffer.from(base64Data, 'base64')
    } catch {
      return { ok: false, error: 'Invalid base64' }
    }
    await fs.promises.writeFile(safe, buf)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
