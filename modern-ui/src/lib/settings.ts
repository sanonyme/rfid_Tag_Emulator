/** App settings persisted to localStorage */

const STORAGE_KEY = 'rfid-emulator-settings'

export type FontSize = 'compact' | 'normal' | 'large'
export type DefaultTab =
  | 'fixed'
  | 'handheld'
  | 'ocr'
  | 'custom'
  | 'adam'
  | 'api'
  | 'decoder'
  | 'automation'
  | 'generator'
  | 'database'
  | 'sftp'
  | 'netscan'

export interface AppSettings {
  fontSize: FontSize
  defaultTab: DefaultTab
  maxLogLines: number
  connectionTimeoutMs: number
  soundEnabled: boolean
  card3dEnabled: boolean
  /** Fixed tab: when true, SGTIN serial continues across UPC lines; when false, each line resets to starting serial. */
  fixedSerialContinuesAcrossUpcLines: boolean
  /** Handheld tab: same as fixed, independent setting. */
  handheldSerialContinuesAcrossUpcLines: boolean
  /** Fixed / Handheld UPC fields: live GTIN check-digit hints while typing. */
  upcCheckDigitHintsEnabled: boolean
}

const DEFAULTS: AppSettings = {
  fontSize: 'large',
  defaultTab: 'fixed',
  maxLogLines: 1000,
  connectionTimeoutMs: 10000,
  soundEnabled: false,
  card3dEnabled: false,
  fixedSerialContinuesAcrossUpcLines: false,
  handheldSerialContinuesAcrossUpcLines: false,
  upcCheckDigitHintsEnabled: true,
}

const LEGACY_SERIAL_CONTINUES_KEY = 'rfid-emulator-serial-continues-across-upc'

function withSerialMigration(parsed: Partial<AppSettings>): Partial<AppSettings> {
  if (
    parsed.fixedSerialContinuesAcrossUpcLines !== undefined &&
    parsed.handheldSerialContinuesAcrossUpcLines !== undefined
  ) {
    return parsed
  }
  let legacy = false
  try {
    legacy = localStorage.getItem(LEGACY_SERIAL_CONTINUES_KEY) === '1'
  } catch {
    /* ignore */
  }
  return {
    ...parsed,
    fixedSerialContinuesAcrossUpcLines: parsed.fixedSerialContinuesAcrossUpcLines ?? legacy,
    handheldSerialContinuesAcrossUpcLines: parsed.handheldSerialContinuesAcrossUpcLines ?? legacy,
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = withSerialMigration(JSON.parse(raw) as Partial<AppSettings>)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...DEFAULTS, ...loadSettings(), ...settings }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function getFontSizeClass(size: FontSize): string {
  switch (size) {
    case 'compact': return 'text-[13px]'
    case 'large': return 'text-[17px]'
    default: return ''
  }
}
