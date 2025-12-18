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
  
  // Handheld Server
  handheldStart: () => void
  handheldStop: () => void
  handheldSendEpcs: (tags: any[], delayMs: number) => void
  handheldIsRunning: () => Promise<boolean>
  handheldCancelSend: () => void
  
  // Handheld Events
  onHandheldStarted: (callback: (message: string) => void) => void
  onHandheldStopped: (callback: (message: string) => void) => void
  onHandheldError: (callback: (message: string) => void) => void
  onHandheldProgress: (callback: (message: string) => void) => void
  onHandheldComplete: (callback: (message: string) => void) => void
  
  // OCR
  ocrSend: (host: string, message: string) => void
  onOcrSuccess: (callback: (message: string) => void) => void
  onOcrError: (callback: (message: string) => void) => void

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

