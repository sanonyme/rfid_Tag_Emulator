import { describe, expect, it } from 'vitest'
import type { SftpFileNode } from '../SftpFileTree'
import {
  collectSubtreePaths,
  findNode,
  isPathUnderFolder,
  rebuildSftpTreeWithExpanded,
} from '../sftp-tree-mutations'

function folder(path: string, name: string, children?: SftpFileNode[]): SftpFileNode {
  return {
    path,
    name,
    type: 'folder',
    loaded: children !== undefined,
    children,
  }
}

function file(path: string, name: string): SftpFileNode {
  return { path, name, type: 'file', loaded: true }
}

describe('collectSubtreePaths', () => {
  it('includes the folder and every nested child', () => {
    const root = folder('/docs', 'docs', [
      file('/docs/a.txt', 'a.txt'),
      folder('/docs/sub', 'sub', [file('/docs/sub/b.txt', 'b.txt')]),
    ])
    expect(collectSubtreePaths(root)).toEqual([
      '/docs',
      '/docs/a.txt',
      '/docs/sub',
      '/docs/sub/b.txt',
    ])
  })

  it('detects paths under a folder', () => {
    expect(isPathUnderFolder('/docs', '/docs/a.txt')).toBe(true)
    expect(isPathUnderFolder('/docs', '/docs')).toBe(false)
    expect(isPathUnderFolder('/', '/readme.txt')).toBe(true)
    expect(isPathUnderFolder('/', '/')).toBe(false)
  })
})

describe('rebuildSftpTreeWithExpanded', () => {
  it('reloads children for expanded folders after a root refresh', async () => {
    const loadDir = async (remotePath: string): Promise<SftpFileNode[]> => {
      if (remotePath === '/') {
        return [folder('/alpha', 'alpha'), file('/readme.txt', 'readme.txt')]
      }
      if (remotePath === '/alpha') {
        return [file('/alpha/one.txt', 'one.txt')]
      }
      throw new Error(`unexpected path: ${remotePath}`)
    }

    const { tree, expandedPaths } = await rebuildSftpTreeWithExpanded(
      loadDir,
      new Set(['/alpha']),
    )

    const alpha = findNode(tree, '/alpha')
    expect(alpha?.loaded).toBe(true)
    expect(alpha?.children).toHaveLength(1)
    expect(expandedPaths.has('/alpha')).toBe(true)
  })

  it('drops expansion for folders that no longer exist', async () => {
    const loadDir = async (remotePath: string): Promise<SftpFileNode[]> => {
      if (remotePath === '/') return [file('/readme.txt', 'readme.txt')]
      throw new Error(`unexpected path: ${remotePath}`)
    }

    const { expandedPaths } = await rebuildSftpTreeWithExpanded(
      loadDir,
      new Set(['/missing']),
    )

    expect(expandedPaths.has('/missing')).toBe(false)
  })
})
