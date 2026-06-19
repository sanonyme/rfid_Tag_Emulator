import type { SftpFileNode } from './SftpFileTree'

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
