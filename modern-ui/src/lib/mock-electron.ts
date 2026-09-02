import { ElectronAPI, type NetScanStartPayload, type ReaderDiscoveryPayload, type ReaderVendor } from '../types/electron';
import type { DbExportProgressPayload } from './db-export-progress';

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

  // Window controls
  minimize() { console.log('Mock: minimize'); }
  maximize() { console.log('Mock: maximize'); }
  close() { console.log('Mock: close'); }

  // TCP Emulator - validate host reachability via HTTP probe (browser can't do raw TCP)
  async tcpConnect(host: string, port: number): Promise<{ ok: boolean; message?: string; error?: string }> {
    console.log(`Mock: Validating reachability of ${host}...`);
    const probePorts = [8080, 80, port];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const tryProbe = (p: number) =>
      fetch(`http://${host}:${p}/`, {
        method: 'HEAD',
        mode: 'no-cors',
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

    try {
      const ok = await tryAny();
      clearTimeout(timeoutId);
      if (ok) {
        this._tcpConnected = true;
        const message = `Connected to ${host}:${port}`;
        this._trigger(this._tcpCallbacks.connect, message);
        return { ok: true, message };
      }
      const error = `Host ${host} unreachable. Check IP, network, and firewall.`;
      this._trigger(this._tcpCallbacks.error, error);
      return { ok: false, error };
    } catch {
      clearTimeout(timeoutId);
      const error = `Host ${host} unreachable. Check IP, network, and firewall.`;
      this._trigger(this._tcpCallbacks.error, error);
      return { ok: false, error };
    }
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

  async labelaryRender(zpl: string, dpmm: number, widthIn: number, heightIn: number) {
    const body = (zpl || '').trim();
    if (!body) throw new Error('ZPL is empty');
    const w = Number(widthIn);
    const h = Number(heightIn);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      throw new Error('Invalid label dimensions');
    }
    const d = [6, 8, 12, 24].includes(Number(dpmm)) ? Number(dpmm) : 8;
    const path = `v1/printers/${d}dpmm/labels/${w}x${h}/0/`;
    const base = import.meta.env.DEV ? `/labelary/` : `http://api.labelary.com/`;
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'image/png',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error((t || `HTTP ${res.status}`).slice(0, 900));
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
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

  handheldSendEpcs(port: number, tags: any[], delayMs: number, verboseProgress: boolean = true) {
    console.log(`Mock: Sending ${tags.length} EPCs to handheld on port ${port} with delay ${delayMs}`);
    let count = 0;
    const interval = setInterval(() => {
      const currentTag = tags[count];
      count++;
      const rssiRaw = currentTag?.rssi;
      const rssiNum = rssiRaw != null && rssiRaw !== '' ? parseFloat(rssiRaw) : NaN;
      const rssiVal = Number.isFinite(rssiNum) ? rssiNum : 70;
      if (verboseProgress) {
        this._triggerHandheld(this._handheldCallbacks.progress, port, `Sent (${count}/${tags.length}): ${currentTag.epc} @rssi=${rssiVal}`);
      }
      console.log(`Mock: Sent EPC ${count}/${tags.length}:`, currentTag);

      if (count >= tags.length) {
        clearInterval(interval);
        this._triggerHandheld(this._handheldCallbacks.complete, port, 'All EPCs sent successfully');
      }
    }, Math.max(delayMs, 100));
  }

  handheldSendRecipe(port: number, recipe: import('./handheld-tag-iterate').HandheldSendRecipe, delayMs: number, verboseProgress: boolean = true) {
    void import('./handheld-tag-iterate').then(({ iterateHandheldTags }) => {
      const tags = [...iterateHandheldTags(recipe)];
      this.handheldSendEpcs(port, tags, delayMs, verboseProgress);
    });
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

  // Auto Updater
  checkForUpdate() { console.log('Mock: checkForUpdate'); }
  startDownload() { console.log('Mock: startDownload'); }
  quitAndInstall() { console.log('Mock: quitAndInstall'); }
  async getAutoUpdateEnabled() { return true }
  async setAutoUpdateEnabled(_enabled: boolean) { return true }
  onCheckingForUpdate(_callback: () => void) { console.log('Mock: onCheckingForUpdate registered'); }
  onUpdateAvailable(_callback: (info: any) => void) { console.log('Mock: onUpdateAvailable registered'); }
  onUpdateNotAvailable(_callback: (info: any) => void) { console.log('Mock: onUpdateNotAvailable registered'); }
  onUpdateError(_callback: (message: string) => void) { console.log('Mock: onUpdateError registered'); }
  onDownloadProgress(_callback: (progress: any) => void) { console.log('Mock: onDownloadProgress registered'); }
  onUpdateDownloaded(_callback: (info: any) => void) { console.log('Mock: onUpdateDownloaded registered'); }

  // ALE API - try proxy first (dev server), fallback to direct fetch (PWA or proxy unreachable)
  async aleGetCredentialMeta() {
    const u = import.meta.env.VITE_ALE_USERNAME as string | undefined
    if (!u?.trim()) return { ok: false as const }
    const pw = (import.meta.env.VITE_ALE_PASSWORD as string | undefined) ?? ''
    return { ok: true as const, username: u.trim(), passwordIsHashed: /^[a-f0-9]{64}$/i.test(pw.trim()) }
  }
  async aleGetBasicAuthHeader() {
    const meta = await this.aleGetCredentialMeta()
    if (!meta.ok) return { ok: false as const, error: 'Missing credentials' }
    const pw = (import.meta.env.VITE_ALE_PASSWORD as string | undefined) ?? ''
    const token = btoa(`${meta.username}:${pw}`)
    return { ok: true as const, username: meta.username, header: `Basic ${token}` }
  }
  async aleRequest(url: string, options: any) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const tryProxy = typeof window !== 'undefined' && window.location?.origin?.startsWith('http');
    try {
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
      const res = await fetch(url, {
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

  async aleRequestBatch(requests: { url: string; options?: Record<string, unknown> }[]) {
    return Promise.all(requests.map((r) => this.aleRequest(r.url, r.options ?? {})))
  }

  // Inditex API (requires Electron - mock returns error)
  async getApiConfig() {
    return { url: '', headerName: '', key: '' };
  }
  async saveApiConfig(_url: string, _headerName: string, _key: string) {
    console.log('Mock: saveApiConfig - requires Electron');
  }
  async itxApiRequest(_url: string, _body: string, _headerName: string, _apiKey: string) {
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
  async dbListDatabases(): Promise<{ ok: true; databases: string[] } | { ok: false; error: string }> {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetTables(_database: string): Promise<{ ok: true; tables: { name: string; rows: number }[] } | { ok: false; error: string }> {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbGetTableData(
    _database: string,
    _table: string,
    _limit?: number,
    _offset?: number,
    _filter?: { search?: string; sortColumn?: string; sortDir?: 'asc' | 'desc' },
  ) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbExecuteQuery(_query: string, _database?: string, _maxRows?: number) {
    return { ok: false as const, error: 'Not connected' }
  }
  async automationRunScript(_payload: unknown) {
    return { ok: false as const, error: 'Run Script requires the desktop app (admin)' }
  }
  async automationOpenScriptsFolder() {
    return { ok: false as const, error: 'Not available in browser' }
  }
  async automationGetScriptsDir() {
    return { ok: false as const, error: 'Not available in browser' }
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
  async dbExportDatabaseSql(_database: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbSaveExportTable(_database: string, _table: string, _format: 'csv' | 'sql') {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbSaveExportDatabaseSql(_database: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  async dbSaveExportDatabaseCsv(_database: string) {
    return { ok: false as const, error: 'Not connected' }
  }
  onDbExportProgress(_callback: (progress: DbExportProgressPayload) => void) {
    return () => {}
  }
  async dbImportRows(_database: string, _table: string, _rows: Record<string, any>[]) {
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

  private _adminAuthed = false
  async adminLogin(username: string, password: string) {
    if (username === 'admin' && password === 'admin') {
      this._adminAuthed = true
      return { ok: true }
    }
    return { ok: false, error: 'Invalid username or password' }
  }
  async adminLogout() {
    this._adminAuthed = false
    return { ok: true }
  }
  async adminIsAuthenticated() {
    return { ok: this._adminAuthed }
  }

  private sftpUnavailable() {
    return { ok: false as const, error: 'SFTP is only available in the desktop app.' }
  }

  async sftpConnect(_host: string, _port: number, _username: string, _password: string) {
    return this.sftpUnavailable()
  }
  async sftpDisconnect(_sessionId: string) {}
  async sftpReaddir(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpReadFile(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpWriteFile(_sessionId: string, _remotePath: string, _base64Data: string) {
    return this.sftpUnavailable()
  }
  async sftpWriteTextFile(_sessionId: string, _remotePath: string, _text: string) {
    return this.sftpUnavailable()
  }
  async sftpMkdir(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpRename(_sessionId: string, _oldPath: string, _newPath: string) {
    return this.sftpUnavailable()
  }
  async sftpUnlink(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpRmrf(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpStat(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpCalculateSize(_sessionId: string, _remotePath: string) {
    return this.sftpUnavailable()
  }
  async sftpSetAttributes(
    _sessionId: string,
    _remotePath: string,
    _attrs: { mode?: number; uid?: number; gid?: number },
    _options?: { recursive?: boolean; addXToDirectories?: boolean },
  ) {
    return this.sftpUnavailable()
  }
  async sftpFindFiles(
    _sessionId: string,
    _options: {
      rootPath: string
      pattern: string
      recursive: boolean
      caseSensitive: boolean
      filesOnly: boolean
      foldersOnly: boolean
    },
    _operationId: string,
  ) {
    return this.sftpUnavailable()
  }
  async sftpFindCancel(_sessionId: string) {}
  async sftpDownloadSaveDialog(_sessionId: string, _remotePath: string, _operationId: string) {
    return this.sftpUnavailable()
  }
  async sftpDownloadToPath(
    _sessionId: string,
    _remotePath: string,
    _localPath: string,
    _operationId: string,
    _localRoot?: string,
  ) {
    return this.sftpUnavailable()
  }
  async sftpUploadFromLocal(
    _sessionId: string,
    _localPath: string,
    _remotePath: string,
    _operationId: string,
    _localRoot?: string,
  ) {
    return this.sftpUnavailable()
  }
  async sftpCopyRemoteFile(
    _sessionId: string,
    _remoteSrc: string,
    _remoteDest: string,
    _operationId: string,
  ) {
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
  onSftpFindProgress(
    _callback: (payload: {
      operationId: string
      scannedDirs: number
      matchCount: number
      currentDir: string
      limitReached?: boolean
    }) => void,
  ) {
    return () => {}
  }
  onSftpFindMatch(
    _callback: (payload: {
      operationId: string
      match: {
        path: string
        name: string
        type: 'file' | 'folder'
        size?: number
        mtime?: number
      }
    }) => void,
  ) {
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

  getPathForFile(_file: File) {
    return ''
  }

  async logAggregatorPickZip() {
    return { ok: false as const, error: 'Log Aggregator requires the desktop app' }
  }
  async logAggregatorPickOutput() {
    return { ok: false as const, error: 'Log Aggregator requires the desktop app' }
  }
  async logAggregatorRun(_zipPath: string, _outputDir: string) {
    return { ok: false as const, error: 'Log Aggregator requires the desktop app' }
  }
  async logAggregatorShowOutput(_outputDir: string) {
    return { ok: false as const, error: 'Log Aggregator requires the desktop app' }
  }
  onLogAggregatorProgress(_callback: (progress: import('../types/log-aggregator').LogAggregatorProgress) => void) {
    return () => {}
  }
}

export function initMockElectron() {
  if (!window.electronAPI) {
    console.warn('Electron API not found. Initializing Mock API for browser/documentation mode.');
    window.electronAPI = new MockElectronAPI();
  }
}
