/**
 * User preferences stored in userData (main process only).
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const PREFERENCES_FILE = 'app-preferences.json'

/** How often to check for updates in the background (packaged app only). */
export const AUTO_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

export type AppPreferences = {
  /** When true (default), new updates are downloaded automatically after a check finds one. */
  autoUpdateEnabled: boolean
}

const DEFAULT_PREFERENCES: AppPreferences = {
  autoUpdateEnabled: true,
}

function preferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE)
}

export function getAppPreferences(): AppPreferences {
  const p = preferencesPath()
  if (!fs.existsSync(p)) {
    return { ...DEFAULT_PREFERENCES }
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    if (typeof parsed.autoUpdateEnabled !== 'boolean') {
      return { ...DEFAULT_PREFERENCES }
    }
    return { autoUpdateEnabled: parsed.autoUpdateEnabled }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function setAutoUpdateEnabled(value: boolean): AppPreferences {
  const next: AppPreferences = { ...getAppPreferences(), autoUpdateEnabled: value }
  try {
    fs.writeFileSync(preferencesPath(), JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    console.error('[app-preferences] Failed to save', e)
  }
  return next
}
