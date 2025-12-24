import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // TCP Emulator
  tcpConnect: (host: string, port: number) => ipcRenderer.send('tcp-connect', host, port),
  tcpDisconnect: () => ipcRenderer.send('tcp-disconnect'),
  tcpSendTags: (tags: any[], driverCode: string, delayMs: number) => 
    ipcRenderer.send('tcp-send-tags', tags, driverCode, delayMs),
  tcpCancelSend: () => ipcRenderer.send('tcp-cancel-send'),
  tcpIsConnected: () => ipcRenderer.invoke('tcp-is-connected'),
  
  // TCP Event listeners
  onTcpConnected: (callback: (message: string) => void) => 
    ipcRenderer.on('tcp-connected', (_event, message) => callback(message)),
  onTcpDisconnected: (callback: (message: string) => void) => 
    ipcRenderer.on('tcp-disconnected', (_event, message) => callback(message)),
  onTcpError: (callback: (message: string) => void) => 
    ipcRenderer.on('tcp-error', (_event, message) => callback(message)),
  onTcpProgress: (callback: (message: string) => void) => 
    ipcRenderer.on('tcp-progress', (_event, message) => callback(message)),
  onTcpComplete: (callback: (message: string) => void) => 
    ipcRenderer.on('tcp-complete', (_event, message) => callback(message)),
  
  // Handheld Server
  handheldStart: () => ipcRenderer.send('handheld-start'),
  handheldStop: () => ipcRenderer.send('handheld-stop'),
  handheldSendEpcs: (tags: any[], delayMs: number) => 
    ipcRenderer.send('handheld-send-epcs', tags, delayMs),
  handheldCancelSend: () => ipcRenderer.send('handheld-cancel-send'),
  handheldIsRunning: () => ipcRenderer.invoke('handheld-is-running'),
  
  // Handheld Event listeners
  onHandheldStarted: (callback: (message: string) => void) => 
    ipcRenderer.on('handheld-started', (_event, message) => callback(message)),
  onHandheldStopped: (callback: (message: string) => void) => 
    ipcRenderer.on('handheld-stopped', (_event, message) => callback(message)),
  onHandheldError: (callback: (message: string) => void) => 
    ipcRenderer.on('handheld-error', (_event, message) => callback(message)),
  onHandheldProgress: (callback: (message: string) => void) => 
    ipcRenderer.on('handheld-progress', (_event, message) => callback(message)),
  onHandheldComplete: (callback: (message: string) => void) => 
    ipcRenderer.on('handheld-complete', (_event, message) => callback(message)),
  
  // OCR
  ocrSend: (host: string, message: string) => ipcRenderer.send('ocr-send', host, message),
  onOcrSuccess: (callback: (message: string) => void) => 
    ipcRenderer.on('ocr-success', (_event, message) => callback(message)),
  onOcrError: (callback: (message: string) => void) => 
    ipcRenderer.on('ocr-error', (_event, message) => callback(message)),

  // Auto Updater
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
  startDownload: () => ipcRenderer.send('start-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  
  onCheckingForUpdate: (callback: () => void) => 
    ipcRenderer.on('checking-for-update', () => callback()),
  onUpdateAvailable: (callback: (info: any) => void) => 
    ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onUpdateNotAvailable: (callback: (info: any) => void) => 
    ipcRenderer.on('update-not-available', (_event, info) => callback(info)),
  onUpdateError: (callback: (message: string) => void) => 
    ipcRenderer.on('update-error', (_event, message) => callback(message)),
  onDownloadProgress: (callback: (progress: any) => void) => 
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress)),
  onUpdateDownloaded: (callback: (info: any) => void) => 
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),

  // ALE API
  aleRequest: (url: string, options: any) => ipcRenderer.invoke('ale-request', url, options),
})

