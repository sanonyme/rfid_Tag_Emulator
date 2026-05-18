import { describe, it, expect } from 'vitest'
import { matchTagListShortcut, type ShortcutEventLike } from '../tag-list-shortcuts'

function ev(partial: Partial<ShortcutEventLike>): ShortcutEventLike {
  return {
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    key: '',
    ...partial,
  }
}

describe('matchTagListShortcut', () => {
  it('returns null without a modifier', () => {
    expect(matchTagListShortcut(ev({ key: 's' }))).toBeNull()
    expect(matchTagListShortcut(ev({ key: 'Enter' }))).toBeNull()
  })

  it('returns null if Alt is held (don\'t steal OS shortcuts)', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, altKey: true, key: 's' }))).toBeNull()
    expect(matchTagListShortcut(ev({ ctrlKey: true, altKey: true, key: 'Enter' }))).toBeNull()
  })

  it('matches Ctrl+S as save-preset', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 's' }))).toBe('save-preset')
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 'S' }))).toBe('save-preset')
  })

  it('matches ⌘+S as save-preset (macOS)', () => {
    expect(matchTagListShortcut(ev({ metaKey: true, key: 's' }))).toBe('save-preset')
  })

  it('matches Ctrl+L as load-preset', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 'l' }))).toBe('load-preset')
  })

  it('matches Ctrl+Enter as send', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 'Enter' }))).toBe('send')
  })

  it('matches Ctrl+Shift+Enter as loop', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, shiftKey: true, key: 'Enter' }))).toBe('loop')
  })

  it('Shift+S with Ctrl is not save-preset (keeps user free to type uppercase)', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, shiftKey: true, key: 'S' }))).toBeNull()
  })

  it('non-mapped keys return null', () => {
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 'k' }))).toBeNull()
    expect(matchTagListShortcut(ev({ ctrlKey: true, key: 'a' }))).toBeNull()
  })
})
