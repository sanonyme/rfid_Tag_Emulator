import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSeenWhatsNewVersion,
  setSeenWhatsNewVersion,
  shouldAutoShowWhatsNew,
  getWhatsNewForDialog,
  WHATS_NEW,
} from '../whats-new'

describe('whats-new', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('auto-shows when no version has been seen yet', () => {
    expect(shouldAutoShowWhatsNew('10.0.0')).toBe(true)
  })

  it('does not auto-show after the current version is marked seen', () => {
    setSeenWhatsNewVersion('10.0.0')
    expect(shouldAutoShowWhatsNew('10.0.0')).toBe(false)
    expect(getSeenWhatsNewVersion()).toBe('10.0.0')
  })

  it('auto-shows again after a version bump', () => {
    setSeenWhatsNewVersion('9.4.2')
    expect(shouldAutoShowWhatsNew('10.0.0')).toBe(true)
  })

  it('puts the current version first in the dialog list', () => {
    const list = getWhatsNewForDialog(WHATS_NEW[0]!.version)
    expect(list[0]?.version).toBe(WHATS_NEW[0]!.version)
    expect(list.length).toBe(WHATS_NEW.length)
  })
})
