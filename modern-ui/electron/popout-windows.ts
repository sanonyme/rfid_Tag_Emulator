import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { broadcastToAllWindows } from './window-broadcast.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export type PopoutInitPayload = {
  tabId: string
  state: Record<string, unknown>
  isAdmin?: boolean
}

const popoutWindows = new Map<string, BrowserWindow>()
const pendingInitState = new Map<string, PopoutInitPayload>()

let mainWindowRef: BrowserWindow | null = null
let isDev = false
let viteDevServerUrl: string | undefined

export function configurePopoutWindows(opts: {
  mainWindow: BrowserWindow
  isDev: boolean
  viteDevServerUrl?: string
}) {
  mainWindowRef = opts.mainWindow
  isDev = opts.isDev
  viteDevServerUrl = opts.viteDevServerUrl
}

export function getPopoutTabIds(): string[] {
  return Array.from(popoutWindows.keys())
}

function buildPopoutUrl(tabId: string): string {
  const hash = `#popout=${encodeURIComponent(tabId)}`
  if (viteDevServerUrl) {
    return `${viteDevServerUrl}${hash}`
  }
  const filePath = path.join(__dirname, '../dist/index.html')
  return `file://${filePath.replace(/\\/g, '/')}${hash}`
}

function notifyPopoutClosed(tabId: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('popout-closed', tabId)
    }
  }
}

function createPopoutWindow(tabId: string, title: string): BrowserWindow {
  const isLinux = process.platform === 'linux'

  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: tabId === 'fixed' ? 880 : 640,
    minHeight: tabId === 'fixed' ? 560 : 480,
    frame: isLinux,
    title: `${title} — Zeus`,
    show: false,
    backgroundColor: '#0f172a',
    titleBarStyle: isLinux ? 'default' : 'hidden',
    thickFrame: !isLinux,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })

  win.on('closed', () => {
    popoutWindows.delete(tabId)
    pendingInitState.delete(tabId)
    notifyPopoutClosed(tabId)
  })

  const url = buildPopoutUrl(tabId)
  if (viteDevServerUrl) {
    void win.loadURL(url)
  } else {
    const filePath = path.join(__dirname, '../dist/index.html')
    void win.loadFile(filePath, { hash: `popout=${tabId}` })
  }

  popoutWindows.set(tabId, win)
  return win
}

export function registerPopoutIpc() {
  ipcMain.on('popout-broadcast-state', (_event, state: Record<string, unknown>, connected: boolean) => {
    broadcastToAllWindows('popout-state-update', state, connected)
  })
  ipcMain.handle('popout-get-window-info', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (!sender || sender.isDestroyed()) {
      return { role: 'unknown' as const, tabId: null, poppedTabs: getPopoutTabIds() }
    }

    for (const [tabId, win] of popoutWindows) {
      if (win.id === sender.id) {
        return { role: 'popout' as const, tabId, poppedTabs: getPopoutTabIds() }
      }
    }

    const isMain = mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.id === sender.id
    return {
      role: isMain ? ('main' as const) : ('unknown' as const),
      tabId: null,
      poppedTabs: getPopoutTabIds(),
    }
  })

  ipcMain.handle('popout-open', (_event, tabId: string, title: string, initState: PopoutInitPayload) => {
    const id = String(tabId)
    pendingInitState.set(id, initState)

    const existing = popoutWindows.get(id)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return { ok: true as const, focused: true as const }
    }

    createPopoutWindow(id, String(title || id))
    return { ok: true as const, focused: false as const }
  })

  ipcMain.handle('popout-dock', (_event, tabId: string) => {
    const id = String(tabId)
    const win = popoutWindows.get(id)
    if (win && !win.isDestroyed()) {
      win.close()
    }
    return { ok: true as const }
  })

  ipcMain.handle('popout-get-init-state', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    if (!sender || sender.isDestroyed()) return null

    for (const [tabId, win] of popoutWindows) {
      if (win.id === sender.id) {
        return pendingInitState.get(tabId) ?? null
      }
    }
    return null
  })

  ipcMain.handle('popout-list', () => getPopoutTabIds())
}

export function closeAllPopoutWindows() {
  for (const win of popoutWindows.values()) {
    if (!win.isDestroyed()) win.close()
  }
  popoutWindows.clear()
  pendingInitState.clear()
}
