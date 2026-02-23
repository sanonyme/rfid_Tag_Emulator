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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

