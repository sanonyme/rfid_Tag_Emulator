import { describe, it, expect } from 'vitest'
import {
  applyBackup,
  buildBackup,
  isBackupFile,
  summarizeBackup,
  BACKUP_FORMAT,
} from '../backup'

describe('backup', () => {
  it('builds a backup with the expected format and version', () => {
    const backup = buildBackup()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.formatVersion).toBeGreaterThanOrEqual(1)
    expect(typeof backup.exportedAt).toBe('string')
  })

  it('captures all backup keys including tag presets', () => {
    localStorage.setItem('rfid-emulator-tag-presets', JSON.stringify([{ id: 'a', name: 'p', kind: 'upc', content: 'x' }]))
    localStorage.setItem('rfid-emulator-profiles', JSON.stringify([{ id: 'p1', name: 'profile' }]))
    const backup = buildBackup()
    expect(backup.data['rfid-emulator-tag-presets']).toBeTruthy()
    expect(backup.data['rfid-emulator-profiles']).toBeTruthy()
  })

  it('round-trips localStorage state in replace mode', () => {
    localStorage.setItem('rfid-emulator-profiles', JSON.stringify([{ id: 'p1', name: 'profile' }]))
    const backup = buildBackup()
    localStorage.removeItem('rfid-emulator-profiles')
    expect(localStorage.getItem('rfid-emulator-profiles')).toBeNull()
    applyBackup(backup, 'replace')
    expect(JSON.parse(localStorage.getItem('rfid-emulator-profiles')!)).toEqual([
      { id: 'p1', name: 'profile' },
    ])
  })

  it('merges profiles by id without dropping local entries', () => {
    localStorage.setItem(
      'rfid-emulator-profiles',
      JSON.stringify([{ id: 'p1', name: 'local' }]),
    )
    const incoming = buildBackup()
    incoming.data['rfid-emulator-profiles'] = JSON.stringify([
      { id: 'p1', name: 'incoming-overrides' },
      { id: 'p2', name: 'new-from-backup' },
    ])
    applyBackup(incoming, 'merge')
    const merged = JSON.parse(localStorage.getItem('rfid-emulator-profiles')!) as Array<{
      id: string
      name: string
    }>
    expect(merged.find((p) => p.id === 'p1')?.name).toBe('incoming-overrides')
    expect(merged.find((p) => p.id === 'p2')?.name).toBe('new-from-backup')
  })

  it('merges tag-presets by id', () => {
    localStorage.setItem(
      'rfid-emulator-tag-presets',
      JSON.stringify([{ id: 't1', name: 'local', kind: 'upc', content: 'a', updatedAt: 1 }]),
    )
    const incoming = buildBackup()
    incoming.data['rfid-emulator-tag-presets'] = JSON.stringify([
      { id: 't1', name: 'incoming', kind: 'upc', content: 'a2', updatedAt: 2 },
      { id: 't2', name: 'new', kind: 'epc', content: 'b', updatedAt: 3 },
    ])
    applyBackup(incoming, 'merge')
    const merged = JSON.parse(localStorage.getItem('rfid-emulator-tag-presets')!) as Array<{
      id: string
      name: string
    }>
    expect(merged).toHaveLength(2)
    expect(merged.find((p) => p.id === 't1')?.name).toBe('incoming')
    expect(merged.find((p) => p.id === 't2')?.name).toBe('new')
  })

  it('summarizeBackup counts profiles and queries', () => {
    localStorage.setItem(
      'rfid-emulator-profiles',
      JSON.stringify([
        { id: 'p1', name: 'one', automationSequences: [{}, {}] },
        { id: 'p2', name: 'two', automationSequences: [{}] },
      ]),
    )
    localStorage.setItem('db-query-history', JSON.stringify(['select 1', 'select 2']))
    const summary = summarizeBackup(buildBackup())
    expect(summary.profiles).toBe(2)
    expect(summary.automationSequences).toBe(3)
    expect(summary.savedQueries).toBe(2)
  })

  it('isBackupFile accepts well-formed backups and rejects others', () => {
    expect(isBackupFile(buildBackup())).toBe(true)
    expect(isBackupFile({})).toBe(false)
    expect(isBackupFile(null)).toBe(false)
    expect(isBackupFile({ format: 'something-else', formatVersion: 1, data: {} })).toBe(false)
  })
})
