import { describe, expect, it } from 'vitest'
import {
  keyToUiPath,
  normalizeS3Prefix,
  s3CopySource,
  uiDirToPrefix,
  uiPathToKey,
  uiPathToRelative,
} from '../s3-path'

describe('normalizeS3Prefix', () => {
  it('returns empty for blank input', () => {
    expect(normalizeS3Prefix('')).toBe('')
    expect(normalizeS3Prefix('  /  ')).toBe('')
  })

  it('forces a trailing slash and strips extras', () => {
    expect(normalizeS3Prefix('/exports//edge')).toBe('exports/edge/')
    expect(normalizeS3Prefix('exports/edge/')).toBe('exports/edge/')
  })
})

describe('UI path mapping', () => {
  it('maps bucket-root files and folders', () => {
    expect(uiPathToRelative('/')).toBe('')
    expect(uiPathToKey('/orders.csv', '')).toBe('orders.csv')
    expect(uiDirToPrefix('/', '')).toBe('')
    expect(uiDirToPrefix('/inbox', '')).toBe('inbox/')
  })

  it('nests under an optional prefix', () => {
    expect(uiPathToKey('/a/b.txt', 'exports')).toBe('exports/a/b.txt')
    expect(uiDirToPrefix('/a', 'exports')).toBe('exports/a/')
    expect(uiDirToPrefix('/', 'exports')).toBe('exports/')
  })

  it('round-trips keys back to UI paths', () => {
    expect(keyToUiPath('exports/a/b.txt', 'exports')).toBe('/a/b.txt')
    expect(keyToUiPath('exports/', 'exports')).toBe('/')
    expect(keyToUiPath('orders.csv', '')).toBe('/orders.csv')
  })
})

describe('s3CopySource', () => {
  it('encodes each key segment', () => {
    expect(s3CopySource('my-bucket', 'a/b c.txt')).toBe('my-bucket/a/b%20c.txt')
  })
})
