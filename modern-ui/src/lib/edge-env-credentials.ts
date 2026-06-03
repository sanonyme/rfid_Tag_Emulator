import { looksLikeEdgeSecret } from './edge-auth'

/** Same credentials as Fixed tab logical devices (VITE_ALE_* in .env). */
export function getAleEnvCredentials(): {
  username: string
  password: string
  passwordIsHashed: boolean
} | null {
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
  'Missing VITE_ALE_USERNAME or VITE_ALE_PASSWORD in .env (same as Fixed tab stations).'
