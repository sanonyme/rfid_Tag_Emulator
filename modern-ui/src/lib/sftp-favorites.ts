const FAVORITES_STORAGE_KEY = 'rfid-file-explorer-favorites'

export interface FavoriteEntry {
  path: string
  label?: string
  addedAt: number
}

function loadAllFavorites(): Record<string, FavoriteEntry[]> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function saveAllFavorites(favs: Record<string, FavoriteEntry[]>): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favs))
  } catch {
    /* storage might be restricted */
  }
}

export function loadFavorites(connectionKey: string): FavoriteEntry[] {
  const all = loadAllFavorites()
  return all[connectionKey] || []
}

export function isFavorite(connectionKey: string, path: string): boolean {
  const norm = normalizePath(path)
  const list = loadFavorites(connectionKey)
  return list.some((item) => normalizePath(item.path) === norm)
}

export function addFavorite(connectionKey: string, path: string, label?: string): FavoriteEntry[] {
  const norm = normalizePath(path)
  const all = loadAllFavorites()
  const list = all[connectionKey] || []
  if (list.some((item) => normalizePath(item.path) === norm)) {
    return list
  }
  const updated: FavoriteEntry[] = [
    ...list,
    { path: norm, label: label?.trim() || undefined, addedAt: Date.now() },
  ]
  all[connectionKey] = updated
  saveAllFavorites(all)
  return updated
}

export function removeFavorite(connectionKey: string, path: string): FavoriteEntry[] {
  const norm = normalizePath(path)
  const all = loadAllFavorites()
  const list = all[connectionKey] || []
  const updated = list.filter((item) => normalizePath(item.path) !== norm)
  all[connectionKey] = updated
  saveAllFavorites(all)
  return updated
}

export function toggleFavorite(connectionKey: string, path: string, label?: string): boolean {
  if (isFavorite(connectionKey, path)) {
    removeFavorite(connectionKey, path)
    return false
  } else {
    addFavorite(connectionKey, path, label)
    return true
  }
}

function normalizePath(p: string): string {
  const s = p.trim().replace(/\\/g, '/')
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s || '/'
}
