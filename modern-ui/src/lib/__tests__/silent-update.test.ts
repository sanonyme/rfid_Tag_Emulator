import { describe, expect, it } from 'vitest'
import { decorateUpdateInfo, isSilentUpdateInfo, SILENT_UPDATE_MARKER } from '../silent-update'

describe('silent-update', () => {
  it('detects silent releases via hidden HTML comment marker, [silent] tag, or explicit flag', () => {
    expect(
      isSilentUpdateInfo({
        version: '10.4.1',
        releaseNotes: `${SILENT_UPDATE_MARKER}\nMinor background patch.`,
      }),
    ).toBe(true)

    expect(
      isSilentUpdateInfo({
        version: '10.4.1',
        releaseName: 'v10.4.1 [silent]',
      }),
    ).toBe(true)

    expect(
      isSilentUpdateInfo({
        version: '10.4.1',
        releaseNotes: [{ note: 'Cleanup' }, { note: 'Applied [SILENT] patch' }],
      }),
    ).toBe(true)

    expect(isSilentUpdateInfo({ version: '10.4.1', silent: true })).toBe(true)
  })

  it('returns false for standard user-facing releases or empty payloads', () => {
    expect(isSilentUpdateInfo(null)).toBe(false)
    expect(isSilentUpdateInfo(undefined)).toBe(false)
    expect(
      isSilentUpdateInfo({
        version: '10.5.0',
        releaseName: 'v10.5.0',
        releaseNotes: 'Major feature release with release notes.',
      }),
    ).toBe(false)
  })

  it('decorates update info with silent and manual flags', () => {
    const decorated = decorateUpdateInfo(
      { version: '10.4.1', releaseNotes: SILENT_UPDATE_MARKER },
      { silent: true, manual: false },
    )
    expect(decorated.version).toBe('10.4.1')
    expect(decorated.silent).toBe(true)
    expect(decorated.manual).toBe(false)
  })
})
