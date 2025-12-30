import { ElectronAPI } from '../types/electron';

class MockElectronAPI implements ElectronAPI {
  platform = 'win32'; // Mock platform

  // State
  private _tcpConnected = false;
  private _handheldRunning = false;
  private _tcpCallbacks: {
    connect: ((message: string) => void)[],
    disconnect: ((message: string) => void)[],
    error: ((message: string) => void)[],
    progress: ((message: string) => void)[],
    complete: ((message: string) => void)[]
  } = {
    connect: [],
    disconnect: [],
    error: [],
    progress: [],
    complete: []
  };

  private _handheldCallbacks: {
    start: ((message: string) => void)[],
    stop: ((message: string) => void)[],
    error: ((message: string) => void)[],
    progress: ((message: string) => void)[],
    complete: ((message: string) => void)[]
  } = {
    start: [],
    stop: [],
    error: [],
    progress: [],
    complete: []
  };

  private _ocrCallbacks: {
    success: ((message: string) => void)[],
    error: ((message: string) => void)[]
  } = {
    success: [],
    error: []
  };

  // Window controls
  minimize() { console.log('Mock: minimize'); }
  maximize() { console.log('Mock: maximize'); }
  close() { console.log('Mock: close'); }

  // TCP Emulator
  tcpConnect(host: string, port: number) {
    console.log(`Mock: Connecting to ${host}:${port}...`);
    setTimeout(() => {
      this._tcpConnected = true;
      this._trigger(this._tcpCallbacks.connect, `Connected to ${host}:${port}`);
    }, 1000);
  }

  tcpDisconnect() {
    console.log('Mock: Disconnecting...');
    setTimeout(() => {
      this._tcpConnected = false;
      this._trigger(this._tcpCallbacks.disconnect, 'Disconnected');
    }, 500);
  }

  tcpSendTags(tags: any[], driverCode: string, delayMs: number) {
    console.log(`Mock: Sending ${tags.length} tags with driver ${driverCode} and delay ${delayMs}`);
    let count = 0;
    const interval = setInterval(() => {
      const currentTag = tags[count];
      count++;
      this._trigger(this._tcpCallbacks.progress, `Sent tag ${count}/${tags.length}: ${currentTag.epc}`);
      console.log(`Mock: Sent tag ${count}/${tags.length}:`, currentTag);
      
      if (count >= tags.length) {
        clearInterval(interval);
        this._trigger(this._tcpCallbacks.complete, 'All tags sent successfully');
      }
    }, Math.max(delayMs, 100)); // Minimum 100ms for visibility
  }

  tcpCancelSend() {
    console.log('Mock: Cancel send');
    this._trigger(this._tcpCallbacks.error, 'Send cancelled by user');
  }

  async tcpIsConnected() {
    return this._tcpConnected;
  }

  // TCP Events
  onTcpConnected(callback: (message: string) => void) { this._tcpCallbacks.connect.push(callback); }
  onTcpDisconnected(callback: (message: string) => void) { this._tcpCallbacks.disconnect.push(callback); }
  onTcpError(callback: (message: string) => void) { this._tcpCallbacks.error.push(callback); }
  onTcpProgress(callback: (message: string) => void) { this._tcpCallbacks.progress.push(callback); }
  onTcpComplete(callback: (message: string) => void) { this._tcpCallbacks.complete.push(callback); }

  // Handheld Server
  handheldStart() {
    console.log('Mock: Starting Handheld Server...');
    setTimeout(() => {
      this._handheldRunning = true;
      this._trigger(this._handheldCallbacks.start, 'Handheld server started on port 3000');
    }, 1000);
  }

  handheldStop() {
    console.log('Mock: Stopping Handheld Server...');
    setTimeout(() => {
      this._handheldRunning = false;
      this._trigger(this._handheldCallbacks.stop, 'Handheld server stopped');
    }, 500);
  }

  handheldSendEpcs(tags: any[], delayMs: number) {
    console.log(`Mock: Sending ${tags.length} EPCs to handheld clients with delay ${delayMs}`);
    let count = 0;
    const interval = setInterval(() => {
      const currentTag = tags[count];
      count++;
      this._trigger(this._handheldCallbacks.progress, `Sent EPC ${count}/${tags.length} to 1 client(s): ${currentTag.epc}`);
      console.log(`Mock: Sent EPC ${count}/${tags.length}:`, currentTag);
      
      if (count >= tags.length) {
        clearInterval(interval);
        this._trigger(this._handheldCallbacks.complete, 'All EPCs sent successfully');
      }
    }, Math.max(delayMs, 100));
  }

  async handheldIsRunning() {
    return this._handheldRunning;
  }

  handheldCancelSend() {
    console.log('Mock: Cancel handheld send');
    this._trigger(this._handheldCallbacks.error, 'Send cancelled');
  }

  // Handheld Events
  onHandheldStarted(callback: (message: string) => void) { this._handheldCallbacks.start.push(callback); }
  onHandheldStopped(callback: (message: string) => void) { this._handheldCallbacks.stop.push(callback); }
  onHandheldError(callback: (message: string) => void) { this._handheldCallbacks.error.push(callback); }
  onHandheldProgress(callback: (message: string) => void) { this._handheldCallbacks.progress.push(callback); }
  onHandheldComplete(callback: (message: string) => void) { this._handheldCallbacks.complete.push(callback); }

  // OCR
  ocrSend(host: string, message: string) {
    console.log(`Mock: Sending OCR to ${host}: ${message}`);
    setTimeout(() => {
      this._trigger(this._ocrCallbacks.success, `OCR data sent successfully to ${host}: ${message}`);
    }, 800);
  }

  onOcrSuccess(callback: (message: string) => void) { this._ocrCallbacks.success.push(callback); }
  onOcrError(callback: (message: string) => void) { this._ocrCallbacks.error.push(callback); }

  // Auto Updater
  checkForUpdate() { console.log('Mock: checkForUpdate'); }
  startDownload() { console.log('Mock: startDownload'); }
  quitAndInstall() { console.log('Mock: quitAndInstall'); }
  onCheckingForUpdate(_callback: () => void) { console.log('Mock: onCheckingForUpdate registered'); }
  onUpdateAvailable(_callback: (info: any) => void) { console.log('Mock: onUpdateAvailable registered'); }
  onUpdateNotAvailable(_callback: (info: any) => void) { console.log('Mock: onUpdateNotAvailable registered'); }
  onUpdateError(_callback: (message: string) => void) { console.log('Mock: onUpdateError registered'); }
  onDownloadProgress(_callback: (progress: any) => void) { console.log('Mock: onDownloadProgress registered'); }
  onUpdateDownloaded(_callback: (info: any) => void) { console.log('Mock: onUpdateDownloaded registered'); }

  // ALE API
  async aleRequest(url: string, options: any) {
    console.log('Mock: aleRequest', url, options);
    return { ok: true, status: 200, statusText: 'OK', data: '{}' };
  }

  // Helper
  private _trigger(callbacks: ((message: string) => void)[], message: string) {
    callbacks.forEach(cb => cb(message));
  }
}

export function initMockElectron() {
  if (!window.electronAPI) {
    console.warn('Electron API not found. Initializing Mock API for browser/documentation mode.');
    window.electronAPI = new MockElectronAPI();
  }
}

