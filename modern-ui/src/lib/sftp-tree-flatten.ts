import type { SftpFileNode, SftpSortKey } from '@/components/sftp/SftpFileTree'

export type FlatSftpRow = {
  node: SftpFileNode
  depth: number
}

function sortChildren(
  nodes: SftpFileNode[],
  sortKey: SftpSortKey,
  sortDir: 'asc' | 'desc',
  foldersFirst: boolean,
): SftpFileNode[] {
  const mul = sortDir === 'asc' ? 1 : -1
  return [...nodes].sort((a, b) => {
    if (foldersFirst && a.type !== b.type) return a.type === 'folder' ? -1 : 1
    let c = 0
    switch (sortKey) {
      case 'name':
        c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        break
      case 'size':
        c = (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)
        break
      case 'mtime':
        c = (a.mtimeSec ?? 0) - (b.mtimeSec ?? 0)
        break
      case 'mode':
        c = (a.mode ?? 0) - (b.mode ?? 0)
        break
      case 'owner':
        c = String(a.uid ?? '').localeCompare(String(b.uid ?? ''))
        if (c === 0) c = String(a.gid ?? '').localeCompare(String(b.gid ?? ''))
        break
    }
    return c * mul
  })
}

/** Flatten expanded SFTP tree into visible rows for virtual scrolling. */
export function flattenVisibleSftpRows(
  nodes: SftpFileNode[],
  expandedPaths: ReadonlySet<string>,
  sortKey: SftpSortKey,
  sortDir: 'asc' | 'desc',
  foldersFirst: boolean,
): FlatSftpRow[] {
  const out: FlatSftpRow[] = []

  const walk = (list: SftpFileNode[], depth: number) => {
    for (const node of sortChildren(list, sortKey, sortDir, foldersFirst)) {
      out.push({ node, depth })
      if (node.type === 'folder' && expandedPaths.has(node.path)) {
        if (!node.loaded && !node.loading) continue
        if (node.loading && (!node.children || node.children.length === 0)) {
          continue
        }
        if (node.children?.length) walk(node.children, depth + 1)
      }
    }
  }

  walk(nodes, 0)
  return out
}
