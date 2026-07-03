export type DesktopRuntime = 'electron' | 'tauri' | 'browser'

/** Detect which desktop shell is hosting the UI. */
export function getDesktopRuntime(): DesktopRuntime {
  if (typeof window === 'undefined') return 'browser'
  if ('__TAURI_INTERNALS__' in window) return 'tauri'
  if (window.electronAPI) return 'electron'
  return 'browser'
}

export function isTauriRuntime(): boolean {
  return getDesktopRuntime() === 'tauri'
}

export function isElectronRuntime(): boolean {
  return getDesktopRuntime() === 'electron'
}

/** Unified access to the desktop backend API (Electron preload or Tauri bridge). */
export function getDesktopAPI(): typeof window.electronAPI | undefined {
  return window.electronAPI
}
