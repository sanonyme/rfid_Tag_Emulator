/** localStorage boolean prefs stored as '1' / '0' (missing key = true). */
export function getBoolPref(key: string, defaultValue = true): boolean {
  try {
    return localStorage.getItem(key) !== '0'
  } catch {
    return defaultValue
  }
}

export function setBoolPref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}
