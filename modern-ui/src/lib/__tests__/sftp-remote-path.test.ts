import { describe, it, expect } from 'vitest'
import { normalizeRemotePath } from '../sftp-remote-path'

describe('normalizeRemotePath', () => {
  it('normalizes empty to root', () => {
    expect(normalizeRemotePath('')).toBe('/')
    expect(normalizeRemotePath('.')).toBe('/')
  })

  it('collapses duplicate slashes and resolves parent segments', () => {
    expect(normalizeRemotePath('/foo//bar/../baz')).toBe('/foo/baz')
  })

  it('adds leading slash for relative paths', () => {
    expect(normalizeRemotePath('var/log')).toBe('/var/log')
  })
})
