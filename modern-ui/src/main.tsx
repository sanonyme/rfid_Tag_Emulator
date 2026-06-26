import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SettingsProvider } from './lib/settings-context'

// Polyfill crypto.randomUUID for older Safari/iOS (< 15.4)
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

// Browser / mobile dev: mock Electron IPC when preload is absent.
if (import.meta.env.DEV && !window.electronAPI) {
  void import('./lib/mock-electron').then(({ initMockElectron }) => {
    try {
      initMockElectron()
    } catch (e) {
      console.error('Failed to init mock:', e)
    }
  })
}
import { ErrorBoundary } from './ErrorBoundary.tsx'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

