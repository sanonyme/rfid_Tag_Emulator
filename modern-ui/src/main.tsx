import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initMockElectron } from './lib/mock-electron'
import { SettingsProvider } from './lib/settings-context'

// Initialize mock API if running in browser
initMockElectron()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
)

