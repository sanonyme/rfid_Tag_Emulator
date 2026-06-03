/** Tabs that can be opened in a separate window (desktop Electron only). */
export const POPOUTABLE_TABS = [
  'fixed',
  'handheld',
  'ocr',
  'custom',
  'adam',
  'edge',
  'api',
  'decoder',
  'automation',
  'generator',
  'database',
  'sftp',
  'netscan',
  'link2uid',
  'terminal',
  'logs',
  'logagg',
] as const

export type PopoutTabId = (typeof POPOUTABLE_TABS)[number]

export const POPOUT_TAB_LABELS: Record<string, string> = {
  fixed: 'Fixed Reader',
  handheld: 'Handheld',
  ocr: 'OCR',
  custom: 'Custom',
  adam: 'ADAM',
  edge: 'Edge',
  api: 'API',
  decoder: 'Decoder',
  automation: 'Automation',
  generator: 'Generator',
  database: 'Database',
  sftp: 'SFTP',
  netscan: 'LAN Scan',
  link2uid: 'Link → UID',
  terminal: 'Terminal',
  logs: 'Log Analyzer',
  logagg: 'Log Aggregator',
}

export function getPopoutTabFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(hash.includes('=') ? hash : '')
  const fromParams = params.get('popout')
  if (fromParams) return fromParams
  const m = hash.match(/^popout=(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export function isPopoutableTab(tabId: string): boolean {
  return POPOUTABLE_TABS.includes(tabId as PopoutTabId)
}

export function getPopoutTabLabel(tabId: string): string {
  return POPOUT_TAB_LABELS[tabId] ?? tabId
}

/** Shared app state snapshot passed when opening a pop-out window. */
export type PopoutInitPayload = {
  tabId: string
  state: Record<string, unknown>
  isAdmin?: boolean
}

export type PopoutWindowInfo = {
  role: 'main' | 'popout' | 'unknown'
  tabId: string | null
  poppedTabs: string[]
}
