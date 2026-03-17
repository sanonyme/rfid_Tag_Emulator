/** App settings persisted to localStorage */

const STORAGE_KEY = 'rfid-emulator-settings'

export type FontSize = 'compact' | 'normal' | 'large'
export type DefaultTab = 'fixed' | 'handheld' | 'ocr' | 'custom' | 'adam' | 'api' | 'decoder' | 'automation' | 'generator'

export interface AppSettings {
  fontSize: FontSize
  defaultTab: DefaultTab
  maxLogLines: number
  connectionTimeoutMs: number
  soundEnabled: boolean
  card3dEnabled: boolean
}

const DEFAULTS: AppSettings = {
  fontSize: 'normal',
  defaultTab: 'fixed',
  maxLogLines: 1000,
  connectionTimeoutMs: 10000,
  soundEnabled: false,
  card3dEnabled: false,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next = { ...current, ...settings }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function getFontSizeClass(size: FontSize): string {
  switch (size) {
    case 'compact': return 'text-[13px]'
    case 'large': return 'text-[15px]'
    default: return ''
  }
}
