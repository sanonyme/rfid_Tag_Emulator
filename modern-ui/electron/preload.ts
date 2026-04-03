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
  
  // Handheld Server (multi-port: pass port to all methods, events include port)
  handheldStart: (port: number) => ipcRenderer.send('handheld-start', port),
  handheldStop: (port: number) => ipcRenderer.send('handheld-stop', port),
  handheldSendEpcs: (port: number, tags: any[], delayMs: number) => 
    ipcRenderer.send('handheld-send-epcs', port, tags, delayMs),
  handheldCancelSend: (port: number) => ipcRenderer.send('handheld-cancel-send', port),
  handheldIsRunning: (port: number) => ipcRenderer.invoke('handheld-is-running', port),
  
  // Handheld Event listeners - callback receives (port, message)
  onHandheldStarted: (callback: (port: number, message: string) => void) => 
    ipcRenderer.on('handheld-started', (_event, port: number, message: string) => callback(port, message)),
  onHandheldStopped: (callback: (port: number, message: string) => void) => 
    ipcRenderer.on('handheld-stopped', (_event, port: number, message: string) => callback(port, message)),
  onHandheldError: (callback: (port: number, message: string) => void) => 
    ipcRenderer.on('handheld-error', (_event, port: number, message: string) => callback(port, message)),
  onHandheldProgress: (callback: (port: number, message: string) => void) => 
    ipcRenderer.on('handheld-progress', (_event, port: number, message: string) => callback(port, message)),
  onHandheldComplete: (callback: (port: number, message: string) => void) => 
    ipcRenderer.on('handheld-complete', (_event, port: number, message: string) => callback(port, message)),
  
  // OCR
  ocrSend: (host: string, message: string) => ipcRenderer.send('ocr-send', host, message),
  onOcrSuccess: (callback: (message: string) => void) => 
    ipcRenderer.on('ocr-success', (_event, message) => callback(message)),
  onOcrError: (callback: (message: string) => void) => 
    ipcRenderer.on('ocr-error', (_event, message) => callback(message)),

  // Custom Message
  customSend: (host: string, port: number, message: string) => ipcRenderer.send('custom-send', host, port, message),
  onCustomSuccess: (callback: (message: string) => void) => 
    ipcRenderer.on('custom-success', (_event, message) => callback(message)),
  onCustomError: (callback: (message: string) => void) => 
    ipcRenderer.on('custom-error', (_event, message) => callback(message)),

  // ADAM Module
  adamConnect: (host: string, port: number) => ipcRenderer.send('adam-connect', host, port),
  adamDisconnect: () => ipcRenderer.send('adam-disconnect'),
  adamSetDO: (coil: number, value: boolean) => ipcRenderer.send('adam-set-do', coil, value),
  adamReadDIs: (start: number, count: number) => ipcRenderer.send('adam-read-di', start, count),
  adamSetDIInvert: (mask: number, registerAddress?: number) => ipcRenderer.send('adam-set-di-invert', mask, registerAddress ?? 100),
  
  onAdamConnected: (callback: (message: string) => void) => 
    ipcRenderer.on('adam-connected', (_event, message) => callback(message)),
  onAdamDisconnected: (callback: (message: string) => void) => 
    ipcRenderer.on('adam-disconnected', (_event, message) => callback(message)),
  onAdamError: (callback: (message: string) => void) => 
    ipcRenderer.on('adam-error', (_event, message) => callback(message)),
  onAdamDataDI: (callback: (data: { start: number, values: boolean[] }) => void) => 
    ipcRenderer.on('adam-data-di', (_event, data) => callback(data)),
  onAdamWriteSuccess: (callback: (message: string) => void) => 
    ipcRenderer.on('adam-write-success', (_event, message) => callback(message)),

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

  // Inditex API (header/key from persisted config)
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  saveApiConfig: (headerName: string, key: string) => ipcRenderer.invoke('save-api-config', headerName, key),
  itxApiRequest: (url: string, body: string) => ipcRenderer.invoke('itx-api-request', url, body),

  // Database
  dbConnect: (host: string, user: string, password: string) => ipcRenderer.invoke('db-connect', host, user, password),
  dbDisconnect: () => ipcRenderer.invoke('db-disconnect'),
  dbGetTables: (database: string) => ipcRenderer.invoke('db-get-tables', database),
  dbGetTableData: (database: string, table: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke('db-get-table-data', database, table, limit, offset),
  dbExecuteQuery: (query: string, database?: string) => ipcRenderer.invoke('db-execute-query', query, database),
  dbGetPrimaryKeys: (database: string, table: string) => ipcRenderer.invoke('db-get-primary-keys', database, table),
  dbUpdateCell: (database: string, table: string, primaryKeys: Record<string, any>, column: string, value: any) =>
    ipcRenderer.invoke('db-update-cell', database, table, primaryKeys, column, value),
  dbGetTableStructure: (database: string, table: string) => ipcRenderer.invoke('db-get-table-structure', database, table),
  dbDeleteRow: (database: string, table: string, primaryKeys: Record<string, any>) =>
    ipcRenderer.invoke('db-delete-row', database, table, primaryKeys),
  dbInsertRow: (database: string, table: string, values: Record<string, any>) =>
    ipcRenderer.invoke('db-insert-row', database, table, values),
  dbDeleteRows: (database: string, table: string, rows: Record<string, any>[]) =>
    ipcRenderer.invoke('db-delete-rows', database, table, rows),
  dbExportTable: (database: string, table: string) => ipcRenderer.invoke('db-export-table', database, table),
  dbGetDatabaseSchema: (database: string) => ipcRenderer.invoke('db-get-database-schema', database),

  safeStoreSet: (key: string, value: string) => ipcRenderer.invoke('safe-store-set', key, value),
  safeStoreGet: (key: string) => ipcRenderer.invoke('safe-store-get', key),
  safeStoreDelete: (key: string) => ipcRenderer.invoke('safe-store-delete', key),

  // Admin Shell (multi-tab: sessionId required)
  shellStart: (sessionId: string, cols?: number, rows?: number) => ipcRenderer.send('shell-start', sessionId, cols, rows),
  shellWrite: (sessionId: string, data: string) => ipcRenderer.send('shell-write', sessionId, data),
  shellKill: (sessionId: string) => ipcRenderer.send('shell-kill', sessionId),
  shellResize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('shell-resize', sessionId, cols, rows),
  onShellData: (callback: (sessionId: string, data: string) => void) => {
    const handler = (_event: unknown, sessionId: string, data: string) => callback(sessionId, data)
    ipcRenderer.on('shell-data', handler)
    return () => ipcRenderer.removeListener('shell-data', handler)
  },
  onShellExit: (callback: (sessionId: string, code: number | null, signal: string | null) => void) => {
    const handler = (_event: unknown, sessionId: string, code: number | null, signal: string | null) => callback(sessionId, code, signal)
    ipcRenderer.on('shell-exit', handler)
    return () => ipcRenderer.removeListener('shell-exit', handler)
  },
})

