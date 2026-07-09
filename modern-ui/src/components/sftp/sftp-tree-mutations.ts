import type { SftpFileNode } from './SftpFileTree'
import { posixJoin } from './sftp-path-utils'

export function setNodeLoading(nodes: SftpFileNode[], target: string, loading: boolean): SftpFileNode[] {
  return nodes.map((n) => {
    if (n.path === target) return { ...n, loading }
    if (Array.isArray(n.children))
      return { ...n, children: setNodeLoading(n.children, target, loading) }
    return n
  })
}

export function setChildrenAtPath(
  nodes: SftpFileNode[],
  target: string,
  children: SftpFileNode[],
): SftpFileNode[] {
  return nodes.map((n) => {
    if (n.path === target) return { ...n, children, loaded: true, loading: false }
    if (Array.isArray(n.children))
      return { ...n, children: setChildrenAtPath(n.children, target, children) }
    return n
  })
}

export function findNode(nodes: SftpFileNode[], path: string): SftpFileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (Array.isArray(n.children)) {
      const f = findNode(n.children, path)
      if (f) return f
    }
  }
  return null
}

export function getDirectChildPaths(nodes: SftpFileNode[], dir: string): string[] {
  if (dir === '/') return nodes.map((n) => n.path)
  const parent = findNode(nodes, dir)
  if (!parent?.children?.length) return []
  return parent.children.map((c) => c.path)
}

/** Reload root and re-fetch children for previously expanded folders. */
export async function rebuildSftpTreeWithExpanded(
  loadDir: (remotePath: string) => Promise<SftpFileNode[]>,
  expandedPaths: ReadonlySet<string>,
): Promise<{ tree: SftpFileNode[]; expandedPaths: Set<string> }> {
  let tree = await loadDir('/')
  const nextExpanded = new Set<string>()

  const paths = [...expandedPaths]
    .filter((p) => p !== '/')
    .sort((a, b) => a.split('/').filter(Boolean).length - b.split('/').filter(Boolean).length)

  for (const targetPath of paths) {
    const segments = targetPath.split('/').filter(Boolean)
    let parentPath = '/'
    let reached = true

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      const fullPath = posixJoin(parentPath, segment)

      if (parentPath !== '/') {
        const parentNode = findNode(tree, parentPath)
        if (!parentNode?.loaded) {
          try {
            tree = setChildrenAtPath(tree, parentPath, await loadDir(parentPath))
            nextExpanded.add(parentPath)
          } catch {
            reached = false
            break
          }
        } else {
          nextExpanded.add(parentPath)
        }
      }

      const siblings = parentPath === '/' ? tree : findNode(tree, parentPath)?.children
      const folder = siblings?.find((n) => n.name === segment)
      if (!folder || folder.type !== 'folder') {
        reached = false
        break
      }

      const isTarget = i === segments.length - 1
      if (isTarget || !folder.loaded) {
        try {
          tree = setChildrenAtPath(tree, fullPath, await loadDir(fullPath))
          nextExpanded.add(fullPath)
        } catch {
          reached = false
          break
        }
      } else {
        nextExpanded.add(fullPath)
      }

      parentPath = fullPath
    }

    if (!reached) {
      nextExpanded.delete(targetPath)
    }
  }

  return { tree, expandedPaths: nextExpanded }
}
