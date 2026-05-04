import { ElectronAPI, type NetScanStartPayload, type ReaderDiscoveryPayload, type ReaderVendor } from '../types/electron';

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

  // TCP Emulator - validate host reachability via HTTP probe (browser can't do raw TCP)
  tcpConnect(host: string, port: number) {
    console.log(`Mock: Validating reachability of ${host}...`);
    const probePorts = [8080, 80, port]; // ALE often on 8080/80; also try the requested port
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const tryProbe = (p: number) =>
      fetch(`http://${host}:${p}/`, {
        method: 'HEAD',
        mode: 'no-cors', // Rejects on connection refused; resolves if host responds
        signal: controller.signal,
        cache: 'no-store',
      });

    const tryAny = async () => {
      for (const p of probePorts) {
        try {
          await tryProbe(p);
          return true;
        } catch {
          /* try next */
        }
      }
      return false;
    };
    tryAny()
      .then((ok) => {
        clearTimeout(timeoutId);
        if (ok) {
          this._tcpConnected = true;
          this._trigger(this._tcpCallbacks.connect, `Connected to ${host}:${port}`);
        } else {
          this._trigger(this._tcpCallbacks.error, `Host ${host} unreachable. Check IP, network, and firewall.`);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        this._trigger(this._tcpCallbacks.error, `Host ${host} unreachable. Check IP, network, and firewall.`);
      });
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
      const rssiRaw = currentTag?.rssi;
      const rssiNum = rssiRaw != null && rssiRaw !== '' ? parseFloat(rssiRaw) : NaN;
      const rssiVal = Number.isFinite(rssiNum) ? rssiNum : 70;
      this._triggerHandheld(this._handheldCallbacks.progress, port, `Sent (${count}/${tags.length}): ${currentTag.epc} @rssi=${rssiVal}`);
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

  // OCR - use proxy when in browser (dev server has proxy), else fake success
  ocrSend(host: string, message: string) {
    const useProxy = typeof window !== 'undefined' && window.location?.origin?.startsWith('http');
    if (useProxy) {
      fetch('/api/ocr-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, message }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            this._trigger(this._ocrCallbacks.success, data.message || `Sent to ${host}`);
          } else {
            this._trigger(this._ocrCallbacks.error, data.message || 'Send failed');
          }
        })
        .catch((e) => {
          this._trigger(this._ocrCallbacks.error, e instanceof Error ? e.message : 'Send failed');
        });
    } else {
      setTimeout(() => {
        this._trigger(this._ocrCallbacks.success, `OCR data sent successfully to ${host}: ${message}`);
      }, 800);
    }
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

  // ALE API - try proxy first (dev server), fallback to direct fetch (PWA or proxy unreachable)
  async aleRequest(url: string, options: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const tryProxy = typeof window !== 'undefined' && window.location?.origin?.startsWith('http');
    try {
      let res: Response;
      if (tryProxy) {
        try {
          const proxyRes = await fetch('/api/ale-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              method: options?.method || 'GET',
              headers: options?.headers || {},
              body: options?.body,
            }),
            signal: controller.signal,
            cache: 'no-store',
          });
          const json = await proxyRes.json();
          if (json && typeof json === 'object' && 'ok' in json) {
            clearTimeout(timeoutId);
            return json;
          }
        } catch {
          /* proxy failed or not available, fall through to direct */
        }
      }
      res = await fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers || {},
        body: options?.body,
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data: text,
        headers,
      };
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : 'Request failed';
      return {
        ok: false,
        status: 0,
        statusText: msg,
        data: null,
        headers: {} as Record<string, string>,
      };
    }
  }

  // Inditex API (requires Electron - mock returns error)
  async getApiConfig() {
    return { headerName: 'itx-apiKey', key: '' };
  }
  async saveApiConfig(_headerName: string, _key: string) {
    console.log('Mock: saveApiConfig - requires Electron');
  }
  async itxApiRequest(_url: string, _body: string) {
    console.log('Mock: itxApiRequest - requires Electron');
    return { ok: false, status: 0, statusText: 'Electron required', data: 'Run in Electron to use the API tab.', headers: {} };
  }

  // Helper
  private _trigger(callbacks: ((message: string) => void)[], message: string) {
    callbacks.forEach(cb => cb(message));
  }

  private _triggerHandheld(callbacks: ((port: number, message: string) => void)[], port: number, message: string) {
    callbacks.forEach(cb => cb(port, message));
  }

  // Database (mock – no-ops in browser)
  async dbConnect(_host: string, _user: string, _password: string) {
    return { ok: false as const, error: 'Database not available in browser mode' }
  }
  async dbDisconnect() {}
  async dbGetTables(_database: string): Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }> {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetTableData(_database: string, _table: string, _limit?: number, _offset?: number) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbExecuteQuery(_query: string, _database?: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetPrimaryKeys(_database: string, _table: string) {
    return [] as string[]
  }
  async dbUpdateCell(_database: string, _table: string, _primaryKeys: Record<string, any>, _column: string, _value: any) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetTableStructure(_database: string, _table: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbDeleteRow(_database: string, _table: string, _primaryKeys: Record<string, any>) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbInsertRow(_database: string, _table: string, _values: Record<string, any>) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbDeleteRows(_database: string, _table: string, _rows: Record<string, any>[]) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbExportTable(_database: string, _table: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetDatabaseSchema(_database: string) {
    return { ok: true as const, tables: [], foreignKeys: [] }
  }
  async safeStoreSet(_key: string, _value: string) {
    return true
  }
  async safeStoreGet(_key: string) {
    return null
  }
  async safeStoreDelete(_key: string) {
    return undefined
  }

  async installRegistryGetStatus() {
    return {
      enabled: false,
      endpoint: null,
      lastSentAt: null,
      sendNowAfterMs: 0,
      lastSentStatus: null,
      lastSentError: null,
      hasToken: false,
      nextPayload: {
        machineId: '',
        macAddress: null,
        version: '0.0.0',
        os: 'web',
        arch: 'unknown',
      },
    }
  }
  async installRegistrySetEnabled(_enabled: boolean) {
    return false
  }
  async installRegistrySendNow() {
    return { status: 'disabled' as const, error: 'Not available in browser' }
  }

  private sftpUnavailable() {
    return { ok: false as const, error: 'SFTP is only available in the desktop app.' }
  }

  async sftpConnect(_host: string, _port: number, _username: string, _password: string) {
    return this.sftpUnavailable()
  }
  async sftpDisconnect() {}
  async sftpReaddir(_remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpReadFile(_remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpWriteFile(_remotePath: string, _base64Data: string) {
    return this.sftpUnavailable()
  }
  async sftpWriteTextFile(_remotePath: string, _text: string) {
    return this.sftpUnavailable()
  }
  async sftpMkdir(_remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpRename(_oldPath: string, _newPath: string) {
    return this.sftpUnavailable()
  }
  async sftpUnlink(_remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpRmrf(_remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpDownloadSaveDialog(_remotePath: string, _operationId: string) {
    return this.sftpUnavailable()
  }
  async sftpDownloadToPath(_remotePath: string, _localPath: string, _operationId: string) {
    return this.sftpUnavailable()
  }
  async sftpUploadFromLocal(_localPath: string, _remotePath: string, _operationId: string) {
    return this.sftpUnavailable()
  }
  async sftpCopyRemoteFile(_remoteSrc: string, _remoteDest: string, _operationId: string) {
    return this.sftpUnavailable()
  }
  async localPickFolder() {
    return { ok: false as const, cancelled: true as const }
  }
  async localReaddir(_root: string, _dirPath: string) {
    return this.sftpUnavailable()
  }
  onSftpTransferProgress(_callback: (payload: { operationId: string; loaded: number; total: number }) => void) {
    return () => {}
  }
  async localWriteFileBase64(_root: string, _filePath: string, _base64Data: string) {
    return { ok: false as const, error: 'Not available in browser.' }
  }
  async localPathParent(_root: string, _cwd: string) {
    return { ok: true as const, parent: null }
  }
  async netScanGetInterfaces() {
    return { ok: true as const, interfaces: [] as { name: string; address: string; netmask: string; cidr: number; networkCidr: string }[] }
  }
  async netScanStart(_payload: NetScanStartPayload) {
    return { ok: false as const, error: 'LAN scan is only available in the desktop app.' }
  }
  async netScanCancel() {
    return { ok: true as const }
  }
  onNetScanHost(_callback: (payload: { ip: string; alive: boolean; hostname?: string; done: number; total: number }) => void) {
    return () => {}
  }
  onNetScanDone(_callback: (payload: { total: number }) => void) {
    return () => {}
  }
  onNetScanError(_callback: (payload: { message: string }) => void) {
    return () => {}
  }

  async udpDiscoveryStart(_localPort: number, _listenDurationMs: number) {
    return { ok: false as const, error: 'UDP discovery is only available in the desktop app.' }
  }
  async udpDiscoveryStop() {
    return { ok: true as const }
  }
  async udpDiscoverySendProbe(_targetIp: string, _targetPort: number, _message: string) {
    return { ok: false as const, error: 'UDP discovery is only available in the desktop app.' }
  }
  async udpDiscoveryIsRunning() {
    return false
  }
  onUdpDiscoveryDevice(_callback: (device: any) => void) {
    return () => {}
  }
  onUdpDiscoveryRaw(_callback: (payload: any) => void) {
    return () => {}
  }
  onUdpDiscoveryStarted(_callback: (payload: { port: number }) => void) {
    return () => {}
  }
  onUdpDiscoveryStopped(_callback: (payload: { reason: string }) => void) {
    return () => {}
  }
  onUdpDiscoveryError(_callback: (payload: { message: string }) => void) {
    return () => {}
  }
  async readerDiscoveryStart(_payload: ReaderDiscoveryPayload) {
    return { ok: false as const, error: 'Reader discovery is only available in the desktop app.' }
  }
  async readerDiscoveryCancel() {
    return { ok: true as const }
  }
  onReaderDiscoveryHost(
    _callback: (payload: {
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
  ) {
    return () => {}
  }
  onReaderDiscoveryDone(_callback: (payload: { total: number; found: number }) => void) {
    return () => {}
  }
  onReaderDiscoveryError(_callback: (payload: { message: string }) => void) {
    return () => {}
  }
}

export function initMockElectron() {
  if (!window.electronAPI) {
    console.warn('Electron API not found. Initializing Mock API for browser/documentation mode.');
    window.electronAPI = new MockElectronAPI();
  }
}
