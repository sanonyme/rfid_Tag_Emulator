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
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(DB_CREDS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { user?: string; pass?: string }
      if (parsed.user?.trim()) {
        return { user: parsed.user.trim(), pass: parsed.pass ?? '' }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}
