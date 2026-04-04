export type NetScanStartPayload =
  | { mode: 'cidr'; cidr: string; concurrency?: number }
  | { mode: 'range'; start: string; end: string; concurrency?: number }
  | { mode: 'allSubnets'; concurrency?: number }

export interface ElectronAPI {
  platform: string
  minimize: () => void
  maximize: () => void
  close: () => void
  
  // TCP Emulator
  tcpConnect: (host: string, port: number) => void
  tcpDisconnect: () => void
  tcpSendTags: (tags: any[], driverCode: string, delayMs: number) => void
  tcpCancelSend: () => void
  tcpIsConnected: () => Promise<boolean>
  
  // TCP Events
  onTcpConnected: (callback: (message: string) => void) => void
  onTcpDisconnected: (callback: (message: string) => void) => void
  onTcpError: (callback: (message: string) => void) => void
  onTcpProgress: (callback: (message: string) => void) => void
  onTcpComplete: (callback: (message: string) => void) => void
  
  // Handheld Server (multi-port)
  handheldStart: (port: number) => void
  handheldStop: (port: number) => void
  handheldSendEpcs: (port: number, tags: any[], delayMs: number) => void
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

  // ADAM Module
  adamConnect: (host: string, port: number) => void
  adamDisconnect: () => void
  adamSetDO: (coil: number, value: boolean) => void
  adamReadDIs: (start: number, count: number) => void
  adamSetDIInvert: (mask: number, registerAddress?: number) => void
  onAdamConnected: (callback: (message: string) => void) => void
  onAdamDisconnected: (callback: (message: string) => void) => void
  onAdamError: (callback: (message: string) => void) => void
  onAdamDataDI: (callback: (data: { start: number, values: boolean[] }) => void) => void
  onAdamWriteSuccess: (callback: (message: string) => void) => void

  // Auto Updater
  checkForUpdate: () => void
  startDownload: () => void
  quitAndInstall: () => void
  onCheckingForUpdate: (callback: () => void) => void
  onUpdateAvailable: (callback: (info: any) => void) => void
  onUpdateNotAvailable: (callback: (info: any) => void) => void
  onUpdateError: (callback: (message: string) => void) => void
  onDownloadProgress: (callback: (progress: any) => void) => void
  onUpdateDownloaded: (callback: (info: any) => void) => void

  // ALE API
  aleRequest: (url: string, options: any) => Promise<{ 
    ok: boolean, 
    status: number, 
    statusText: string, 
    data: string | null,
    headers?: Record<string, string>
  }>

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
  dbGetTables: (database: string) => Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }>
  dbGetTableData: (
    database: string,
    table: string,
    limit?: number,
    offset?: number
  ) => Promise<
    | { ok: true; columns: string[]; rows: any[]; total: number; columnTypes: Record<string, string> }
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

  // SFTP (Electron main / ssh2)
  sftpConnect: (
    host: string,
    port: number,
    username: string,
    password: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpDisconnect: () => Promise<void>
  sftpReaddir: (
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
    remotePath: string
  ) => Promise<
    | { ok: true; text: string; isBinary: false; size: number }
    | { ok: true; isBinary: true; size: number; previewBase64: string }
    | { ok: false; error: string }
  >
  sftpWriteFile: (
    remotePath: string,
    base64Data: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpWriteTextFile: (
    remotePath: string,
    text: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpMkdir: (remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpRename: (oldPath: string, newPath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpUnlink: (remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpRmrf: (remotePath: string) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpDownloadSaveDialog: (
    remotePath: string,
    operationId: string,
  ) => Promise<
    | { ok: true; localPath: string }
    | { ok: false; error: string; cancelled?: boolean }
  >
  sftpDownloadToPath: (
    remotePath: string,
    localPath: string,
    operationId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpUploadFromLocal: (
    localPath: string,
    remotePath: string,
    operationId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  sftpCopyRemoteFile: (
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
      hostname?: string
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

