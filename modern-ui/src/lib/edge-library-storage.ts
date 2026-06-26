const RECENT_BLOCKS_KEY = 'zeus-edge-recent-blocks'
const PINNED_BLOCKS_KEY = 'zeus-edge-pinned-blocks'
const PINNED_PROCESSES_KEY = 'zeus-edge-pinned-processes'
const MAX_RECENT = 8

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* ignore quota */
  }
}

function trackRecent(key: string, name: string) {
  const next = [name, ...readList(key).filter((n) => n !== name)].slice(0, MAX_RECENT)
  writeList(key, next)
}

function togglePin(key: string, name: string): boolean {
  const current = readList(key)
  const pinned = current.includes(name)
  const next = pinned ? current.filter((n) => n !== name) : [...current, name]
  writeList(key, next)
  return !pinned
}

export function getRecentBlocks() {
  return readList(RECENT_BLOCKS_KEY)
}

export function getPinnedBlocks() {
  return readList(PINNED_BLOCKS_KEY)
}

export function getPinnedProcesses() {
  return readList(PINNED_PROCESSES_KEY)
}

export function trackRecentBlock(name: string) {
  trackRecent(RECENT_BLOCKS_KEY, name)
}

export function togglePinnedBlock(name: string) {
  return togglePin(PINNED_BLOCKS_KEY, name)
}

export function togglePinnedProcess(name: string) {
  return togglePin(PINNED_PROCESSES_KEY, name)
}
