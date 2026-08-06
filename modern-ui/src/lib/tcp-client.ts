// TCP Client for communicating with the emulator backend via Electron IPC

import type { HandheldSendRecipe } from './handheld-tag-iterate'

export interface TagData {
  epc: string
  tid: string
  uid: string
  antenna: number
  rssi: string
  /** Optional user-memory bank (hex); sent as `@userdata=` on the Fixed wire. */
  userdata?: string
}

export class TCPEmulatorClient {
  private connectCallback: ((message: string) => void) | null = null
  private disconnectCallback: ((message: string) => void) | null = null
  private errorCallback: ((message: string) => void) | null = null
  private progressCallback: ((message: string) => void) | null = null
  private completeCallback: ((message: string) => void) | null = null

  constructor() {
    // Set up event listeners ONCE from main process
    if (window.electronAPI) {
      window.electronAPI.onTcpConnected((message: string) => {
        if (this.connectCallback) this.connectCallback(message)
      })
      window.electronAPI.onTcpDisconnected((message: string) => {
        if (this.disconnectCallback) this.disconnectCallback(message)
      })
      window.electronAPI.onTcpError((message: string) => {
        if (this.errorCallback) this.errorCallback(message)
      })
      window.electronAPI.onTcpProgress((message: string) => {
        if (this.progressCallback) this.progressCallback(message)
      })
      window.electronAPI.onTcpComplete((message: string) => {
        if (this.completeCallback) this.completeCallback(message)
      })
    }
  }

  async connect(
    host: string,
    port: number,
    onSuccess: (message: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!window.electronAPI) {
      onError('Electron API not available')
      return
    }

    try {
      const result = await window.electronAPI.tcpConnect(host, parseInt(port.toString()))
      if (result.ok) onSuccess(result.message ?? 'Connected')
      else onError(result.error ?? 'Connection failed')
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }

  async disconnect(onComplete: (message: string) => void): Promise<void> {
    if (!window.electronAPI) {
      onComplete('Electron API not available')
      return
    }

    this.disconnectCallback = onComplete
    window.electronAPI.tcpDisconnect()
  }

  async isConnected(): Promise<boolean> {
    if (!window.electronAPI) {
      return false
    }
    return await window.electronAPI.tcpIsConnected()
  }

  async sendTags(
    tags: TagData[],
    driverCode: string,
    delay: number,
    onProgress: (message: string) => void,
    onComplete: (message: string) => void
  ): Promise<void> {
    if (!window.electronAPI) {
      onProgress('Error: Electron API not available')
      return
    }

    const api = window.electronAPI
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      this.progressCallback = onProgress
      this.completeCallback = (message: string) => {
        onComplete(message)
        finish()
      }
      api.tcpSendTags(tags, driverCode, delay)
    })
  }

  cancelSend(): void {
    if (window.electronAPI) {
      window.electronAPI.tcpCancelSend()
    }
  }
}


export class HandheldServerClient {
  private static clientsByPort = new Map<number, HandheldServerClient>()
  private static ipcMultiplexBound = false

  private static ensureIpcMultiplex(): void {
    if (HandheldServerClient.ipcMultiplexBound || !window.electronAPI) return
    HandheldServerClient.ipcMultiplexBound = true
    const api = window.electronAPI
    api.onHandheldStarted((eventPort: number, message: string) => {
      const c = HandheldServerClient.clientsByPort.get(eventPort)
      if (c?.startCallback) c.startCallback(message)
    })
    api.onHandheldStopped((eventPort: number, message: string) => {
      const c = HandheldServerClient.clientsByPort.get(eventPort)
      if (c?.stopCallback) c.stopCallback(message)
    })
    api.onHandheldError((eventPort: number, message: string) => {
      const c = HandheldServerClient.clientsByPort.get(eventPort)
      if (c?.errorCallback) c.errorCallback(message)
    })
    api.onHandheldProgress((eventPort: number, message: string) => {
      const c = HandheldServerClient.clientsByPort.get(eventPort)
      if (c?.progressCallback) c.progressCallback(message)
    })
    api.onHandheldComplete((eventPort: number, message: string) => {
      const c = HandheldServerClient.clientsByPort.get(eventPort)
      if (c?.completeCallback) c.completeCallback(message)
    })
  }

  private startCallback: ((message: string) => void) | null = null
  private stopCallback: ((message: string) => void) | null = null
  private errorCallback: ((message: string) => void) | null = null
  private progressCallback: ((message: string) => void) | null = null
  private completeCallback: ((message: string) => void) | null = null

  constructor(private port: number = 10472) {
    HandheldServerClient.clientsByPort.set(this.port, this)
    HandheldServerClient.ensureIpcMultiplex()
  }

  getPort(): number {
    return this.port
  }

  start(onLog: (message: string) => void, onError: (error: string) => void): void {
    if (!window.electronAPI) {
      onError('Electron API not available')
      return
    }

    this.startCallback = onLog
    this.errorCallback = onError
    window.electronAPI.handheldStart(this.port)
  }

  async isRunning(): Promise<boolean> {
    if (!window.electronAPI) {
      return false
    }
    return await window.electronAPI.handheldIsRunning(this.port)
  }

  async sendEpcs(
    tags: { epc: string; tid?: string; rssi?: string }[],
    delay: number,
    onProgress: (message: string) => void,
    onComplete: (message: string) => void,
    verboseProgress: boolean = true
  ): Promise<void> {
    if (!window.electronAPI) {
      onProgress('Error: Electron API not available')
      return
    }

    const api = window.electronAPI
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      this.progressCallback = onProgress
      this.completeCallback = (message: string) => {
        onComplete(message)
        finish()
      }
      api.handheldSendEpcs(this.port, tags, delay, verboseProgress)
    })
  }

  async sendRecipe(
    recipe: HandheldSendRecipe,
    delay: number,
    onProgress: (message: string) => void,
    onComplete: (message: string) => void,
    verboseProgress: boolean = true,
  ): Promise<void> {
    if (!window.electronAPI) {
      onProgress('Error: Electron API not available')
      return
    }

    const api = window.electronAPI
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (!settled) {
          settled = true
          resolve()
        }
      }
      this.progressCallback = onProgress
      this.completeCallback = (message: string) => {
        onComplete(message)
        finish()
      }
      api.handheldSendRecipe(this.port, recipe, delay, verboseProgress)
    })
  }

  cancelSend(): void {
    if (window.electronAPI) {
      window.electronAPI.handheldCancelSend(this.port)
    }
  }

  shutdown(): void {
    if (window.electronAPI) {
      this.stopCallback = null
      window.electronAPI.handheldStop(this.port)
    }
  }
}

// OCR Client
export class OCRClient {
  private successCallback: ((message: string) => void) | null = null
  private errorCallback: ((message: string) => void) | null = null

  constructor() {
    // Set up event listeners ONCE
    if (window.electronAPI) {
      window.electronAPI.onOcrSuccess((message: string) => {
        if (this.successCallback) this.successCallback(message)
      })
      window.electronAPI.onOcrError((message: string) => {
        if (this.errorCallback) this.errorCallback(message)
      })
    }
  }

  async sendMessage(
    host: string,
    message: string,
    onSuccess: (message: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!window.electronAPI) {
      onError('Electron API not available')
      return
    }

    // Set callbacks for this send
    this.successCallback = onSuccess
    this.errorCallback = onError
    
    // Send message to main process
    window.electronAPI.ocrSend(host, message)
  }
}

// Custom Client
export class CustomClient {
  private successCallback: ((message: string) => void) | null = null
  private errorCallback: ((message: string) => void) | null = null

  constructor() {
    // Set up event listeners ONCE
    if (window.electronAPI) {
      window.electronAPI.onCustomSuccess((message: string) => {
        if (this.successCallback) this.successCallback(message)
      })
      window.electronAPI.onCustomError((message: string) => {
        if (this.errorCallback) this.errorCallback(message)
      })
    }
  }

  async sendMessage(
    host: string,
    port: number,
    message: string,
    onSuccess: (message: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!window.electronAPI) {
      onError('Electron API not available')
      return
    }

    // Set callbacks for this send
    this.successCallback = onSuccess
    this.errorCallback = onError
    
    // Send message to main process
    window.electronAPI.customSend(host, port, message)
  }
}

// Legacy function for backwards compatibility
export async function sendOCRMessage(
  host: string,
  message: string,
  onSuccess: (message: string) => void,
  onError: (error: string) => void
): Promise<void> {
  const client = new OCRClient()
  await client.sendMessage(host, message, onSuccess, onError)
}

import { generateSgtin96 } from './epc-encoders'

/**
 * Backwards-compatible facade around the new {@link generateSgtin96} encoder.
 * Historical behaviour: GTIN-14 padded, 6-digit company prefix (partition 6),
 * filter 0, serial floor of 1.
 */
export class EPCGenerator {
  static generateFromUpc(upc: string, quantity: number, startSerial: number = 1): string[] {
    const serial = Math.max(1, Math.floor(startSerial))
    return generateSgtin96(upc, quantity, serial, 6, 0)
  }
}

export const SERIAL_CONTINUES_ACROSS_UPC_LINES_KEY = 'rfid-emulator-serial-continues-across-upc'

export function loadSerialContinuesAcrossUpcLines(): boolean {
  try {
    return localStorage.getItem(SERIAL_CONTINUES_ACROSS_UPC_LINES_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSerialContinuesAcrossUpcLines(value: boolean): void {
  try {
    localStorage.setItem(SERIAL_CONTINUES_ACROSS_UPC_LINES_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function parseStartSerial(input: string | number | undefined): number {
  const n = typeof input === 'number' ? input : parseInt(String(input ?? '1'), 10)
  return Math.max(1, Number.isFinite(n) ? n : 1)
}

export interface ExpandedUpcTag {
  epc: string
  customTid?: string
  userdata?: string
}

/** Expand UPC,Count,TID[,userdata] lines to EPC hex strings using the chosen serial mode. */
export function expandUpcListToEpcs(
  upcList: string,
  startSerial: string | number | undefined,
  continuesAcrossLines: boolean,
): ExpandedUpcTag[] {
  const trimmedList = upcList.trim()
  if (!trimmedList) return []

  const baseSerial = parseStartSerial(startSerial)
  let serial = baseSerial
  const out: ExpandedUpcTag[] = []

  for (const line of trimmedList.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [upc, countStr, customTid, userdata] = trimmed.split(',')
    const count = parseInt(countStr?.trim() || '0', 10)
    if (count <= 0 || !upc) continue

    const start = continuesAcrossLines ? serial : baseSerial
    const epcs = EPCGenerator.generateFromUpc(upc.trim(), count, start)
    const tid = customTid?.trim()
    const user = userdata?.trim()
    for (const epc of epcs) {
      out.push({
        epc,
        customTid: tid || undefined,
        userdata: user || undefined,
      })
    }
    if (continuesAcrossLines) serial += count
  }

  return out
}

/** Parse `EPC[,TID[,userdata]]` — empty TID falls through to caller default. */
export function parseEpcListLine(line: string): { epc: string; tid?: string; userdata?: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const parts = trimmed.split(',')
  const epc = parts[0]?.trim()
  if (!epc) return null
  const tid = parts[1]?.trim()
  const userdata = parts[2]?.trim()
  return {
    epc,
    tid: tid || undefined,
    userdata: userdata || undefined,
  }
}

