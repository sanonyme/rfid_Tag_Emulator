export const SILENT_UPDATE_MARKER = '<!-- zeus:silent -->'

export type UpdateInfoLike = {
  version?: string
  releaseName?: string | null
  releaseNotes?: string | Array<{ note?: string | null }> | null
  silent?: boolean
  manual?: boolean
}

const SILENT_TAG_RE = /\[silent\]/i

function flattenReleaseNotes(notes: UpdateInfoLike['releaseNotes']): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes.map((entry) => (entry && typeof entry.note === 'string' ? entry.note : '')).join('\n')
  }
  return ''
}

/**
 * Returns true when an electron-updater update payload represents a silent
 * background update (marked explicitly, with `[silent]` in title/notes, or with
 * the hidden `<!-- zeus:silent -->` release-note marker).
 */
export function isSilentUpdateInfo(info: UpdateInfoLike | null | undefined): boolean {
  if (!info) return false
  if (info.silent === true) return true
  if (typeof info.releaseName === 'string' && SILENT_TAG_RE.test(info.releaseName)) return true
  const flatNotes = flattenReleaseNotes(info.releaseNotes)
  if (!flatNotes) return false
  return flatNotes.includes(SILENT_UPDATE_MARKER) || SILENT_TAG_RE.test(flatNotes)
}

export function decorateUpdateInfo<T extends UpdateInfoLike>(
  info: T | null | undefined,
  flags: { silent: boolean; manual: boolean },
): T & { silent: boolean; manual: boolean } {
  return {
    ...((info ?? {}) as T),
    silent: flags.silent,
    manual: flags.manual,
  }
}
