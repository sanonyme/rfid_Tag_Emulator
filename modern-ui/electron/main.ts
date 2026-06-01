import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import * as pty from 'node-pty'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { TCPEmulatorHandler, HandheldServerHandler, sendOCRMessage, sendCustomMessage } from './tcp-handler.js'
import { connectAdam, disconnectAdam, setAdamDO, readAdamDIs, setAdamDIInvertMask } from './adam-handler.js'
import {
  dbConnect,
  dbDisconnect,
  dbGetTables,
  dbGetTableData,
  dbExecuteQuery,
  dbGetPrimaryKeys,
  dbUpdateCell,
  dbGetTableStructure,
  dbDeleteRow,
  dbInsertRow,
  dbDeleteRows,
  dbExportTable,
  dbGetDatabaseSchema,
} from './db-handler.js'
import {
  sftpConnect,
  sftpDisconnect,
  sftpReaddir,
  sftpReadFile,
  sftpWriteFile,
  sftpWriteTextFile,
  sftpMkdir,
  sftpRename,
  sftpUnlink,
  sftpRmrf,
  sftpDownloadToLocalFile,
  sftpUploadFromLocalFile,
  sftpCopyRemoteFile,
} from './sftp-handler.js'
import { localReaddir, localWriteFileBase64, localParentDir } from './local-fs-handler.js'
import {
  cancelNetScan,
  getIpv4Interfaces,
  startNetScan,
  type NetScanStartPayload,
} from './net-scan-handler.js'
import {
  startUdpDiscovery,
  stopUdpDiscovery,
  sendUdpProbe,
  isUdpDiscoveryRunning,
} from './udp-discovery-handler.js'
import {
  startReaderDiscovery,
  cancelReaderDiscovery,
  type ReaderDiscoveryPayload,
} from './reader-discovery-handler.js'
import {
  getInstallRegistryStatus,
  getInstallRegistryEnabled,
  setInstallRegistryEnabled,
  sendInstallRegistry,
} from './install-registry.js'
import {
  getAppPreferences,
  setAutoUpdateEnabled,
  AUTO_UPDATE_CHECK_INTERVAL_MS,
} from './app-preferences.js'
import { runLogAggregator } from './log-aggregator-handler.js'

// Load environment variables
import dotenv from 'dotenv'
import fs from 'fs'

// Dev: load .env from project root. Packaged: load .env from same folder as exe (user places it there)
if (app.isPackaged) {
  const envPath = path.join(path.dirname(app.getPath('exe')), '.env')
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  }
} else {
  dotenv.config()
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Auto-updater logging
autoUpdater.logger = console
// @ts-ignore
autoUpdater.logger.transports = {
  file: {
    level: 'info',
    // Mock the file transport if needed or let electron-updater handle it
  }
}

// TCP handlers
let tcpHandler: TCPEmulatorHandler | null = null
const handheldHandlers = new Map<number, HandheldServerHandler>()

// Shell/terminal (admin) - multi-tab support
const shellProcesses = new Map<string, pty.IPty>()

// Check if we're in dev mode - Vite sets VITE_DEV_SERVER_URL when running dev server
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged

let mainWindow: BrowserWindow | null = null

type GithubFeed = {
  provider: 'github'
  owner: string
  repo: string
  releaseType: 'release'
}

function resolveFeed(owner: string, repo: string): GithubFeed | null {
  const feedOwner = owner.trim()
  const feedRepo = repo.trim()
  if (!feedOwner || !feedRepo) return null
  return {
    provider: 'github',
    owner: feedOwner,
    repo: feedRepo,
    releaseType: 'release',
  }
}

const primaryFeed =
  resolveFeed(__ZEUS_EMBED_RELEASE_OWNER__, __ZEUS_EMBED_RELEASE_REPO__) ??
  resolveFeed(process.env.ZEUS_RELEASE_OWNER ?? '', process.env.ZEUS_RELEASE_REPO ?? '')

const secondaryFeed =
  resolveFeed(__ZEUS_EMBED_SECOND_RELEASE_OWNER__, __ZEUS_EMBED_SECOND_RELEASE_REPO__) ??
  resolveFeed(process.env.ZEUS_SECOND_RELEASE_OWNER ?? '', process.env.ZEUS_SECOND_RELEASE_REPO ?? '')

const updateCheckState = {
  inProgress: false,
  usedFallback: false,
}

let periodicUpdateInterval: ReturnType<typeof setInterval> | null = null

function applyUpdateFeed(feed: GithubFeed | null, label: string): boolean {
  if (!feed) return false
  try {
    // `setFeedURL` accepts provider-specific options; github feed is used here.
    autoUpdater.setFeedURL(feed as any)
    console.log(`Auto-updater feed set to ${label}: ${feed.owner}/${feed.repo}`)
    return true
  } catch (error) {
    console.warn(`Failed to apply ${label} feed`, error)
    return false
  }
}

function createWindow() {
  // Prevent creating duplicate windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('Window already exists, focusing it...')
    mainWindow.focus()
    return mainWindow
  }

  console.log('Creating Electron window...')
  console.log('Dev mode:', isDev)
  console.log('VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL)

  const isLinux = process.platform === 'linux'

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 980,
    minWidth: 800,
    minHeight: 600,
    frame: isLinux, // Keep frame on Linux for better compatibility
    icon: path.join(__dirname, '../resources/ZeusIcon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'edge RFID Tag Emulator',
    show: false, // Don't show until ready
    backgroundColor: '#0f172a', // Dark background while loading
    titleBarStyle: isLinux ? 'default' : 'hidden', // Default titlebar on Linux
  })

  // Show window when page is fully loaded
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Page fully loaded, showing window')
    console.log('OPEN_DEVTOOLS env var:', process.env.OPEN_DEVTOOLS)

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()

      // Only open DevTools if explicitly requested via OPEN_DEVTOOLS=true
      const shouldOpenDevTools = process.env.OPEN_DEVTOOLS === 'true' || process.env.OPEN_DEVTOOLS === '1'

      console.log('Should open DevTools:', shouldOpenDevTools)

      if (shouldOpenDevTools) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.openDevTools({ mode: 'right' })
          }
        }, 500)
      }
    }
  })

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show() // Show even on error so user can see what happened
    }
  })

  // Clean up reference when closed
  mainWindow.on('closed', () => {
    console.log('Window closed')
    mainWindow = null
  })

  // Keyboard shortcut to toggle DevTools: F12 or Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools()
        } else {
          mainWindow.webContents.openDevTools({ mode: 'right' })
        }
      }
    }
  })

  // In dev mode, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('Loading from Vite dev server:', process.env.VITE_DEV_SERVER_URL)
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    // In production, load from built files
    const filePath = path.join(__dirname, '../dist/index.html')
    console.log('Loading from file:', filePath)
    mainWindow.loadFile(filePath)
  }

  return mainWindow
}

// Disable hardware acceleration to save resources/processes
// app.disableHardwareAcceleration()

// Add flags to reduce process count and memory usage
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
app.commandLine.appendSwitch('renderer-process-limit', '1')

app.whenReady().then(() => {
  console.log('App ready, creating window...')
  const window = createWindow()

  if (window) {
    // Initialize TCP handlers
    tcpHandler = new TCPEmulatorHandler(window)
  }

  ipcMain.handle('install-registry-get-status', () => getInstallRegistryStatus())
  ipcMain.handle('install-registry-set-enabled', (_e, enabled: boolean) => {
    setInstallRegistryEnabled(Boolean(enabled))
    return getInstallRegistryEnabled()
  })
  ipcMain.handle('install-registry-send-now', async () => sendInstallRegistry({ force: true }))

  setTimeout(() => {
    sendInstallRegistry().catch((err) => console.warn('[install-registry]', err))
  }, 5000)

  // Window control IPC handlers
  ipcMain.on('window-minimize', () => {
    console.log('IPC: window-minimize received')
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      console.log('Minimizing window')
      win.minimize()
    }
  })

  ipcMain.on('window-maximize', () => {
    console.log('IPC: window-maximize received')
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      if (win.isMaximized()) {
        console.log('Unmaximizing window')
        win.unmaximize()
      } else {
        console.log('Maximizing window')
        win.maximize()
      }
    }
  })

  ipcMain.on('window-close', () => {
    console.log('IPC: window-close received')
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      console.log('Closing window')
      win.close()
    }
  })

  // TCP Emulator IPC handlers
  ipcMain.on('tcp-connect', (_event, host: string, port: number) => {
    console.log(`TCP connect request: ${host}:${port}`)
    tcpHandler?.connect(host, port)
  })

  ipcMain.on('tcp-disconnect', () => {
    console.log('TCP disconnect request')
    tcpHandler?.disconnect()
  })

  ipcMain.on('tcp-send-tags', async (_event, tags: any[], driverCode: string, delayMs: number) => {
    console.log(`Sending ${tags.length} tags with driver ${driverCode}`)
    await tcpHandler?.sendTags(tags, driverCode, delayMs)
  })

  ipcMain.on('tcp-cancel-send', () => {
    console.log('TCP cancel send request')
    tcpHandler?.cancelSend()
  })

  ipcMain.handle('tcp-is-connected', () => {
    return tcpHandler?.getConnectionStatus() || false
  })

  ipcMain.handle(
    'labelary-render',
    async (_event, zpl: string, dpmm: number, widthIn: number, heightIn: number) => {
      const body = typeof zpl === 'string' ? zpl.trim() : ''
      if (!body) throw new Error('ZPL is empty')
      const w = Number(widthIn)
      const h = Number(heightIn)
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        throw new Error('Invalid label dimensions')
      }
      const d = [6, 8, 12, 24].includes(Number(dpmm)) ? Number(dpmm) : 8
      const url = `http://api.labelary.com/v1/printers/${d}dpmm/labels/${w}x${h}/0/`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'image/png',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error((t || `HTTP ${res.status}`).slice(0, 900))
      }
      const buf = Buffer.from(await res.arrayBuffer())
      return buf.toString('base64')
    },
  )

  // Handheld Server IPC handlers (multi-port support)
  ipcMain.on('handheld-start', (_event, port: number) => {
    const p = typeof port === 'number' ? port : 10472
    console.log(`Handheld server start request on port ${p}`)
    if (!mainWindow) return
    let handler = handheldHandlers.get(p)
    if (!handler) {
      handler = new HandheldServerHandler(mainWindow, p)
      handheldHandlers.set(p, handler)
    }
    handler.start()
  })

  ipcMain.on('handheld-stop', (_event, port: number) => {
    const p = typeof port === 'number' ? port : 10472
    console.log(`Handheld server stop request on port ${p}`)
    const handler = handheldHandlers.get(p)
    if (handler) {
      handler.stop()
      handheldHandlers.delete(p)
    }
  })

  ipcMain.on(
    'handheld-send-epcs',
    async (_event, port: number, tags: any[], delayMs: number, verboseProgress?: boolean) => {
      const p = typeof port === 'number' ? port : 10472
      const verbose = verboseProgress !== false
      console.log(`Sending ${tags.length} EPCs to handheld on port ${p}`)
      const handler = handheldHandlers.get(p)
      if (handler) {
        await handler.sendEpcs(tags, delayMs, verbose)
      } else {
        mainWindow?.webContents.send('handheld-complete', p, 'No server running on port ' + p)
      }
    }
  )

  ipcMain.handle('handheld-is-running', (_event, port: number) => {
    const p = typeof port === 'number' ? port : 10472
    const handler = handheldHandlers.get(p)
    return handler?.isRunning() ?? false
  })

  ipcMain.on('handheld-cancel-send', (_event, port: number) => {
    const p = typeof port === 'number' ? port : 10472
    console.log(`Handheld cancel send request on port ${p}`)
    handheldHandlers.get(p)?.cancelSend()
  })

  // OCR IPC handlers
  ipcMain.on('ocr-send', (_event, host: string, message: string) => {
    console.log(`OCR: Received request to send to ${host}: ${message}`)
    if (mainWindow) {
      sendOCRMessage(host, message, mainWindow)
        .then(() => console.log('OCR: Send completed'))
        .catch((err) => console.error('OCR: Send error:', err))
    } else {
      console.error('OCR: No mainWindow available')
    }
  })

  // Custom Message IPC handlers
  ipcMain.on('custom-send', (_event, host: string, port: number, message: string) => {
    console.log(`Custom: Received request to send to ${host}:${port}: ${message}`)
    if (mainWindow) {
      sendCustomMessage(host, port, message, mainWindow)
        .then(() => console.log('Custom: Send completed'))
        .catch((err) => console.error('Custom: Send error:', err))
    } else {
      console.error('Custom: No mainWindow available')
    }
  })

  // ADAM IPC handlers
  ipcMain.on('adam-connect', (_event, host: string, port: number) => {
    console.log(`ADAM: Connect request to ${host}:${port}`)
    if (mainWindow) {
      connectAdam(host, port, mainWindow)
    }
  })

  ipcMain.on('adam-disconnect', () => {
    console.log('ADAM: Disconnect request')
    if (mainWindow) {
      disconnectAdam(mainWindow)
    }
  })

  ipcMain.on('adam-set-do', (_event, coil: number, value: boolean) => {
    console.log(`ADAM: Set DO ${coil} to ${value}`)
    if (mainWindow) {
      setAdamDO(coil, value, mainWindow)
    }
  })

  ipcMain.on('adam-read-di', (_event, start: number, count: number) => {
    console.log(`ADAM: Read DI start=${start} count=${count}`)
    if (mainWindow) {
      readAdamDIs(start, count, mainWindow)
    }
  })

  ipcMain.on('adam-set-di-invert', (_event, mask: number, registerAddress: number) => {
    console.log(`ADAM: Set DI invert mask=${mask} register=${registerAddress}`)
    if (mainWindow) {
      setAdamDIInvertMask(mask, registerAddress, mainWindow)
    }
  })

  // Database IPC handlers
  ipcMain.handle('db-connect', async (_event, host: string, user: string, password: string) => {
    console.log(`DB: Connect request to ${host} as ${user}`)
    return dbConnect(host, user, password)
  })

  ipcMain.handle('db-disconnect', async () => {
    console.log('DB: Disconnect request')
    return dbDisconnect()
  })

  ipcMain.handle('db-get-tables', async (_event, database: string) => {
    console.log(`DB: Get tables for ${database}`)
    return dbGetTables(database)
  })

  ipcMain.handle('db-get-table-data', async (_event, database: string, table: string, limit?: number, offset?: number) => {
    console.log(`DB: Get data for ${database}.${table}`)
    return dbGetTableData(database, table, limit, offset)
  })

  ipcMain.handle('db-execute-query', async (_event, query: string, database?: string) => {
    console.log(`DB: Execute query on ${database || 'default'}`)
    return dbExecuteQuery(query, database)
  })

  ipcMain.handle('db-get-primary-keys', async (_event, database: string, table: string) => {
    return dbGetPrimaryKeys(database, table)
  })

  ipcMain.handle('db-update-cell', async (_event, database: string, table: string, primaryKeys: Record<string, any>, column: string, value: any) => {
    console.log(`DB: Update ${database}.${table}.${column}`)
    return dbUpdateCell(database, table, primaryKeys, column, value)
  })

  ipcMain.handle('db-get-table-structure', async (_event, database: string, table: string) => {
    return dbGetTableStructure(database, table)
  })

  ipcMain.handle('db-delete-row', async (_event, database: string, table: string, primaryKeys: Record<string, any>) => {
    console.log(`DB: Delete row ${database}.${table}`)
    return dbDeleteRow(database, table, primaryKeys)
  })

  ipcMain.handle('db-insert-row', async (_event, database: string, table: string, values: Record<string, any>) => {
    console.log(`DB: Insert row ${database}.${table}`)
    return dbInsertRow(database, table, values)
  })

  ipcMain.handle('db-delete-rows', async (_event, database: string, table: string, rows: Record<string, any>[]) => {
    console.log(`DB: Bulk delete ${database}.${table} (${rows?.length ?? 0} row(s))`)
    return dbDeleteRows(database, table, rows ?? [])
  })

  ipcMain.handle('db-export-table', async (_event, database: string, table: string) => {
    console.log(`DB: Export table ${database}.${table}`)
    return dbExportTable(database, table)
  })

  ipcMain.handle('db-get-database-schema', async (_event, database: string) => {
    console.log(`DB: Get schema for ${database}`)
    return dbGetDatabaseSchema(database)
  })

  // SFTP (ssh2, single session)
  ipcMain.handle(
    'sftp-connect',
    async (_event, host: string, port: number, username: string, password: string) => {
      console.log(`SFTP: Connect ${host}:${port} as ${username}`)
      return sftpConnect(host, port, username, password)
    }
  )
  ipcMain.handle('sftp-disconnect', async () => {
    console.log('SFTP: Disconnect')
    await sftpDisconnect()
  })
  ipcMain.handle('sftp-readdir', async (_event, remotePath: string) => sftpReaddir(remotePath))
  ipcMain.handle('sftp-read-file', async (_event, remotePath: string) => sftpReadFile(remotePath))
  ipcMain.handle('sftp-write-file', async (_event, remotePath: string, base64Data: string) =>
    sftpWriteFile(remotePath, base64Data)
  )
  ipcMain.handle('sftp-write-text-file', async (_event, remotePath: string, text: string) =>
    sftpWriteTextFile(remotePath, text)
  )
  ipcMain.handle('sftp-mkdir', async (_event, remotePath: string) => sftpMkdir(remotePath))
  ipcMain.handle('sftp-rename', async (_event, oldPath: string, newPath: string) => sftpRename(oldPath, newPath))
  ipcMain.handle('sftp-unlink', async (_event, remotePath: string) => sftpUnlink(remotePath))
  ipcMain.handle('sftp-rmrf', async (_event, remotePath: string) => sftpRmrf(remotePath))

  ipcMain.handle(
    'sftp-download-save-dialog',
    async (event, remotePath: string, operationId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const base = path.posix.basename(String(remotePath).replace(/\\/g, '/')) || 'download'
      const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
        defaultPath: base,
        buttonLabel: 'Save',
      })
      if (canceled || !filePath) {
        return { ok: false as const, cancelled: true as const }
      }
      const r = await sftpDownloadToLocalFile(remotePath, filePath, (loaded, total) => {
        event.sender.send('sftp-transfer-progress', { operationId, loaded, total })
      })
      return r.ok ? { ok: true as const, localPath: filePath } : r
    },
  )

  ipcMain.handle(
    'sftp-download-to-path',
    async (event, remotePath: string, localPath: string, operationId: string) => {
      const r = await sftpDownloadToLocalFile(remotePath, localPath, (loaded, total) => {
        event.sender.send('sftp-transfer-progress', { operationId, loaded, total })
      })
      return r
    },
  )

  ipcMain.handle(
    'sftp-upload-from-local',
    async (event, localPath: string, remotePath: string, operationId: string) => {
      const r = await sftpUploadFromLocalFile(localPath, remotePath, (loaded, total) => {
        event.sender.send('sftp-transfer-progress', { operationId, loaded, total })
      })
      return r
    },
  )

  ipcMain.handle(
    'sftp-copy-remote-file',
    async (event, remoteSrc: string, remoteDest: string, operationId: string) => {
      const r = await sftpCopyRemoteFile(remoteSrc, remoteDest, (loaded, total) => {
        event.sender.send('sftp-transfer-progress', { operationId, loaded, total })
      })
      return r
    },
  )

  ipcMain.handle('local-pick-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths?.[0]) return { ok: false as const, cancelled: true as const }
    return { ok: true as const, path: filePaths[0] }
  })

  ipcMain.handle('local-readdir', async (_event, root: string, dirPath: string) =>
    localReaddir(root, dirPath),
  )

  ipcMain.handle(
    'local-write-file-base64',
    async (_event, root: string, filePath: string, base64Data: string) =>
      localWriteFileBase64(root, filePath, base64Data),
  )

  ipcMain.handle('local-path-parent', async (_event, root: string, cwd: string) =>
    localParentDir(root, cwd),
  )

  ipcMain.handle('log-aggregator-pick-zip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openFile'],
      filters: [{ name: 'Zip archives', extensions: ['zip'] }],
    })
    if (canceled || !filePaths?.[0]) return { ok: false as const, cancelled: true as const }
    return { ok: true as const, path: filePaths[0] }
  })

  ipcMain.handle('log-aggregator-pick-output', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || !filePaths?.[0]) return { ok: false as const, cancelled: true as const }
    return { ok: true as const, path: filePaths[0] }
  })

  ipcMain.handle('log-aggregator-run', async (event, zipPath: string, outputDir: string) =>
    runLogAggregator(zipPath, outputDir, (progress) => {
      event.sender.send('log-aggregator-progress', progress)
    }),
  )

  ipcMain.handle('log-aggregator-show-output', async (_event, outputDir: string) => {
    const err = await shell.openPath(outputDir)
    if (err) return { ok: false as const, error: err }
    return { ok: true as const }
  })

  ipcMain.handle('net-scan-get-interfaces', () => ({ ok: true as const, interfaces: getIpv4Interfaces() }))
  ipcMain.handle('net-scan-start', async (event, payload: NetScanStartPayload) =>
    startNetScan(event.sender, payload),
  )
  ipcMain.handle('net-scan-cancel', () => {
    cancelNetScan()
    return { ok: true as const }
  })

  // UDP Edge Discovery
  ipcMain.handle('udp-discovery-start', (event, localPort: number, listenDurationMs: number) =>
    startUdpDiscovery(event.sender, localPort, listenDurationMs),
  )
  ipcMain.handle('udp-discovery-stop', () => {
    stopUdpDiscovery()
    return { ok: true as const }
  })
  ipcMain.handle(
    'udp-discovery-send-probe',
    (_event, targetIp: string, targetPort: number, message: string) =>
      sendUdpProbe(targetIp, targetPort, message),
  )
  ipcMain.handle('udp-discovery-is-running', () => isUdpDiscoveryRunning())
  ipcMain.handle('reader-discovery-start', async (event, payload: ReaderDiscoveryPayload) =>
    startReaderDiscovery(event.sender, payload),
  )
  ipcMain.handle('reader-discovery-cancel', () => {
    cancelReaderDiscovery()
    return { ok: true as const }
  })

  const getSecretsPath = () => path.join(app.getPath('userData'), 'secrets.json')

  ipcMain.handle('safe-store-set', async (_event, key: string, value: string) => {
    const encrypted = safeStorage.encryptString(value)
    const base64 = encrypted.toString('base64')
    const secretsPath = getSecretsPath()
    let data: Record<string, string> = {}
    if (fs.existsSync(secretsPath)) {
      try {
        const raw = fs.readFileSync(secretsPath, 'utf-8')
        data = JSON.parse(raw)
        if (!data || typeof data !== 'object') data = {}
      } catch {
        data = {}
      }
    }
    data[key] = base64
    fs.writeFileSync(secretsPath, JSON.stringify(data), 'utf-8')
    return true
  })

  ipcMain.handle('safe-store-get', async (_event, key: string) => {
    const secretsPath = getSecretsPath()
    if (!fs.existsSync(secretsPath)) return null
    try {
      const raw = fs.readFileSync(secretsPath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, string>
      const base64 = data?.[key]
      if (base64 === undefined || base64 === null) return null
      return safeStorage.decryptString(Buffer.from(base64, 'base64'))
    } catch {
      return null
    }
  })

  ipcMain.handle('safe-store-delete', async (_event, key: string) => {
    const secretsPath = getSecretsPath()
    if (!fs.existsSync(secretsPath)) return
    try {
      const raw = fs.readFileSync(secretsPath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, string>
      if (!data || typeof data !== 'object') return
      delete data[key]
      fs.writeFileSync(secretsPath, JSON.stringify(data), 'utf-8')
    } catch {
      /* ignore */
    }
  })

  // Admin Shell/Terminal IPC handlers (node-pty, multi-tab support)
  ipcMain.on('shell-start', (_event, sessionId: string, cols: number = 80, rows: number = 24) => {
    const existing = shellProcesses.get(sessionId)
    if (existing) {
      existing.kill()
      shellProcesses.delete(sessionId)
    }
    const isWin = process.platform === 'win32'
    const shell = isWin ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash')
    const args = isWin ? [] : ['-l']
    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })
    shellProcesses.set(sessionId, proc)
    proc.onData((data: string) => {
      mainWindow?.webContents.send('shell-data', sessionId, data)
    })
    proc.onExit(({ exitCode, signal }) => {
      shellProcesses.delete(sessionId)
      mainWindow?.webContents.send('shell-exit', sessionId, exitCode, signal)
    })
  })

  ipcMain.on('shell-write', (_event, sessionId: string, data: string) => {
    const proc = shellProcesses.get(sessionId)
    if (proc) proc.write(data)
  })

  ipcMain.on('shell-resize', (_event, sessionId: string, cols: number, rows: number) => {
    const proc = shellProcesses.get(sessionId)
    if (proc) proc.resize(cols, rows)
  })

  ipcMain.on('shell-kill', (_event, sessionId: string) => {
    const proc = shellProcesses.get(sessionId)
    if (proc) {
      proc.kill()
      shellProcesses.delete(sessionId)
    }
  })

  function runUpdateCheck(trigger: 'manual' | 'startup' | 'periodic') {
    console.log(`Checking for updates (${trigger})...`)
    // When auto-update is off, downloads only start from Settings (start-download).
    // When on, update-available triggers downloadUpdate().
    autoUpdater.autoDownload = false

    if (isDev) {
      console.log('Skipping update check in dev mode')
      mainWindow?.webContents.send('update-not-available')
      return
    }

    if (updateCheckState.inProgress) {
      console.log('Update check already in progress, skipping duplicate request')
      return
    }

    updateCheckState.inProgress = true
    updateCheckState.usedFallback = false
    if (!applyUpdateFeed(primaryFeed, 'primary')) {
      console.warn('Primary update feed not configured; using default app-update.yml feed')
    }

    void autoUpdater.checkForUpdates().catch((err: any) => {
      console.error('Update check failed to start:', err)
    })
  }

  function schedulePeriodicUpdateChecks() {
    if (periodicUpdateInterval) {
      clearInterval(periodicUpdateInterval)
      periodicUpdateInterval = null
    }
    if (isDev || !app.isPackaged) return
    periodicUpdateInterval = setInterval(() => {
      runUpdateCheck('periodic')
    }, AUTO_UPDATE_CHECK_INTERVAL_MS)
    console.log(
      `[auto-update] Background checks every ${AUTO_UPDATE_CHECK_INTERVAL_MS / 3600000}h (packaged app)`
    )
  }

  ipcMain.handle('get-auto-update-enabled', () => getAppPreferences().autoUpdateEnabled)
  ipcMain.handle('set-auto-update-enabled', (_event, enabled: boolean) => {
    setAutoUpdateEnabled(Boolean(enabled))
    return getAppPreferences().autoUpdateEnabled
  })

  // Auto Updater IPC handlers
  ipcMain.on('check-for-update', () => {
    runUpdateCheck('manual')
  })

  ipcMain.on('start-download', () => {
    console.log('User requested download...')
    autoUpdater.downloadUpdate()
  })

  ipcMain.on('quit-and-install', () => {
    console.log('Quitting and installing update...')
    autoUpdater.quitAndInstall()
  })

  // Auto Updater Events
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
    mainWindow?.webContents.send('checking-for-update')
  })

  autoUpdater.on('update-available', (info) => {
    updateCheckState.inProgress = false
    console.log('Update available:', info)
    mainWindow?.webContents.send('update-available', info)
    const prefs = getAppPreferences()
    if (!isDev && app.isPackaged && prefs.autoUpdateEnabled) {
      console.log('[auto-update] Auto-download enabled — starting download')
      void autoUpdater.downloadUpdate().catch((e) => {
        console.error('[auto-update] Automatic download failed:', e)
      })
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    updateCheckState.inProgress = false
    console.log('Update not available:', info)
    mainWindow?.webContents.send('update-not-available', info)
  })

  autoUpdater.on('error', (err) => {
    if (updateCheckState.inProgress && !updateCheckState.usedFallback && secondaryFeed) {
      updateCheckState.usedFallback = true
      console.warn('Primary update feed failed, retrying with secondary feed...', err)
      const applied = applyUpdateFeed(secondaryFeed, 'secondary')
      if (applied) {
        void autoUpdater.checkForUpdates().catch((retryErr: any) => {
          updateCheckState.inProgress = false
          console.error('Secondary update check failed to start:', retryErr)
          mainWindow?.webContents.send('update-error', retryErr?.message ?? 'Secondary update check failed')
        })
        return
      }
    }

    updateCheckState.inProgress = false
    console.error('Update error:', err)
    mainWindow?.webContents.send('update-error', err.message)
  })

  // Auto-check once after launch in production; then repeat on an interval.
  setTimeout(() => runUpdateCheck('startup'), 4000)
  schedulePeriodicUpdateChecks()

  // API config path (persisted in userData)
  const getApiConfigPath = () => path.join(app.getPath('userData'), 'api-config.json')

  // Inditex API - POST with header/key from persisted config
  ipcMain.handle('get-api-config', () => {
    try {
      const configPath = getApiConfigPath()
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        return { headerName: config.headerName || 'itx-apiKey', key: config.key || '' }
      }
    } catch (e) {
      console.error('Failed to read API config:', e)
    }
    return { headerName: 'itx-apiKey', key: '' }
  })

  ipcMain.handle('save-api-config', (_event, headerName: string, key: string) => {
    try {
      const configPath = getApiConfigPath()
      fs.writeFileSync(configPath, JSON.stringify({ headerName: headerName || 'itx-apiKey', key }), 'utf-8')
    } catch (e) {
      console.error('Failed to save API config:', e)
    }
  })

  ipcMain.handle('itx-api-request', async (_event, url: string, body: string) => {
    let headerName = 'itx-apiKey'
    let apiKey = ''
    try {
      const configPath = getApiConfigPath()
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(raw)
        headerName = config.headerName || 'itx-apiKey'
        apiKey = config.key || ''
      }
    } catch (e) {
      console.error('Failed to read API config:', e)
    }
    if (!apiKey) {
      return {
        ok: false,
        status: 0,
        statusText: 'Missing API key',
        data: 'Enter your API key in the header section above and click Save.',
        headers: {}
      }
    }
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        [headerName]: apiKey,
      }
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: body || '{}',
      })
      const text = await response.text()
      const resHeaders: Record<string, string> = {}
      response.headers.forEach((val, key) => { resHeaders[key] = val })
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: text,
        headers: resHeaders
      }
    } catch (error: any) {
      console.error('ITX API Error:', error)
      return {
        ok: false,
        status: 0,
        statusText: error.message || 'Request failed',
        data: null,
        headers: {}
      }
    }
  })

  // ALE API Proxy to bypass CORS
  ipcMain.handle('ale-request', async (_event, url: string, options: any) => {
    console.log(`ALE Request: ${options?.method || 'GET'} ${url}`)

    // Inject credentials if this is an auth request with placeholder values
    if (url.includes('/ALE/api/auth') && options.body) {
      try {
        const body = JSON.parse(options.body)
        if (body.username === 'use_env_vars') {
          console.log('Injecting credentials into auth request')
          // Strictly use environment variables, no hardcoded fallbacks
          const username = process.env.VITE_ALE_USERNAME
          const password = process.env.VITE_ALE_PASSWORD

          if (!username || !password) {
            throw new Error("Missing ALE credentials in environment variables")
          }

          body.username = username
          body.password = password
          options.body = JSON.stringify(body)
        }
      } catch (e) {
        console.error('Failed to parse auth body for injection', e)
      }
    }

    const ALE_TIMEOUT_MS = 15000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ALE_TIMEOUT_MS)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeoutId)
      const text = await response.text()
      // Convert headers to simple object for IPC
      const headers: Record<string, string> = {}
      response.headers.forEach((val, key) => {
        headers[key] = val
      })

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: text,
        headers
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      console.error('ALE Request Error:', error)
      let msg = error.message || 'Request failed'
      if (error.name === 'AbortError') {
        msg = `Connection timed out after ${ALE_TIMEOUT_MS / 1000}s. Check that the server is reachable at the given IP and port (try http://IP:port in a browser).`
      } else if (msg.includes('ECONNREFUSED')) {
        msg = 'Connection refused. Server may be down, or the port is wrong (try 80, 8080, or 8081).'
      } else if (msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
        msg = 'Host unreachable. Check network, firewall, and that the IP is correct.'
      }
      return {
        ok: false,
        status: 0,
        statusText: msg,
        data: null,
        headers: {}
      }
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%'
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')'
    console.log(log_message)
    mainWindow?.webContents.send('download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info)
    mainWindow?.webContents.send('update-downloaded', info)
  })
})

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log('No windows, creating new one...')
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (periodicUpdateInterval) {
    clearInterval(periodicUpdateInterval)
    periodicUpdateInterval = null
  }
  // Clean up TCP handlers
  tcpHandler?.shutdown()
  Array.from(handheldHandlers.values()).forEach(handler => handler.shutdown())
  handheldHandlers.clear()
  shellProcesses.forEach((proc) => proc.kill())
  shellProcesses.clear()
  if (mainWindow) disconnectAdam(mainWindow)
  stopUdpDiscovery()
  cancelReaderDiscovery()
  dbDisconnect()
  void sftpDisconnect()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up TCP handlers before quitting
  tcpHandler?.shutdown()
  Array.from(handheldHandlers.values()).forEach(handler => handler.shutdown())
  handheldHandlers.clear()
  shellProcesses.forEach((proc) => proc.kill())
  shellProcesses.clear()
  if (mainWindow) disconnectAdam(mainWindow)
  stopUdpDiscovery()
  cancelReaderDiscovery()
  dbDisconnect()
  void sftpDisconnect()
})
// trigger rebuild 2
