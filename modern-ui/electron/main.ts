import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { autoUpdater } from 'electron-updater'
import { TCPEmulatorHandler, HandheldServerHandler, sendOCRMessage } from './tcp-handler.js'

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
let handheldHandler: HandheldServerHandler | null = null

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
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: !isLinux, // Keep frame on Linux for better compatibility
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
    handheldHandler = new HandheldServerHandler(window)
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

  // Handheld Server IPC handlers
  ipcMain.on('handheld-start', () => {
    console.log('Handheld server start request')
    handheldHandler?.start()
  })

  ipcMain.on('handheld-stop', () => {
    console.log('Handheld server stop request')
    handheldHandler?.stop()
  })

  ipcMain.on('handheld-send-epcs', async (_event, tags: any[], delayMs: number) => {
    console.log(`Sending ${tags.length} EPCs to handheld`)
    await handheldHandler?.sendEpcs(tags, delayMs)
  })

  ipcMain.handle('handheld-is-running', () => {
    return handheldHandler?.isRunning() || false
  })

  ipcMain.on('handheld-cancel-send', () => {
    console.log('Handheld cancel send request')
    handheldHandler?.cancelSend()
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

  // Auto Updater IPC handlers
  ipcMain.on('check-for-update', () => {
    console.log('Checking for updates...')
    if (isDev) {
      console.log('Skipping update check in dev mode')
      mainWindow?.webContents.send('update-not-available')
    } else {
      autoUpdater.checkForUpdatesAndNotify()
    }
  })

  // Check for updates every hour
  setInterval(() => {
    if (!isDev) {
      console.log('Running hourly update check...')
      autoUpdater.checkForUpdatesAndNotify()
    }
  }, 60 * 60 * 1000)

  // Initial check on app start (after a short delay to ensure window is ready)
  setTimeout(() => {
    if (!isDev) {
      console.log('Running initial update check...')
      autoUpdater.checkForUpdatesAndNotify()
    }
  }, 3000)

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
  handheldHandler?.shutdown()
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up TCP handlers before quitting
  tcpHandler?.shutdown()
  handheldHandler?.shutdown()
})

