import { describe, it, expect } from 'vitest'
import {
  buildTagPresetFile,
  createTagPreset,
  deleteTagPreset,
  getTagPresets,
  importTagPresets,
  readTagPresetsFile,
  subscribeTagPresets,
  updateTagPreset,
} from '../tag-presets'

describe('tag-presets', () => {
  it('starts empty', () => {
    expect(getTagPresets()).toEqual([])
    expect(getTagPresets('upc')).toEqual([])
    expect(getTagPresets('epc')).toEqual([])
  })

  it('creates and retrieves presets by kind', () => {
    createTagPreset({ name: 'Demo UPC', kind: 'upc', content: '00012345678905,3' })
    createTagPreset({ name: 'Demo EPC', kind: 'epc', content: '3034ABC...' })
    expect(getTagPresets()).toHaveLength(2)
    expect(getTagPresets('upc')).toHaveLength(1)
    expect(getTagPresets('upc')[0].name).toBe('Demo UPC')
    expect(getTagPresets('epc')).toHaveLength(1)
    expect(getTagPresets('epc')[0].content).toBe('3034ABC...')
  })

  it('sorts presets by updatedAt descending', async () => {
    const a = createTagPreset({ name: 'A', kind: 'upc', content: 'a' })
    await new Promise((r) => setTimeout(r, 5))
    const b = createTagPreset({ name: 'B', kind: 'upc', content: 'b' })
    const list = getTagPresets('upc')
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
  })

  it('updates name and content', () => {
    const created = createTagPreset({ name: 'Old', kind: 'upc', content: 'one' })
    const updated = updateTagPreset(created.id, { name: 'New', content: 'two' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('New')
    expect(updated!.content).toBe('two')
    const refetched = getTagPresets('upc').find((p) => p.id === created.id)
    expect(refetched?.name).toBe('New')
  })

  it('returns null when updating a missing id', () => {
    expect(updateTagPreset('does-not-exist', { name: 'x' })).toBeNull()
  })

  it('deletes presets', () => {
    const created = createTagPreset({ name: 'Goner', kind: 'epc', content: 'x' })
    deleteTagPreset(created.id)
    expect(getTagPresets('epc')).toEqual([])
  })

  it('falls back gracefully on corrupt localStorage', () => {
    localStorage.setItem('rfid-emulator-tag-presets', '{bad json}')
    expect(getTagPresets()).toEqual([])
  })

  it('notifies subscribers when presets change', () => {
    let calls = 0
    const unsubscribe = subscribeTagPresets(() => {
      calls++
    })
    createTagPreset({ name: 'A', kind: 'upc', content: 'a' })
    expect(calls).toBeGreaterThan(0)
    unsubscribe()
    const before = calls
    createTagPreset({ name: 'B', kind: 'upc', content: 'b' })
    expect(calls).toBe(before)
  })

  it('rejects items without an id/name/kind/content shape on read', () => {
    localStorage.setItem(
      'rfid-emulator-tag-presets',
      JSON.stringify([{ id: 1, name: 'bad' }, { name: 'missing-id', kind: 'upc', content: 'x' }]),
    )
    expect(getTagPresets()).toEqual([])
  })
})

describe('tag-presets file import / export', () => {
  it('round-trips presets through the wrapper format', () => {
    const a = createTagPreset({ name: 'A', kind: 'upc', content: '1' })
    const b = createTagPreset({ name: 'B', kind: 'epc', content: '2' })
    const file = buildTagPresetFile([a, b])
    const json = JSON.stringify(file)
    const parsed = readTagPresetsFile(json)
    expect(parsed.map((p) => p.name).sort()).toEqual(['A', 'B'])
    expect(parsed.find((p) => p.name === 'A')?.kind).toBe('upc')
  })

  it('accepts a bare array of preset items', () => {
    const arr = [
      { name: 'A', kind: 'upc' as const, content: '1' },
      { name: 'B', kind: 'epc' as const, content: '2' },
    ]
    const parsed = readTagPresetsFile(JSON.stringify(arr))
    expect(parsed).toHaveLength(2)
  })

  it('rejects unrelated JSON shapes with a friendly error', () => {
    expect(() => readTagPresetsFile('not json')).toThrowError(/not valid JSON/i)
    expect(() => readTagPresetsFile('{}')).toThrowError(/Zeus tag-preset/i)
    expect(() => readTagPresetsFile('[]')).toThrowError(/valid presets/i)
  })

  it('importTagPresets gives every preset a new id and persists them', () => {
    const items = [
      { name: 'X', kind: 'upc' as const, content: 'abc' },
      { name: 'Y', kind: 'epc' as const, content: 'def' },
    ]
    const { imported } = importTagPresets(items)
    expect(imported).toHaveLength(2)
    expect(new Set(imported.map((p) => p.id)).size).toBe(2)
    expect(getTagPresets()).toHaveLength(2)
  })

  it('rejects files from a newer format version', () => {
    const future = {
      format: 'zeus-tag-preset',
      formatVersion: 999,
      exportedAt: new Date().toISOString(),
      presets: [{ name: 'X', kind: 'upc', content: 'x' }],
    }
    expect(() => readTagPresetsFile(JSON.stringify(future))).toThrowError(/newer/i)
  })
})
