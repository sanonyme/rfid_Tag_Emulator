import { contextBridge, ipcRenderer } from 'electron'
import type { NetScanStartPayload } from './net-scan-handler.js'
import type { ReaderDiscoveryPayload } from './reader-discovery-handler.js'

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

  sftpConnect: (host: string, port: number, username: string, password: string) =>
    ipcRenderer.invoke('sftp-connect', host, port, username, password),
  sftpDisconnect: () => ipcRenderer.invoke('sftp-disconnect'),
  sftpReaddir: (remotePath: string) => ipcRenderer.invoke('sftp-readdir', remotePath),
  sftpReadFile: (remotePath: string) => ipcRenderer.invoke('sftp-read-file', remotePath),
  sftpWriteFile: (remotePath: string, base64Data: string) =>
    ipcRenderer.invoke('sftp-write-file', remotePath, base64Data),
  sftpWriteTextFile: (remotePath: string, text: string) =>
    ipcRenderer.invoke('sftp-write-text-file', remotePath, text),
  sftpMkdir: (remotePath: string) => ipcRenderer.invoke('sftp-mkdir', remotePath),
  sftpRename: (oldPath: string, newPath: string) => ipcRenderer.invoke('sftp-rename', oldPath, newPath),
  sftpUnlink: (remotePath: string) => ipcRenderer.invoke('sftp-unlink', remotePath),
  sftpRmrf: (remotePath: string) => ipcRenderer.invoke('sftp-rmrf', remotePath),
  sftpDownloadSaveDialog: (remotePath: string, operationId: string) =>
    ipcRenderer.invoke('sftp-download-save-dialog', remotePath, operationId),
  sftpDownloadToPath: (remotePath: string, localPath: string, operationId: string) =>
    ipcRenderer.invoke('sftp-download-to-path', remotePath, localPath, operationId),
  sftpUploadFromLocal: (localPath: string, remotePath: string, operationId: string) =>
    ipcRenderer.invoke('sftp-upload-from-local', localPath, remotePath, operationId),
  sftpCopyRemoteFile: (remoteSrc: string, remoteDest: string, operationId: string) =>
    ipcRenderer.invoke('sftp-copy-remote-file', remoteSrc, remoteDest, operationId),
  localPickFolder: () => ipcRenderer.invoke('local-pick-folder'),
  localReaddir: (root: string, dirPath: string) => ipcRenderer.invoke('local-readdir', root, dirPath),
  localWriteFileBase64: (root: string, filePath: string, base64Data: string) =>
    ipcRenderer.invoke('local-write-file-base64', root, filePath, base64Data),
  localPathParent: (root: string, cwd: string) => ipcRenderer.invoke('local-path-parent', root, cwd),

  netScanGetInterfaces: () => ipcRenderer.invoke('net-scan-get-interfaces'),
  netScanStart: (payload: NetScanStartPayload) => ipcRenderer.invoke('net-scan-start', payload),
  netScanCancel: () => ipcRenderer.invoke('net-scan-cancel'),
  onNetScanHost: (
    callback: (payload: {
      ip: string
      alive: boolean
      hostname?: string | null
      done: number
      total: number
    }) => void,
  ) => {
    const handler = (_e: unknown, payload: Parameters<typeof callback>[0]) => callback(payload)
    ipcRenderer.on('net-scan-host', handler)
    return () => ipcRenderer.removeListener('net-scan-host', handler)
  },
  onNetScanDone: (callback: (payload: { total: number }) => void) => {
    const handler = (_e: unknown, payload: { total: number }) => callback(payload)
    ipcRenderer.on('net-scan-done', handler)
    return () => ipcRenderer.removeListener('net-scan-done', handler)
  },
  onNetScanError: (callback: (payload: { message: string }) => void) => {
    const handler = (_e: unknown, payload: { message: string }) => callback(payload)
    ipcRenderer.on('net-scan-error', handler)
    return () => ipcRenderer.removeListener('net-scan-error', handler)
  },

  // UDP Edge Discovery
  udpDiscoveryStart: (localPort: number, listenDurationMs: number) =>
    ipcRenderer.invoke('udp-discovery-start', localPort, listenDurationMs),
  udpDiscoveryStop: () => ipcRenderer.invoke('udp-discovery-stop'),
  udpDiscoverySendProbe: (targetIp: string, targetPort: number, message: string) =>
    ipcRenderer.invoke('udp-discovery-send-probe', targetIp, targetPort, message),
  udpDiscoveryIsRunning: () => ipcRenderer.invoke('udp-discovery-is-running'),
  onUdpDiscoveryDevice: (
    callback: (device: {
      ip: string
      port: number
      guid: string
      mac: string
      version: string
      lastPDUpdate: string
      errors: string
      name: string
      raw: string
      discoveredAt: number
    }) => void,
  ) => {
    const handler = (_e: unknown, device: Parameters<typeof callback>[0]) => callback(device)
    ipcRenderer.on('udp-discovery-device', handler)
    return () => ipcRenderer.removeListener('udp-discovery-device', handler)
  },
  onUdpDiscoveryRaw: (
    callback: (payload: { data: string; from: string; fromPort: number; timestamp: number }) => void,
  ) => {
    const handler = (_e: unknown, payload: Parameters<typeof callback>[0]) => callback(payload)
    ipcRenderer.on('udp-discovery-raw', handler)
    return () => ipcRenderer.removeListener('udp-discovery-raw', handler)
  },
  onUdpDiscoveryStarted: (callback: (payload: { port: number }) => void) => {
    const handler = (_e: unknown, payload: { port: number }) => callback(payload)
    ipcRenderer.on('udp-discovery-started', handler)
    return () => ipcRenderer.removeListener('udp-discovery-started', handler)
  },
  onUdpDiscoveryStopped: (callback: (payload: { reason: string }) => void) => {
    const handler = (_e: unknown, payload: { reason: string }) => callback(payload)
    ipcRenderer.on('udp-discovery-stopped', handler)
    return () => ipcRenderer.removeListener('udp-discovery-stopped', handler)
  },
  onUdpDiscoveryError: (callback: (payload: { message: string }) => void) => {
    const handler = (_e: unknown, payload: { message: string }) => callback(payload)
    ipcRenderer.on('udp-discovery-error', handler)
    return () => ipcRenderer.removeListener('udp-discovery-error', handler)
  },
  readerDiscoveryStart: (payload: ReaderDiscoveryPayload) =>
    ipcRenderer.invoke('reader-discovery-start', payload),
  readerDiscoveryCancel: () => ipcRenderer.invoke('reader-discovery-cancel'),
  onReaderDiscoveryHost: (
    callback: (payload: {
      ip: string
      done: number
      total: number
      found: number
      openPorts: number[]
      reader?: {
        ip: string
        vendor: 'impinj' | 'seuic' | 'unknown'
        confidence: 'low' | 'medium' | 'high'
        openPorts: number[]
        reason: string
        title?: string
        server?: string
        url?: string
      } | null
    }) => void,
  ) => {
    const handler = (_e: unknown, payload: Parameters<typeof callback>[0]) => callback(payload)
    ipcRenderer.on('reader-discovery-host', handler)
    return () => ipcRenderer.removeListener('reader-discovery-host', handler)
  },
  onReaderDiscoveryDone: (callback: (payload: { total: number; found: number }) => void) => {
    const handler = (_e: unknown, payload: { total: number; found: number }) => callback(payload)
    ipcRenderer.on('reader-discovery-done', handler)
    return () => ipcRenderer.removeListener('reader-discovery-done', handler)
  },
  onReaderDiscoveryError: (callback: (payload: { message: string }) => void) => {
    const handler = (_e: unknown, payload: { message: string }) => callback(payload)
    ipcRenderer.on('reader-discovery-error', handler)
    return () => ipcRenderer.removeListener('reader-discovery-error', handler)
  },

  onSftpTransferProgress: (
    callback: (payload: { operationId: string; loaded: number; total: number }) => void,
  ) => {
    const handler = (
      _e: unknown,
      payload: { operationId: string; loaded: number; total: number },
    ) => callback(payload)
    ipcRenderer.on('sftp-transfer-progress', handler)
    return () => ipcRenderer.removeListener('sftp-transfer-progress', handler)
  },

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

