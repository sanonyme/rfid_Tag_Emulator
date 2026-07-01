import { contextBridge, ipcRenderer } from 'electron'
import type { NetScanStartPayload } from './net-scan-handler.js'
import type { ReaderDiscoveryPayload, ReaderVendor } from './reader-discovery-handler.js'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // TCP Emulator
  tcpConnect: (host: string, port: number) =>
    ipcRenderer.invoke('tcp-connect', host, port) as Promise<{ ok: boolean; message?: string; error?: string }>,
  tcpDisconnect: () => ipcRenderer.send('tcp-disconnect'),
  tcpSendTags: (tags: any[], driverCode: string, delayMs: number) => 
    ipcRenderer.send('tcp-send-tags', tags, driverCode, delayMs),
  tcpCancelSend: () => ipcRenderer.send('tcp-cancel-send'),
  tcpIsConnected: () => ipcRenderer.invoke('tcp-is-connected'),
  labelaryRender: (zpl: string, dpmm: number, widthIn: number, heightIn: number) =>
    ipcRenderer.invoke('labelary-render', zpl, dpmm, widthIn, heightIn),

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
  handheldSendEpcs: (port: number, tags: any[], delayMs: number, verboseProgress?: boolean) =>
    ipcRenderer.send('handheld-send-epcs', port, tags, delayMs, verboseProgress !== false),
  handheldSendRecipe: (port: number, recipe: unknown, delayMs: number, verboseProgress?: boolean) =>
    ipcRenderer.send('handheld-send-recipe', port, recipe, delayMs, verboseProgress !== false),
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

  // Auto Updater
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
  startDownload: () => ipcRenderer.send('start-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  getAutoUpdateEnabled: () => ipcRenderer.invoke('get-auto-update-enabled') as Promise<boolean>,
  setAutoUpdateEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-update-enabled', enabled) as Promise<boolean>,
  
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
  aleGetCredentialMeta: () =>
    ipcRenderer.invoke('ale-get-credential-meta') as Promise<
      { ok: true; username: string; passwordIsHashed: boolean } | { ok: false }
    >,
  aleGetBasicAuthHeader: () =>
    ipcRenderer.invoke('ale-get-basic-auth-header') as Promise<
      { ok: true; username: string; header: string } | { ok: false; error?: string }
    >,
  aleRequest: (url: string, options: any) => ipcRenderer.invoke('ale-request', url, options),
  aleRequestBatch: (requests: { url: string; options?: Record<string, unknown> }[]) =>
    ipcRenderer.invoke('ale-request-batch', requests),

  // Inditex API (header/key from persisted config)
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  saveApiConfig: (headerName: string, key: string) => ipcRenderer.invoke('save-api-config', headerName, key),
  itxApiRequest: (url: string, body: string) => ipcRenderer.invoke('itx-api-request', url, body),

  // Database
  dbConnect: (host: string, user: string, password: string) => ipcRenderer.invoke('db-connect', host, user, password),
  dbDisconnect: () => ipcRenderer.invoke('db-disconnect'),
  dbListDatabases: () => ipcRenderer.invoke('db-list-databases'),
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
  dbExportDatabaseSql: (database: string) => ipcRenderer.invoke('db-export-database-sql', database),
  dbSaveExportTable: (database: string, table: string, format: 'csv' | 'sql') =>
    ipcRenderer.invoke('db-save-export-table', database, table, format),
  dbSaveExportDatabaseSql: (database: string) => ipcRenderer.invoke('db-save-export-database-sql', database),
  dbSaveExportDatabaseCsv: (database: string) => ipcRenderer.invoke('db-save-export-database-csv', database),
  onDbExportProgress: (callback: (progress: import('../src/lib/db-export-progress.js').DbExportProgressPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(progress as import('../src/lib/db-export-progress.js').DbExportProgressPayload)
    }
    ipcRenderer.on('db-export-progress', listener)
    return () => {
      ipcRenderer.removeListener('db-export-progress', listener)
    }
  },
  dbImportRows: (database: string, table: string, rows: Record<string, any>[]) =>
    ipcRenderer.invoke('db-import-rows', database, table, rows),
  dbGetDatabaseSchema: (database: string) => ipcRenderer.invoke('db-get-database-schema', database),

  sftpConnect: (host: string, port: number, username: string, password: string) =>
    ipcRenderer.invoke('sftp-connect', host, port, username, password),
  sftpDisconnect: (sessionId: string) => ipcRenderer.invoke('sftp-disconnect', sessionId),
  sftpReaddir: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-readdir', sessionId, remotePath),
  sftpReadFile: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-read-file', sessionId, remotePath),
  sftpWriteFile: (sessionId: string, remotePath: string, base64Data: string) =>
    ipcRenderer.invoke('sftp-write-file', sessionId, remotePath, base64Data),
  sftpWriteTextFile: (sessionId: string, remotePath: string, text: string) =>
    ipcRenderer.invoke('sftp-write-text-file', sessionId, remotePath, text),
  sftpMkdir: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-mkdir', sessionId, remotePath),
  sftpRename: (sessionId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('sftp-rename', sessionId, oldPath, newPath),
  sftpUnlink: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-unlink', sessionId, remotePath),
  sftpRmrf: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-rmrf', sessionId, remotePath),
  sftpStat: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-stat', sessionId, remotePath),
  sftpCalculateSize: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-calculate-size', sessionId, remotePath),
  sftpSetAttributes: (
    sessionId: string,
    remotePath: string,
    attrs: { mode?: number; uid?: number; gid?: number },
    options?: { recursive?: boolean; addXToDirectories?: boolean },
  ) => ipcRenderer.invoke('sftp-set-attributes', sessionId, remotePath, attrs, options),
  sftpFindFiles: (
    sessionId: string,
    options: {
      rootPath: string
      pattern: string
      recursive: boolean
      caseSensitive: boolean
      filesOnly: boolean
      foldersOnly: boolean
    },
    operationId: string,
  ) => ipcRenderer.invoke('sftp-find-files', sessionId, options, operationId),
  sftpFindCancel: (sessionId: string) => ipcRenderer.invoke('sftp-find-cancel', sessionId),
  sftpDownloadSaveDialog: (sessionId: string, remotePath: string, operationId: string) =>
    ipcRenderer.invoke('sftp-download-save-dialog', sessionId, remotePath, operationId),
  sftpDownloadToPath: (
    sessionId: string,
    remotePath: string,
    localPath: string,
    operationId: string,
    localRoot?: string,
  ) =>
    ipcRenderer.invoke('sftp-download-to-path', sessionId, remotePath, localPath, operationId, localRoot),
  sftpUploadFromLocal: (
    sessionId: string,
    localPath: string,
    remotePath: string,
    operationId: string,
    localRoot?: string,
  ) =>
    ipcRenderer.invoke('sftp-upload-from-local', sessionId, localPath, remotePath, operationId, localRoot),
  sftpCopyRemoteFile: (sessionId: string, remoteSrc: string, remoteDest: string, operationId: string) =>
    ipcRenderer.invoke('sftp-copy-remote-file', sessionId, remoteSrc, remoteDest, operationId),
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
        vendor: ReaderVendor
        vendorLabel: string
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

  onSftpFindProgress: (
    callback: (payload: {
      operationId: string
      scannedDirs: number
      matchCount: number
      currentDir: string
      limitReached?: boolean
    }) => void,
  ) => {
    const handler = (
      _e: unknown,
      payload: {
        operationId: string
        scannedDirs: number
        matchCount: number
        currentDir: string
        limitReached?: boolean
      },
    ) => callback(payload)
    ipcRenderer.on('sftp-find-progress', handler)
    return () => ipcRenderer.removeListener('sftp-find-progress', handler)
  },

  onSftpFindMatch: (
    callback: (payload: {
      operationId: string
      match: {
        path: string
        name: string
        type: 'file' | 'folder'
        size?: number
        mtime?: number
      }
    }) => void,
  ) => {
    const handler = (
      _e: unknown,
      payload: {
        operationId: string
        match: {
          path: string
          name: string
          type: 'file' | 'folder'
          size?: number
          mtime?: number
        }
      },
    ) => callback(payload)
    ipcRenderer.on('sftp-find-match', handler)
    return () => ipcRenderer.removeListener('sftp-find-match', handler)
  },

  safeStoreSet: (key: string, value: string) => ipcRenderer.invoke('safe-store-set', key, value),
  safeStoreGet: (key: string) => ipcRenderer.invoke('safe-store-get', key),
  safeStoreDelete: (key: string) => ipcRenderer.invoke('safe-store-delete', key),

  installRegistryGetStatus: () => ipcRenderer.invoke('install-registry-get-status'),
  installRegistrySetEnabled: (enabled: boolean) => ipcRenderer.invoke('install-registry-set-enabled', enabled),
  installRegistrySendNow: () => ipcRenderer.invoke('install-registry-send-now'),

  adminLogin: (username: string, password: string) =>
    ipcRenderer.invoke('admin-login', username, password) as Promise<{ ok: boolean; error?: string }>,
  adminLogout: () => ipcRenderer.invoke('admin-logout') as Promise<{ ok: boolean }>,
  adminIsAuthenticated: () =>
    ipcRenderer.invoke('admin-is-authenticated') as Promise<{ ok: boolean }>,

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

  logAggregatorPickZip: () => ipcRenderer.invoke('log-aggregator-pick-zip'),
  logAggregatorPickOutput: () => ipcRenderer.invoke('log-aggregator-pick-output'),
  logAggregatorRun: (zipPath: string, outputDir: string) =>
    ipcRenderer.invoke('log-aggregator-run', zipPath, outputDir),
  logAggregatorShowOutput: (outputDir: string) =>
    ipcRenderer.invoke('log-aggregator-show-output', outputDir),
  onLogAggregatorProgress: (
    callback: (progress: {
      phase: 'extract' | 'organize' | 'aggregate' | 'done'
      message: string
      current?: number
      total?: number
    }) => void,
  ) => {
    const handler = (_e: unknown, progress: Parameters<typeof callback>[0]) => callback(progress)
    ipcRenderer.on('log-aggregator-progress', handler)
    return () => ipcRenderer.removeListener('log-aggregator-progress', handler)
  },

  // Pop-out windows (multi-window)
  popoutGetWindowInfo: () =>
    ipcRenderer.invoke('popout-get-window-info') as Promise<{
      role: 'main' | 'popout' | 'unknown'
      tabId: string | null
      poppedTabs: string[]
    }>,
  popoutOpen: (tabId: string, title: string, initState: { tabId: string; state: Record<string, unknown>; isAdmin?: boolean }) =>
    ipcRenderer.invoke('popout-open', tabId, title, initState) as Promise<{ ok: boolean; focused?: boolean }>,
  popoutDock: (tabId: string) =>
    ipcRenderer.invoke('popout-dock', tabId) as Promise<{ ok: boolean }>,
  popoutGetInitState: () =>
    ipcRenderer.invoke('popout-get-init-state') as Promise<{
      tabId: string
      state: Record<string, unknown>
      isAdmin?: boolean
    } | null>,
  popoutList: () => ipcRenderer.invoke('popout-list') as Promise<string[]>,
  onPopoutClosed: (callback: (tabId: string) => void) => {
    const handler = (_e: unknown, tabId: string) => callback(tabId)
    ipcRenderer.on('popout-closed', handler)
    return () => ipcRenderer.removeListener('popout-closed', handler)
  },
  popoutBroadcastState: (state: Record<string, unknown>, connected: boolean) =>
    ipcRenderer.send('popout-broadcast-state', state, connected),
  onPopoutStateUpdate: (callback: (state: Record<string, unknown>, connected: boolean) => void) => {
    const handler = (_e: unknown, state: Record<string, unknown>, connected: boolean) =>
      callback(state, connected)
    ipcRenderer.on('popout-state-update', handler)
    return () => ipcRenderer.removeListener('popout-state-update', handler)
  },
})

