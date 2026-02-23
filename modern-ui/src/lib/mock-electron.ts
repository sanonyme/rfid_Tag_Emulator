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
    start: ((port: number, message: string) => void)[],
    stop: ((port: number, message: string) => void)[],
    error: ((port: number, message: string) => void)[],
    progress: ((port: number, message: string) => void)[],
    complete: ((port: number, message: string) => void)[]
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

  private _customCallbacks: {
    success: ((message: string) => void)[],
    error: ((message: string) => void)[]
  } = {
    success: [],
    error: []
  };

  private _adamCallbacks: {
    connected: ((message: string) => void)[],
    disconnected: ((message: string) => void)[],
    dataDI: ((data: { start: number, values: boolean[] }) => void)[],
    writeSuccess: ((message: string) => void)[],
    error: ((message: string) => void)[]
  } = {
    connected: [],
    disconnected: [],
    dataDI: [],
    writeSuccess: [],
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

  // Handheld Server (multi-port)
  handheldStart(port: number = 10472) {
    console.log(`Mock: Starting Handheld Server on port ${port}...`);
    setTimeout(() => {
      this._handheldRunning = true;
      this._triggerHandheld(this._handheldCallbacks.start, port, `Handheld server started on port ${port}`);
    }, 1000);
  }

  handheldStop(port: number = 10472) {
    console.log(`Mock: Stopping Handheld Server on port ${port}...`);
    setTimeout(() => {
      this._handheldRunning = false;
      this._triggerHandheld(this._handheldCallbacks.stop, port, 'Handheld server stopped');
    }, 500);
  }

  handheldSendEpcs(port: number, tags: any[], delayMs: number) {
    console.log(`Mock: Sending ${tags.length} EPCs to handheld on port ${port} with delay ${delayMs}`);
    let count = 0;
    const interval = setInterval(() => {
      const currentTag = tags[count];
      count++;
      this._triggerHandheld(this._handheldCallbacks.progress, port, `Sent EPC ${count}/${tags.length} to 1 client(s): ${currentTag.epc}`);
      console.log(`Mock: Sent EPC ${count}/${tags.length}:`, currentTag);
      
      if (count >= tags.length) {
        clearInterval(interval);
        this._triggerHandheld(this._handheldCallbacks.complete, port, 'All EPCs sent successfully');
      }
    }, Math.max(delayMs, 100));
  }

  async handheldIsRunning(_port: number = 10472) {
    return this._handheldRunning;
  }

  handheldCancelSend(port: number = 10472) {
    console.log('Mock: Cancel handheld send');
    this._triggerHandheld(this._handheldCallbacks.error, port, 'Send cancelled');
  }

  // Handheld Events - callback receives (port, message)
  onHandheldStarted(callback: (port: number, message: string) => void) { this._handheldCallbacks.start.push(callback); }
  onHandheldStopped(callback: (port: number, message: string) => void) { this._handheldCallbacks.stop.push(callback); }
  onHandheldError(callback: (port: number, message: string) => void) { this._handheldCallbacks.error.push(callback); }
  onHandheldProgress(callback: (port: number, message: string) => void) { this._handheldCallbacks.progress.push(callback); }
  onHandheldComplete(callback: (port: number, message: string) => void) { this._handheldCallbacks.complete.push(callback); }

  // OCR
  ocrSend(host: string, message: string) {
    console.log(`Mock: Sending OCR to ${host}: ${message}`);
    setTimeout(() => {
      this._trigger(this._ocrCallbacks.success, `OCR data sent successfully to ${host}: ${message}`);
    }, 800);
  }

  onOcrSuccess(callback: (message: string) => void) { this._ocrCallbacks.success.push(callback); }
  onOcrError(callback: (message: string) => void) { this._ocrCallbacks.error.push(callback); }

  // Custom Message
  customSend(host: string, port: number, message: string) {
    console.log(`Mock: Sending Custom message to ${host}:${port}: ${message}`);
    setTimeout(() => {
      this._trigger(this._customCallbacks.success, `Custom data sent successfully to ${host}:${port}: ${message}`);
    }, 800);
  }

  onCustomSuccess(callback: (message: string) => void) { this._customCallbacks.success.push(callback); }
  onCustomError(callback: (message: string) => void) { this._customCallbacks.error.push(callback); }

  // ADAM Module
  adamConnect(host: string, port: number) {
    console.log(`Mock: Connecting to ADAM at ${host}:${port}`);
    setTimeout(() => {
        this._trigger(this._adamCallbacks.connected, `Connected to ${host}:${port}`);
    }, 1000);
  }

  adamDisconnect() {
    console.log('Mock: Disconnecting ADAM');
    setTimeout(() => {
        this._trigger(this._adamCallbacks.disconnected, 'Disconnected');
    }, 500);
  }

  adamSetDO(coil: number, value: boolean) {
    console.log(`Mock: Set DO ${coil} to ${value}`);
    setTimeout(() => {
        this._trigger(this._adamCallbacks.writeSuccess, `Written DO ${coil} to ${value}`);
    }, 200);
  }

  adamReadDIs(start: number, count: number) {
    const values = Array(count).fill(false).map(() => Math.random() > 0.5);
    this._adamCallbacks.dataDI.forEach(cb => cb({ start, values }));
  }

  adamSetDIInvert(mask: number, _registerAddress?: number) {
    console.log(`Mock: Set DI invert mask=0x${mask.toString(16)}`);
    setTimeout(() => {
      this._trigger(this._adamCallbacks.writeSuccess, `DI invert mask set to 0x${mask.toString(16)}`);
    }, 100);
  }

  onAdamConnected(callback: (message: string) => void) { this._adamCallbacks.connected.push(callback); }
  onAdamDisconnected(callback: (message: string) => void) { this._adamCallbacks.disconnected.push(callback); }
  onAdamError(callback: (message: string) => void) { this._adamCallbacks.error.push(callback); }
  onAdamDataDI(callback: (data: { start: number, values: boolean[] }) => void) { this._adamCallbacks.dataDI.push(callback); }
  onAdamWriteSuccess(callback: (message: string) => void) { this._adamCallbacks.writeSuccess.push(callback); }

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

  private _triggerHandheld(callbacks: ((port: number, message: string) => void)[], port: number, message: string) {
    callbacks.forEach(cb => cb(port, message));
  }
}

export function initMockElectron() {
  if (!window.electronAPI) {
    console.warn('Electron API not found. Initializing Mock API for browser/documentation mode.');
    window.electronAPI = new MockElectronAPI();
  }
}
