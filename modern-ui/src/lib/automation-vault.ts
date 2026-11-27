/**
 * Environment Variables & Encrypted Secrets Vault for Zeus Automation.
 * - Env Vars (`{{env.KEY}}`) persist in localStorage.
 * - Secrets (`{{secret.KEY}}`) persist via OS-encrypted Electron safeStorage when available.
 */

export interface VaultEntry {
  key: string
  value: string
}

export const ENV_VARS_STORAGE_KEY = 'zeus-automation-env-vars'
const SECRETS_STORE_KEY = 'zeus-automation-secrets'

const ENV_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/

export function normalizeVaultEntries(raw: unknown): VaultEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: VaultEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = String((item as any).key ?? '').trim()
    const value = String((item as any).value ?? '')
    if (!key || !ENV_KEY_RE.test(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ key, value })
  }
  return out
}

export function loadEnvVars(): VaultEntry[] {
  try {
    const raw = localStorage.getItem(ENV_VARS_STORAGE_KEY)
    if (!raw) return []
    return normalizeVaultEntries(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveEnvVars(entries: VaultEntry[]): void {
  try {
    localStorage.setItem(ENV_VARS_STORAGE_KEY, JSON.stringify(normalizeVaultEntries(entries)))
  } catch {
    /* ignore quota errors */
  }
}

export async function loadSecrets(): Promise<VaultEntry[]> {
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.safeStoreGet) {
      const raw = await api.safeStoreGet(SECRETS_STORE_KEY)
      if (!raw) return []
      return normalizeVaultEntries(JSON.parse(raw))
    }
    const raw = localStorage.getItem(SECRETS_STORE_KEY)
    return raw ? normalizeVaultEntries(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export async function saveSecrets(entries: VaultEntry[]): Promise<void> {
  const clean = normalizeVaultEntries(entries)
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.safeStoreSet) {
      await api.safeStoreSet(SECRETS_STORE_KEY, JSON.stringify(clean))
      return
    }
    localStorage.setItem(SECRETS_STORE_KEY, JSON.stringify(clean))
  } catch {
    /* ignore */
  }
}

/**
 * Convert Env Vars and Secrets into flat `AutomationVars` entries:
 * - `env.<KEY>`
 * - `secret.<KEY>`
 */
export function buildVaultRunVars(envVars: VaultEntry[], secrets: VaultEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of envVars) {
    const key = entry.key.trim()
    if (key && ENV_KEY_RE.test(key)) out[`env.${key}`] = entry.value
  }
  for (const entry of secrets) {
    const key = entry.key.trim()
    if (key && ENV_KEY_RE.test(key)) out[`secret.${key}`] = entry.value
  }
  return out
}

/**
 * Mask any secret value (minimum length 4 to avoid corrupting common short strings)
 * inside log lines or error summaries.
 */
export function redactSecrets(text: string, secretValues: readonly string[]): string {
  if (!text || secretValues.length === 0) return text
  let result = text
  for (const secret of secretValues) {
    if (!secret || secret.length < 4) continue
    if (result.includes(secret)) {
      result = result.split(secret).join('***')
    }
  }
  return result
}
