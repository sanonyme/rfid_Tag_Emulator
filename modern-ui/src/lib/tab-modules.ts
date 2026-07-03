import { useEffect, useState } from 'react'

/** Dynamic import for each main workspace tab (shared with React.lazy in App.tsx). */
export const TAB_MODULE_LOADERS: Record<string, () => Promise<unknown>> = {
  fixed: () => import('../components/FixedTab'),
  handheld: () => import('../components/HandheldTab'),
  ocr: () => import('../components/OCRTab'),
  custom: () => import('../components/CustomTab'),
  api: () => import('../components/Api'),
  edge: () => import('../components/EdgeTab'),
  decoder: () => import('../components/DecoderTab'),
  automation: () => import('../components/AutomationTab'),
  generator: () => import('../components/BarcodeGenerator'),
  database: () => import('../components/DatabaseTab'),
  sftp: () => import('../components/SftpTab'),
  netscan: () => import('../components/NetScanTab'),
  link2uid: () => import('../components/LinkToUidTab'),
  terminal: () => import('../components/AdminTerminalTab'),
  logs: () => import('../components/SystemLogAnalyzerTab'),
  logagg: () => import('../components/LogAggregatorTab'),
}

const tabModulesResolved = new Set<string>()
const tabModulePromises = new Map<string, Promise<void>>()

/** Preload a tab chunk; safe to call repeatedly. */
export function preloadTabModule(tabId: string): Promise<void> {
  const loader = TAB_MODULE_LOADERS[tabId]
  if (!loader) return Promise.resolve()
  if (tabModulesResolved.has(tabId)) return Promise.resolve()

  let pending = tabModulePromises.get(tabId)
  if (!pending) {
    pending = loader()
      .then(() => {
        tabModulesResolved.add(tabId)
      })
      .catch((err) => {
        tabModulePromises.delete(tabId)
        throw err
      })
    tabModulePromises.set(tabId, pending)
  }
  return pending
}

export function preloadTabModules(tabIds: string[]): void {
  tabIds.forEach((id) => void preloadTabModule(id))
}

/** Tab chunks to fetch in the background after first paint (JS only — no mount). */
export const LAUNCH_PRELOAD_TAB_IDS = ['fixed', 'handheld', 'decoder', 'database'] as const

export function preloadLaunchTabModules(): void {
  const run = () => preloadTabModules([...LAUNCH_PRELOAD_TAB_IDS])
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 2000 })
  } else {
    window.setTimeout(run, 100)
  }
}

/** Wait for the Vite chunk before mounting React.lazy (avoids Suspense stuck behind hidden panels). */
export function useTabModuleReady(tabId: string, enabled: boolean): boolean {
  const [ready, setReady] = useState(
    () => !TAB_MODULE_LOADERS[tabId] || tabModulesResolved.has(tabId),
  )

  useEffect(() => {
    if (!enabled) return
    if (tabModulesResolved.has(tabId)) {
      setReady(true)
      return
    }
    let cancelled = false
    void preloadTabModule(tabId)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err) => {
        console.error(`Failed to load tab module "${tabId}":`, err)
      })
    return () => {
      cancelled = true
    }
  }, [tabId, enabled])

  return ready
}
