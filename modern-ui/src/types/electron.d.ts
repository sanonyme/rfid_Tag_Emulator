export type InstallRegistryPayload = {
  machineId: string
  macAddress: string | null
  version: string
  os: string
  arch: string
}

export type InstallRegistryStatus = {
  enabled: boolean
  endpoint: string | null
  lastSentAt: number | null
  sendNowAfterMs: number
  lastSentStatus: 'success' | 'error' | 'disabled' | 'skipped' | null
  lastSentError: string | null
  hasToken: boolean
  nextPayload: InstallRegistryPayload
}

export type InstallRegistrySendResult = {
  status: 'success' | 'error' | 'disabled' | 'skipped'
  error?: string
  sendNowAfterMs?: number
  payload?: InstallRegistryPayload
}

export type NetScanStartPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number }
  | { mode: 'allSubnets'; concurrency?: number }

export type ReaderDiscoveryPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number; timeoutMs?: number }
  | { mode: 'allSubnets'; concurrency?: number; timeoutMs?: number }

export type ReaderVendor =
  | 'impinj'
  | 'zebra'
  | 'alien'
  | 'thingmagic'
  | 'caen'
  | 'nordicid'
  | 'honeywell'
  | 'sick'
  | 'feig'
  | 'kathrein'
  | 'csl'
  | 'invengo'
  | 'nedap'
  | 'turck'
  | 'balluff'
  | 'seuic'
  | 'siemens'
  | 'chainway'
  | 'bluebird'
  | 'chafon'
  | 'datalogic'
  | 'generic'
  | 'unknown'

export interface ElectronAPI {
  platform: string
  minimize: () => void
  maximize: () => void
  close: () => void
  
  // TCP Emulator
  tcpConnect: (host: string, port: number) => Promise<{ ok: boolean; message?: string; error?: string }>
  tcpDisconnect: () => void
  tcpSendTags: (tags: any[], driverCode: string, delayMs: number) => void
  tcpCancelSend: () => void
  tcpIsConnected: () => Promise<boolean>
  /** PNG as base64 from Labelary (main-process fetch; avoids renderer CORS on file://). */
  labelaryRender: (zpl: string, dpmm: number, widthIn: number, heightIn: number) => Promise<string>

  // TCP Events
  onTcpConnected: (callback: (message: string) => void) => void
  onTcpDisconnected: (callback: (message: string) => void) => void
  onTcpError: (callback: (message: string) => void) => void
  onTcpProgress: (callback: (message: string) => void) => void
  onTcpComplete: (callback: (message: string) => void) => void
  
  // Handheld Server (multi-port)
  handheldStart: (port: number) => void
  handheldStop: (port: number) => void
  handheldSendEpcs: (port: number, tags: any[], delayMs: number, verboseProgress?: boolean) => void
  handheldSendRecipe: (port: number, recipe: import('@/lib/handheld-tag-iterate').HandheldSendRecipe, delayMs: number, verboseProgress?: boolean) => void
  handheldIsRunning: (port: number) => Promise<boolean>
  handheldCancelSend: (port: number) => void
  
  // Handheld Events - callback receives (port, message)
  onHandheldStarted: (callback: (port: number, message: string) => void) => void
  onHandheldStopped: (callback: (port: number, message: string) => void) => void
  onHandheldError: (callback: (port: number, message: string) => void) => void
  onHandheldProgress: (callback: (port: number, message: string) => void) => void
  onHandheldComplete: (callback: (port: number, message: string) => void) => void
  
  // OCR
  ocrSend: (host: string, message: string) => void
  onOcrSuccess: (callback: (message: string) => void) => void
  onOcrError: (callback: (message: string) => void) => void

  // Custom Message
  customSend: (host: string, port: number, message: string) => void
  onCustomSuccess: (callback: (message: string) => void) => void
  onCustomError: (callback: (message: string) => void) => void

  // Auto Updater
  checkForUpdate: () => void
  startDownload: () => void
  quitAndInstall: () => void
  /** Default true. When true, updates download automatically after a check finds one. */
  getAutoUpdateEnabled: () => Promise<boolean>
  setAutoUpdateEnabled: (enabled: boolean) => Promise<boolean>
  onCheckingForUpdate: (callback: () => void) => void
  onUpdateAvailable: (callback: (info: any) => void) => void
  onUpdateNotAvailable: (callback: (info: any) => void) => void
  onUpdateError: (callback: (message: string) => void) => void
  onDownloadProgress: (callback: (progress: any) => void) => void
  onUpdateDownloaded: (callback: (info: any) => void) => void

  // ALE API
  aleGetCredentialMeta: () => Promise<
    { ok: true; username: string; passwordIsHashed: boolean } | { ok: false }
  >
  aleGetBasicAuthHeader: () => Promise<
    { ok: true; username: string; header: string } | { ok: false; error?: string }
  >
  aleRequest: (url: string, options: any) => Promise<{
    ok: boolean, 
    status: number, 
    statusText: string, 
    data: string | null,
    headers?: Record<string, string>
  }>
  aleRequestBatch: (requests: { url: string; options?: Record<string, unknown> }[]) => Promise<{
    ok: boolean
    status: number
    statusText: string
    data: string | null
    headers?: Record<string, string>
  }[]>

  // Inditex API (header/key persisted in userData)
  getApiConfig: () => Promise<{ headerName: string; key: string }>
  saveApiConfig: (headerName: string, key: string) => Promise<void>
  itxApiRequest: (url: string, body: string) => Promise<{
    ok: boolean
    status: number
    statusText: string
    data: string | null
    headers?: Record<string, string>
  }>

  // Database
  dbConnect: (host: string, user: string, password: string) => Promise<{ ok: true; databases: string[] } | { ok: false; error: string }>
  dbDisconnect: () => Promise<void>
  dbListDatabases: () => Promise<{ ok: true; databases: string[] } | { ok: false; error: string }>
  dbGetTables: (database: string) => Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }>
  dbGetTableData: (
    database: string,
    table: string,
    limit?: number,
    offset?: number
  ) => Promise<
    | { ok: true; columns: string[]; rows: any[]; total: number; columnTypes: Record<string, string>; primaryKeys: string[] }
    | { ok: false; error: string }
  >
  dbExecuteQuery: (query: string, database?: string) => Promise<{ ok: true; columns: string[]; rows: any[]; affectedRows?: number; message?: string } | { ok: false; error: string }>
  dbGetPrimaryKeys: (database: string, table: string) => Promise<string[]>
  dbUpdateCell: (database: string, table: string, primaryKeys: Record<string, any>, column: string, value: any) => Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }>
  dbGetTableStructure: (
    database: string,
    table: string
  ) => Promise<
    | {
        ok: true
        columns: {
          name: string
          type: string
          nullable: boolean
          defaultValue: string | null
          key: string
          extra: string
          comment: string
        }[]
      }
    | { ok: false; error: string }
  >
  dbDeleteRow: (
    database: string,
    table: string,
    primaryKeys: Record<string, any>
  ) => Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }>
  dbInsertRow: (
    database: string,
    table: string,
    values: Record<string, any>
  ) => Promise<{ ok: true; insertId: any } | { ok: false; error: string }>
  dbDeleteRows: (
    database: string,
    table: string,
    rows: Record<string, any>[]
  ) => Promise<{ ok: true; affectedRows: number } | { ok: false; error: string }>
  dbExportTable: (
    database: string,
    table: string
  ) => Promise<{ ok: true; columns: string[]; rows: any[]; total: number } | { ok: false; error: string }>
  dbImportRows: (
    database: string,
    table: string,
    rows: Record<string, any>[]
  ) => Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }>
  dbGetDatabaseSchema: (
    database: string
  ) => Promise<
    | {
        ok: true
        tables: { name: string; columns: { name: string; type: string; key: string }[] }[]
        foreignKeys: {
          constraintName: string
          childTable: string
          childColumns: string[]
          parentTable: string
          parentColumns: string[]
        }[]
      }
    | { ok: false; error: string }
  >

  safeStoreSet: (key: string, value: string) => Promise<boolean>
  safeStoreGet: (key: string) => Promise<string | null>
  safeStoreDelete: (key: string) => Promise<void>

  installRegistryGetStatus: () => Promise<InstallRegistryStatus>
  installRegistrySetEnabled: (enabled: boolean) => Promise<boolean>
  installRegistrySendNow: () => Promise<InstallRegistrySendResult>

  adminLogin: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  adminLogout: () => Promise<{ ok: boolean }>
  adminIsAuthenticated: () => Promise<{ ok: boolean }>

  // SFTP (Electron main / ssh2, multi-session)
  sftpConnect: (
    host: string,
    port: number,
    username: string,
    password: string
  ) => Promise<{ ok: true; sessionId: string } | { ok: false; error: string }>
  sftpDisconnect: (sessionId: string) => Promise<void>
  sftpReaddir: (
    sessionId: string,
    remotePath: string
  ) => Promise<
    | {
        ok: true
        entries: {
          name: string
          type: 'file' | 'folder'
          size?: number
          mtime?: number
          mode?: number
          uid?: number
          gid?: number
        }[]
      }
    | { ok: false; error: string }
  >
  sftpReadFile: (
    sessionId: string,
    remotePath: string
  ) => Promise<
    | { ok: true; text: string; isBinary: false; size: number }
    | { ok: true; isBinary: true; size: number; previewBase64: string }
    | { ok: false; error: string }
  >
  sftpWriteFile: (
    sessionId: string,
    remotePath: string,
    base64Data: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpWriteTextFile: (
    sessionId: string,
    remotePath: string,
    text: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpMkdir: (sessionId: string, remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpRename: (
    sessionId: string,
    oldPath: string,
    newPath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpUnlink: (sessionId: string, remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpRmrf: (sessionId: string, remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpStat: (
    sessionId: string,
    remotePath: string,
  ) => Promise<
    | {
        ok: true
        stat: {
          path: string
          isDirectory: boolean
          size: number
          mode: number
          uid: number
          gid: number
          mtime?: number
        }
      }
    | { ok: false; error: string }
  >
  sftpCalculateSize: (
    sessionId: string,
    remotePath: string,
  ) => Promise<{ ok: true; size: number; fileCount: number } | { ok: false; error: string }>
  sftpSetAttributes: (
    sessionId: string,
    remotePath: string,
    attrs: { mode?: number; uid?: number; gid?: number },
    options?: { recursive?: boolean; addXToDirectories?: boolean },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
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
  ) => Promise<
    | { ok: true; matchCount: number; cancelled: boolean; limitReached?: boolean }
    | { ok: false; error: string }
  >
  sftpFindCancel: (sessionId: string) => Promise<void>
  sftpDownloadSaveDialog: (
    sessionId: string,
    remotePath: string,
    operationId: string,
  ) => Promise<
    | { ok: true; localPath: string }
    | { ok: false; error: string; cancelled?: boolean }
  >
  sftpDownloadToPath: (
    sessionId: string,
    remotePath: string,
    localPath: string,
    operationId: string,
    localRoot?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpUploadFromLocal: (
    sessionId: string,
    localPath: string,
    remotePath: string,
    operationId: string,
    localRoot?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpCopyRemoteFile: (
    sessionId: string,
    remoteSrc: string,
    remoteDest: string,
    operationId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  localPickFolder: () => Promise<{ ok: true; path: string } | { ok: false; cancelled?: boolean }>
  localReaddir: (
    root: string,
    dirPath: string,
  ) => Promise<
    | {
        ok: true
        entries: {
          name: string
          type: 'file' | 'folder'
          size?: number
          mtime?: number
          mode?: number
        }[]
      }
    | { ok: false; error: string }
  >
  onSftpTransferProgress: (
    callback: (payload: { operationId: string; loaded: number; total: number }) => void,
  ) => () => void
  onSftpFindProgress: (
    callback: (payload: {
      operationId: string
      scannedDirs: number
      matchCount: number
      currentDir: string
      limitReached?: boolean
    }) => void,
  ) => () => void
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
  ) => () => void
  localWriteFileBase64: (
    root: string,
    filePath: string,
    base64Data: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  localPathParent: (
    root: string,
    cwd: string,
  ) => Promise<
    { ok: true; parent: string | null } | { ok: false; error: string }
  >

  // UDP Edge Discovery
  udpDiscoveryStart: (
    localPort: number,
    listenDurationMs: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  udpDiscoveryStop: () => Promise<{ ok: true }>
  udpDiscoverySendProbe: (
    targetIp: string,
    targetPort: number,
    message: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  udpDiscoveryIsRunning: () => Promise<boolean>
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
  ) => () => void
  onUdpDiscoveryRaw: (
    callback: (payload: { data: string; from: string; fromPort: number; timestamp: number }) => void,
  ) => () => void
  onUdpDiscoveryStarted: (callback: (payload: { port: number }) => void) => () => void
  onUdpDiscoveryStopped: (callback: (payload: { reason: string }) => void) => () => void
  onUdpDiscoveryError: (callback: (payload: { message: string }) => void) => () => void
  readerDiscoveryStart: (
    payload: ReaderDiscoveryPayload,
  ) => Promise<{ ok: true; total: number } | { ok: false; error: string }>
  readerDiscoveryCancel: () => Promise<{ ok: true }>
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
  ) => () => void
  onReaderDiscoveryDone: (callback: (payload: { total: number; found: number }) => void) => () => void
  onReaderDiscoveryError: (callback: (payload: { message: string }) => void) => () => void

  netScanGetInterfaces: () => Promise<{
    ok: true
    interfaces: {
      name: string
      address: string
      netmask: string
      cidr: number
      networkCidr: string
    }[]
  }>
  netScanStart: (
    payload: NetScanStartPayload,
  ) => Promise<{ ok: true; total: number } | { ok: false; error: string }>
  netScanCancel: () => Promise<{ ok: true }>
  onNetScanHost: (
    callback: (payload: {
      ip: string
      alive: boolean
      hostname?: string | null
      done: number
      total: number
    }) => void,
  ) => () => void
  onNetScanDone: (callback: (payload: { total: number }) => void) => () => void
  onNetScanError: (callback: (payload: { message: string }) => void) => () => void

  // Admin Shell (multi-tab: sessionId required)
  shellStart?: (sessionId: string, cols?: number, rows?: number) => void
  shellWrite?: (sessionId: string, data: string) => void
  shellKill?: (sessionId: string) => void
  shellResize?: (sessionId: string, cols: number, rows: number) => void
  onShellData?: (callback: (sessionId: string, data: string) => void) => () => void
  onShellExit?: (callback: (sessionId: string, code: number | null, signal: string | null) => void) => () => void

  logAggregatorPickZip?: () => Promise<
    | { ok: true; path: string }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >
  logAggregatorPickOutput?: () => Promise<
    | { ok: true; path: string }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >
  logAggregatorRun?: (
    zipPath: string,
    outputDir: string,
  ) => Promise<
    | import('./log-aggregator').LogAggregatorResult
    | { ok: false; error: string }
  >
  logAggregatorShowOutput?: (
    outputDir: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  onLogAggregatorProgress?: (
    callback: (progress: import('./log-aggregator').LogAggregatorProgress) => void,
  ) => () => void

  popoutGetWindowInfo?: () => Promise<{
    role: 'main' | 'popout' | 'unknown'
    tabId: string | null
    poppedTabs: string[]
  }>
  popoutOpen?: (
    tabId: string,
    title: string,
    initState: { tabId: string; state: Record<string, unknown>; isAdmin?: boolean },
  ) => Promise<{ ok: boolean; focused?: boolean }>
  popoutDock?: (tabId: string) => Promise<{ ok: boolean }>
  popoutGetInitState?: () => Promise<{
    tabId: string
    state: Record<string, unknown>
    isAdmin?: boolean
  } | null>
  popoutList?: () => Promise<string[]>
  onPopoutClosed?: (callback: (tabId: string) => void) => () => void
  popoutBroadcastState?: (state: Record<string, unknown>, connected: boolean) => void
  onPopoutStateUpdate?: (
    callback: (state: Record<string, unknown>, connected: boolean) => void,
  ) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

