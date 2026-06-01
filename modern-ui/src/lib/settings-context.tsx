import * as React from 'react'
import { loadSettings, saveSettings, type AppSettings } from './settings'

const SettingsContext = React.createContext<{
  settings: AppSettings
  setSettings: (partial: Partial<AppSettings>) => void
} | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = React.useState(loadSettings)

  const setSettings = React.useCallback((partial: Partial<AppSettings>) => {
    setSettingsState((prev) => saveSettings({ ...prev, ...partial }))
  }, [])

  React.useEffect(() => {
    document.documentElement.dataset.fontSize = settings.fontSize
  }, [settings.fontSize])

  const value = React.useMemo(() => ({ settings, setSettings }), [settings, setSettings])

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = React.useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

/** Returns settings or defaults when outside provider (for UI components) */
export function useSettingsOptional() {
  const ctx = React.useContext(SettingsContext)
  return ctx ?? { settings: loadSettings(), setSettings: () => {} }
}
