import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { autoUpdater } from 'electron-updater'
import { TCPEmulatorHandler, HandheldServerHandler, sendOCRMessage, sendCustomMessage } from './tcp-handler.js'
import { connectAdam, disconnectAdam, setAdamDO, readAdamDIs, setAdamDIInvertMask } from './adam-handler.js'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config()

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

// Check if we're in dev mode - Vite sets VITE_DEV_SERVER_URL when running dev server
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged

let mainWindow: BrowserWindow | null = null

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
    width: 1200,
    height: 855,
    minWidth: 800,
    minHeight: 600,
    frame: isLinux, // Keep frame on Linux for better compatibility
    icon: path.join(__dirname, '../resources/app-icon-1024.png'), // App icon
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

  ipcMain.on('handheld-send-epcs', async (_event, port: number, tags: any[], delayMs: number) => {
    const p = typeof port === 'number' ? port : 10472
    console.log(`Sending ${tags.length} EPCs to handheld on port ${p}`)
    const handler = handheldHandlers.get(p)
    if (handler) {
      await handler.sendEpcs(tags, delayMs)
    } else {
      mainWindow?.webContents.send('handheld-complete', p, 'No server running on port ' + p)
    }
  })

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

  // Auto Updater IPC handlers
  ipcMain.on('check-for-update', () => {
    console.log('Checking for updates...')
    // Auto-download is enabled by default. We want to disable it to let the user choose.
    autoUpdater.autoDownload = false

    if (isDev) {
      console.log('Skipping update check in dev mode')
      mainWindow?.webContents.send('update-not-available')
    } else {
      // This will check for updates but NOT download them automatically
      autoUpdater.checkForUpdates()
    }
  })

  // Check for updates every hour
  setInterval(() => {
    if (!isDev) {
      console.log('Running hourly update check...')
      autoUpdater.checkForUpdates()
    }
  }, 60 * 60 * 1000)

  // Initial check on app start
  setTimeout(() => {
    if (!isDev) {
      console.log('Running initial update check...')
      autoUpdater.checkForUpdates()
    }
  }, 3000)

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
    console.log('Update available:', info)
    mainWindow?.webContents.send('update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info)
    mainWindow?.webContents.send('update-not-available', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
    mainWindow?.webContents.send('update-error', err.message)
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

    try {
      const response = await fetch(url, options)
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
      console.error('ALE Request Error:', error)
      return {
        ok: false,
        status: 0,
        statusText: error.message,
        data: null
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
  // Clean up TCP handlers
  tcpHandler?.shutdown()
  Array.from(handheldHandlers.values()).forEach(handler => handler.shutdown())
  handheldHandlers.clear()
  if (mainWindow) disconnectAdam(mainWindow)
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up TCP handlers before quitting
  tcpHandler?.shutdown()
  Array.from(handheldHandlers.values()).forEach(handler => handler.shutdown())
  handheldHandlers.clear()
  if (mainWindow) disconnectAdam(mainWindow)
})
// trigger rebuild 2
