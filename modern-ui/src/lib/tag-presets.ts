/**
 * Reusable tag-list presets (UPC and EPC) shared across the Fixed and Handheld tabs.
 *
 * A preset is just a saved snippet of the textarea content (UPC,Count,TID lines
 * or EPC[,TID] lines). They live in localStorage and are intentionally separate
 * from full {@link Profile} objects (which capture host/port/driver/etc as well).
 */

export type TagPresetKind = 'upc' | 'epc'

export interface TagPreset {
  id: string
  name: string
  kind: TagPresetKind
  content: string
  /** Epoch ms; used for sorting in the menu. */
  updatedAt: number
}

const STORAGE_KEY = 'rfid-emulator-tag-presets'
const CHANGE_EVENT = 'tag-presets-changed'

function readAll(): TagPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTagPreset)
  } catch {
    return []
  }
}

function writeAll(presets: TagPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // ignore quota errors; UI will surface the failed save via toast
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // no-op outside the browser
  }
}

function isTagPreset(obj: unknown): obj is TagPreset {
  if (!obj || typeof obj !== 'object') return false
  const p = obj as Partial<TagPreset>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    (p.kind === 'upc' || p.kind === 'epc') &&
    typeof p.content === 'string'
  )
}

export function getTagPresets(kind?: TagPresetKind): TagPreset[] {
  const all = readAll()
  const list = kind ? all.filter((p) => p.kind === kind) : all
  return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export interface CreateTagPresetInput {
  name: string
  kind: TagPresetKind
  content: string
}

export function createTagPreset({ name, kind, content }: CreateTagPresetInput): TagPreset {
  const preset: TagPreset = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim() || 'Untitled preset',
    kind,
    content,
    updatedAt: Date.now(),
  }
  const next = [...readAll(), preset]
  writeAll(next)
  return preset
}

export function updateTagPreset(
  id: string,
  patch: Partial<Pick<TagPreset, 'name' | 'content'>>,
): TagPreset | null {
  const all = readAll()
  let updated: TagPreset | null = null
  const next = all.map((p) => {
    if (p.id !== id) return p
    updated = {
      ...p,
      ...(patch.name !== undefined ? { name: patch.name.trim() || p.name } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      updatedAt: Date.now(),
    }
    return updated
  })
  if (updated) writeAll(next)
  return updated
}

export function deleteTagPreset(id: string): void {
  const next = readAll().filter((p) => p.id !== id)
  writeAll(next)
}

/** Subscribe to changes (across React trees and localStorage updates from other tabs). */
export function subscribeTagPresets(listener: () => void): () => void {
  const onCustom = () => listener()
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener()
  }
  window.addEventListener(CHANGE_EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

export const TAG_PRESETS_STORAGE_KEY = STORAGE_KEY

/* -------------------------------------------------------------------------- */
/* Single / multi preset import / export                                       */
/* -------------------------------------------------------------------------- */

export const TAG_PRESET_FORMAT = 'zeus-tag-preset'
export const TAG_PRESET_FORMAT_VERSION = 1

export interface TagPresetFile {
  format: typeof TAG_PRESET_FORMAT
  formatVersion: number
  exportedAt: string
  presets: Array<Pick<TagPreset, 'name' | 'kind' | 'content'>>
}

function isTagPresetFile(value: unknown): value is TagPresetFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<TagPresetFile>
  return (
    v.format === TAG_PRESET_FORMAT &&
    typeof v.formatVersion === 'number' &&
    Array.isArray(v.presets) &&
    v.presets.every(
      (p) =>
        p && typeof p === 'object' &&
        typeof (p as TagPreset).name === 'string' &&
        ((p as TagPreset).kind === 'upc' || (p as TagPreset).kind === 'epc') &&
        typeof (p as TagPreset).content === 'string',
    )
  )
}

/** Build a portable JSON file containing one or more presets. */
export function buildTagPresetFile(presets: TagPreset[]): TagPresetFile {
  return {
    format: TAG_PRESET_FORMAT,
    formatVersion: TAG_PRESET_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    presets: presets.map(({ name, kind, content }) => ({ name, kind, content })),
  }
}

export function downloadTagPresets(presets: TagPreset[], filename?: string): void {
  const file = buildTagPresetFile(presets)
  const json = JSON.stringify(file, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName =
    filename ??
    (presets.length === 1
      ? `${presets[0].name.replace(/[^a-z0-9_-]+/gi, '_') || 'preset'}.tagpreset.json`
      : `tag-presets-${stamp}.json`)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export interface ImportTagPresetsResult {
  imported: TagPreset[]
}

/**
 * Parse a JSON file produced by {@link downloadTagPresets}. Accepts either
 * the wrapper file format or a bare array of `{ name, kind, content }`
 * objects (so users can hand-author a sharable file).
 */
export function readTagPresetsFile(text: string): Array<Pick<TagPreset, 'name' | 'kind' | 'content'>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  if (Array.isArray(parsed)) {
    const items = parsed.filter(
      (p): p is Pick<TagPreset, 'name' | 'kind' | 'content'> =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as TagPreset).name === 'string' &&
        ((p as TagPreset).kind === 'upc' || (p as TagPreset).kind === 'epc') &&
        typeof (p as TagPreset).content === 'string',
    )
    if (items.length === 0) {
      throw new Error('File does not contain any valid presets.')
    }
    return items
  }
  if (!isTagPresetFile(parsed)) {
    throw new Error('Not a Zeus tag-preset file.')
  }
  if (parsed.formatVersion > TAG_PRESET_FORMAT_VERSION) {
    throw new Error(
      `Preset file was created with a newer app version (v${parsed.formatVersion}). Please update Zeus.`,
    )
  }
  return parsed.presets
}

export function importTagPresets(
  items: Array<Pick<TagPreset, 'name' | 'kind' | 'content'>>,
): ImportTagPresetsResult {
  const all = readAll()
  const created: TagPreset[] = []
  for (const item of items) {
    const preset: TagPreset = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${created.length}`,
      name: item.name.trim() || 'Imported preset',
      kind: item.kind,
      content: item.content,
      updatedAt: Date.now(),
    }
    all.push(preset)
    created.push(preset)
  }
  writeAll(all)
  return { imported: created }
}
