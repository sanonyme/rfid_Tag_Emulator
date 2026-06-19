export const DB_CREDS_KEY = 'db-credentials'

export interface DbCredentials {
  user: string
  pass: string
}

/** Load MySQL credentials saved from the Database or SFTP tabs. */
export async function loadDbCredentials(): Promise<DbCredentials | null> {
  try {
    if (window.electronAPI?.safeStoreGet) {
      const raw = await window.electronAPI.safeStoreGet(DB_CREDS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { user?: string; pass?: string }
        if (parsed.user?.trim()) {
          return { user: parsed.user.trim(), pass: parsed.pass ?? '' }
        }
      }
    }
  } catch {
    /* ignore */
  }
  // One-time migration from legacy plaintext localStorage storage.
  try {
    const raw = localStorage.getItem(DB_CREDS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { user?: string; pass?: string }
    if (!parsed.user?.trim()) {
      localStorage.removeItem(DB_CREDS_KEY)
      return null
    }
    const creds = { user: parsed.user.trim(), pass: parsed.pass ?? '' }
    if (window.electronAPI?.safeStoreSet) {
      try {
        await window.electronAPI.safeStoreSet(DB_CREDS_KEY, raw)
        localStorage.removeItem(DB_CREDS_KEY)
      } catch {
        /* keep in memory only this session; do not re-read localStorage */
      }
    }
    return creds
  } catch {
    localStorage.removeItem(DB_CREDS_KEY)
  }
  return null
}
