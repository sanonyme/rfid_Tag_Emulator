import { looksLikeEdgeSecret } from './edge-auth'

/** Same credentials as Fixed tab — loaded from main process in Electron (never from VITE_ in bundle). */
export async function getAleEnvCredentials(): Promise<{
  username: string
  password: string
  passwordIsHashed: boolean
} | null> {
  if (window.electronAPI?.aleGetCredentialMeta) {
    const meta = await window.electronAPI.aleGetCredentialMeta()
    if (meta.ok && meta.username) {
      return {
        username: meta.username,
        password: '',
        passwordIsHashed: meta.passwordIsHashed ?? false,
      }
    }
    if (window.electronAPI.aleGetBasicAuthHeader) {
      const hdr = await window.electronAPI.aleGetBasicAuthHeader()
      if (hdr.ok && hdr.username) {
        return {
          username: hdr.username,
          password: '',
          passwordIsHashed: true,
        }
      }
    }
    return null
  }

  const username = import.meta.env.VITE_ALE_USERNAME as string | undefined
  const password = import.meta.env.VITE_ALE_PASSWORD as string | undefined
  if (!username?.trim() || !password) return null
  return {
    username: username.trim(),
    password,
    passwordIsHashed: looksLikeEdgeSecret(password),
  }
}

export const ALE_ENV_MISSING_MSG =
  'Missing Edge credentials. Set ZEUS_ALE_USERNAME and ZEUS_ALE_PASSWORD in .env (main process).'
