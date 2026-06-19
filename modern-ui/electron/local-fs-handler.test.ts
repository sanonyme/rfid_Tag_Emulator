// @vitest-environment node
import path from 'path'
import { describe, it, expect } from 'vitest'
import { assertPathUnderRoot } from './local-fs-handler.js'

describe('assertPathUnderRoot', () => {
  const root = path.resolve('C:/browse/root')

  it('allows paths inside root', () => {
    const child = path.join(root, 'subdir', 'file.txt')
    expect(assertPathUnderRoot(root, child)).toBe(path.resolve(child))
    expect(assertPathUnderRoot(root, root)).toBe(path.resolve(root))
  })

  it('rejects paths outside root', () => {
    expect(assertPathUnderRoot(root, 'C:/other/file.txt')).toBeNull()
    expect(assertPathUnderRoot(root, path.join(root, '..', 'escape.txt'))).toBeNull()
  })
})
