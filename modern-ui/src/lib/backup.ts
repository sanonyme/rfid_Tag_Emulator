import packageJson from '../../package.json'

/**
 * List of localStorage keys to include in a full backup.
 *
 * NOTE: credential keys like `sftp-creds` and `db-credentials` are intentionally
 * omitted — they are base64-wrapped passwords and should not travel in a plaintext
 * JSON backup file.
 */
const BACKUP_KEYS = [
  'rfid-emulator-profiles',       // ProfileManager
  'rfid-emulator-tag-presets',    // TagPresetMenu (UPC/EPC list snippets)
  'rfid-emulator-settings',       // AppSettings
  'app-theme',                    // Theme name
  'theme',                        // light | dark | system
  'recent-hosts',                 // ConnectionStatus recent hosts
  'pinned-hosts',                 // ConnectionStatus pinned (★) hosts
  'db-query-history',             // DatabaseTab saved queries
  'db-read-only',                 // DatabaseTab toggle
  'admin-sidebar-expanded',       // TabSidebar
  'rfid-emulator-last-seen-version',
] as const

const EXCLUDED_CREDENTIAL_KEYS = ['sftp-creds', 'db-credentials']

export const BACKUP_FORMAT = 'zeus-rfid-emulator-backup'
export const BACKUP_FORMAT_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  appVersion: string
  exportedAt: string
  /** Map of localStorage key → stored string value (or null if missing). */
  data: Record<string, string | null>
}

export interface BackupSummary {
  profiles: number
  automationSequences: number
  savedQueries: number
  recentHosts: number
  hasSettings: boolean
  hasTheme: boolean
  appVersion?: string
  exportedAt?: string
}

export type RestoreMode = 'replace' | 'merge'

export function buildBackup(): BackupFile {
  const data: Record<string, string | null> = {}
  for (const key of BACKUP_KEYS) {
    try {
      data[key] = localStorage.getItem(key)
    } catch {
      data[key] = null
    }
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: packageJson.version,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export function isBackupFile(obj: unknown): obj is BackupFile {
  if (!obj || typeof obj !== 'object') return false
  const b = obj as Partial<BackupFile>
  return b.format === BACKUP_FORMAT && typeof b.formatVersion === 'number' && typeof b.data === 'object'
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const summary: BackupSummary = {
    profiles: 0,
    automationSequences: 0,
    savedQueries: 0,
    recentHosts: 0,
    hasSettings: false,
    hasTheme: false,
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
  }

  const profilesRaw = backup.data['rfid-emulator-profiles']
  if (profilesRaw) {
    try {
      const parsed = JSON.parse(profilesRaw)
      if (Array.isArray(parsed)) {
        summary.profiles = parsed.length
        for (const p of parsed) {
          if (Array.isArray(p?.automationSequences)) {
            summary.automationSequences += p.automationSequences.length
          }
        }
      }
    } catch { /* ignore */ }
  }

  const historyRaw = backup.data['db-query-history']
  if (historyRaw) {
    try {
      const parsed = JSON.parse(historyRaw)
      if (Array.isArray(parsed)) summary.savedQueries = parsed.length
    } catch { /* ignore */ }
  }

  const hostsRaw = backup.data['recent-hosts']
  if (hostsRaw) {
    try {
      const parsed = JSON.parse(hostsRaw)
      if (Array.isArray(parsed)) summary.recentHosts = parsed.length
    } catch { /* ignore */ }
  }

  summary.hasSettings = Boolean(backup.data['rfid-emulator-settings'])
  summary.hasTheme = Boolean(backup.data['app-theme'] || backup.data['theme'])

  return summary
}

/**
 * Apply a backup to localStorage.
 *
 * - `replace`: every backed-up key is set to the backup's value (null values clear the key).
 * - `merge`:   arrays (profiles, recent-hosts, db-query-history) are union-merged by id /
 *              equality; everything else (settings, themes, flags) is overwritten.
 */
export function applyBackup(backup: BackupFile, mode: RestoreMode = 'replace'): void {
  for (const key of BACKUP_KEYS) {
    if (EXCLUDED_CREDENTIAL_KEYS.includes(key as string)) continue
    const incoming = backup.data[key]

    if (mode === 'replace') {
      if (incoming === null || incoming === undefined) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, incoming)
      }
      continue
    }

    // merge mode
    if (incoming === null || incoming === undefined) continue

    if (key === 'rfid-emulator-profiles' || key === 'rfid-emulator-tag-presets') {
      try {
        const existing = JSON.parse(localStorage.getItem(key) || '[]')
        const incomingArr = JSON.parse(incoming)
        if (Array.isArray(existing) && Array.isArray(incomingArr)) {
          const map = new Map<string, any>()
          for (const p of existing) if (p?.id) map.set(p.id, p)
          for (const p of incomingArr) if (p?.id) map.set(p.id, p)
          localStorage.setItem(key, JSON.stringify(Array.from(map.values())))
          continue
        }
      } catch { /* fall through */ }
    }

    if (key === 'recent-hosts' || key === 'db-query-history') {
      try {
        const existing = JSON.parse(localStorage.getItem(key) || '[]')
        const incomingArr = JSON.parse(incoming)
        if (Array.isArray(existing) && Array.isArray(incomingArr)) {
          const seen = new Set<string>()
          const merged: any[] = []
          for (const v of [...incomingArr, ...existing]) {
            const k = typeof v === 'string' ? v : JSON.stringify(v)
            if (seen.has(k)) continue
            seen.add(k)
            merged.push(v)
          }
          localStorage.setItem(key, JSON.stringify(merged))
          continue
        }
      } catch { /* fall through */ }
    }

    localStorage.setItem(key, incoming)
  }
}

export function downloadBackup(): void {
  const backup = buildBackup()
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = `zeus-rfid-${stamp}.rfidbackup.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  if (!isBackupFile(parsed)) {
    throw new Error('This file is not a Zeus RFID backup (wrong format).')
  }
  if (parsed.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Backup was created with a newer version of Zeus (format v${parsed.formatVersion}). Please update the app.`,
    )
  }
  return parsed
}
