// TCP Client for communicating with Java backend via Electron IPC

export interface TagData {
  epc: string
  tid: string
  uid: string
  antenna: number
  rssi: string
}

export interface ConnectionConfig {
  host: string
  port: number
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

    // Set callbacks for this specific connection attempt
    this.connectCallback = onSuccess
    this.errorCallback = onError
    
    // Send connection request to main process
    window.electronAPI.tcpConnect(host, parseInt(port.toString()))
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

    // Set callbacks for send progress
    this.progressCallback = onProgress
    this.completeCallback = onComplete
    
    // Send tags to main process which will handle real TCP communication
    window.electronAPI.tcpSendTags(tags, driverCode, delay)
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

    // Set callbacks for send progress
    this.progressCallback = onProgress
    this.completeCallback = onComplete

    window.electronAPI.handheldSendEpcs(this.port, tags, delay, verboseProgress)
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

// EPC Generator - matches Java EpcGenerator.java implementation
export class EPCGenerator {
  static generateFromUpc(upc: string, quantity: number, startSerial: number = 1): string[] {
    const epcs: string[] = []
    
    // Clean and validate input
    let digits = (upc || '').replace(/[^0-9]/g, '')
    if (!digits) return epcs
    
    // Pad to GTIN-14 (left pad with zeros)
    if (digits.length < 14) {
      digits = ('00000000000000' + digits).slice(-14)
    } else if (digits.length > 14) {
      digits = digits.slice(-14)
    }
    
    // SGTIN-96 encoding parameters
    const companyPrefixLength = 6
    const filter = 0
    const partition = 6
    const header = 0x30
    
    // Extract GTIN fields
    const indicatorDigit = digits.charAt(0)
    const companyPrefixDigits = digits.substring(1, 1 + companyPrefixLength)
    const itemRefDigits = indicatorDigit + digits.substring(1 + companyPrefixLength, 13)
    // Check digit (digits[13]) is not encoded in SGTIN-96
    
    const companyPrefix = parseInt(companyPrefixDigits)
    const itemRef = parseInt(itemRefDigits)
    
    // Generate EPCs
    const qty = Math.max(0, quantity)
    const firstSerial = Math.max(1, startSerial)
    
    for (let i = 0; i < qty; i++) {
      const serialValue = firstSerial + i
      
      // Assemble 96-bit value: header(8) + filter(3) + partition(3) + companyPrefix(20) + itemRef(24) + serial(38)
      let bits = ''
      bits += header.toString(2).padStart(8, '0')
      bits += filter.toString(2).padStart(3, '0')
      bits += partition.toString(2).padStart(3, '0')
      bits += companyPrefix.toString(2).padStart(20, '0')
      bits += itemRef.toString(2).padStart(24, '0')
      bits += serialValue.toString(2).padStart(38, '0')
      
      // Convert 96-bit binary string to hex (24 hex characters)
      let hex = ''
      for (let j = 0; j < bits.length; j += 4) {
        const nibble = bits.substr(j, 4)
        hex += parseInt(nibble, 2).toString(16).toUpperCase()
      }
      
      epcs.push(hex)
    }
    
    return epcs
  }
}

