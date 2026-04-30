// TCP Handler for Electron Main Process
// Handles real TCP connections to Java backend

import { Socket, Server, createServer } from 'net'
import { BrowserWindow } from 'electron'

export interface TagData {
  epc: string
  tid: string
  uid: string
  antenna: number
  rssi: string
}

export class TCPEmulatorHandler {
  private socket: Socket | null = null
  private isConnected: boolean = false
  private cancelRequested: boolean = false

  constructor(private window: BrowserWindow) {}

  connect(host: string, port: number): void {
    if (this.socket && this.isConnected) {
      this.sendToRenderer('tcp-error', 'Already connected')
      return
    }

    this.socket = new Socket()

    this.socket.on('connect', () => {
      this.isConnected = true
      this.sendToRenderer('tcp-connected', `Connected to ${host}:${port}`)
    })

    this.socket.on('error', (error) => {
      this.isConnected = false
      this.sendToRenderer('tcp-error', `Connection error: ${error.message}`)
    })

    this.socket.on('close', () => {
      this.isConnected = false
      this.sendToRenderer('tcp-disconnected', 'Connection closed')
    })

    this.socket.connect(port, host)
  }

  disconnect(): void {
    if (this.socket) {
      this.isConnected = false
      this.socket.destroy()
      this.socket = null
      this.sendToRenderer('tcp-disconnected', 'Disconnected successfully')
    }
  }

  async sendTags(tags: TagData[], driverCode: string, delayMs: number): Promise<void> {
    if (!this.socket || !this.isConnected) {
      this.sendToRenderer('tcp-error', 'Not connected to server')
      return
    }

    this.cancelRequested = false
    const total = tags.length
    let count = 0

    for (const tag of tags) {
      if (this.cancelRequested) {
        this.sendToRenderer('tcp-complete', 'Stopped: Cancelled by user')
        return
      }

      if (!this.isConnected) {
        this.sendToRenderer('tcp-complete', 'Stopped: Connection lost')
        return
      }

      const message = this.formatMessage(tag, driverCode)
      
      try {
        await new Promise<void>((resolve, reject) => {
          this.socket!.write(message, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })

        count++
        this.sendToRenderer('tcp-progress', `Sent (${count}/${total}): ${tag.epc}`)

        if (delayMs > 0 && count < total) {
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      } catch (error: any) {
        this.isConnected = false
        this.sendToRenderer('tcp-error', `Send error: ${error.message}`)
        return
      }
    }

    this.sendToRenderer('tcp-complete', `Successfully sent ${count} tag(s)`)
  }

  private formatMessage(tag: TagData, driver: string): string {
    return `driver=${driver} epc=${tag.epc} @tid=${tag.tid} uid=${tag.uid} antenna=${tag.antenna} @rssi=${tag.rssi}\n`
  }

  cancelSend(): void {
    this.cancelRequested = true
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  private sendToRenderer(channel: string, message: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, message)
    }
  }

  shutdown(): void {
    this.disconnect()
  }
}

// Handheld Server Handler - EXACTLY like Java HandheldServer.java
// CREATES A SERVER that LISTENS on a configurable port for handheld devices to connect
export class HandheldServerHandler {
  private serverRunning: boolean = false
  private serverSocket: Server | null = null
  private connectedClients: Socket[] = []
  private cancelRequested: boolean = false

  constructor(private window: BrowserWindow, private port: number) {}

  start(): void {
    if (this.serverRunning) {
      this.sendToRenderer('handheld-started', `Handheld server already running on port ${this.port}`)
      return
    }
    
    // Java: serverSocket = new ServerSocket(listenPort);
    this.serverSocket = createServer((client: Socket) => {
      // Java: final Socket client = serverSocket.accept(); connectedClients.add(client);
      const clientAddr = `${client.remoteAddress}:${client.remotePort}`
      console.log(`Handheld: Client connected from ${clientAddr}`)
      this.connectedClients.push(client)
      this.sendToRenderer('handheld-progress', `Handheld device connected from ${clientAddr} (Total: ${this.connectedClients.length})`)

      client.on('close', () => {
        console.log(`Handheld: Client disconnected (${clientAddr})`)
        const index = this.connectedClients.indexOf(client)
        if (index > -1) {
          this.connectedClients.splice(index, 1)
        }
        this.sendToRenderer('handheld-progress', `Handheld device disconnected (Total: ${this.connectedClients.length})`)
      })

      client.on('error', (err) => {
        console.log('Handheld: Client error:', err.message)
      })
    })

    this.serverSocket.on('error', (error: Error) => {
      console.log('Handheld: Server error:', error.message)
      this.sendToRenderer('handheld-error', `Server error: ${error.message}`)
    })

    // Java: running = true; onLog.accept("Handheld server listening on port " + listenPort);
    // Listen on all interfaces (0.0.0.0) so handheld devices can connect
    this.serverSocket.listen(this.port, '0.0.0.0', () => {
      this.serverRunning = true
      console.log(`Handheld: Server successfully started on 0.0.0.0:${this.port}`)
      this.sendToRenderer('handheld-started', `Handheld server listening on port ${this.port}`)
    })
  }

  isRunning(): boolean {
    return this.serverRunning
  }

  async sendEpcs(tags: {epc: string, tid?: string}[], delayMs: number): Promise<void> {
    // Java: if (!running || connectedClients.isEmpty()) { onComplete.accept("No handheld connected..."); return; }
    console.log(`Handheld: sendEpcs called - running: ${this.serverRunning}, clients: ${this.connectedClients.length}`)
    if (!this.serverRunning || this.connectedClients.length === 0) {
      const msg = `No handheld connected on port ${this.port} (Server running: ${this.serverRunning}, Connected clients: ${this.connectedClients.length})`
      console.log(`Handheld: ${msg}`)
      this.sendToRenderer('handheld-complete', msg)
      return
    }

    const total = tags.length
    let sentTotal = 0

    this.cancelRequested = false

    // One EPC per write, with delay between tags (matches fixed-reader sendTags behavior)
    for (let i = 0; i < tags.length; i++) {
      if (this.cancelRequested) {
        this.sendToRenderer('handheld-complete', 'Stopped: Cancelled by user')
        return
      }

      const tag = tags[i]
      sentTotal += this.broadcastBatch([tag])
      this.sendToRenderer('handheld-progress', `Sent (${i + 1}/${total}): ${tag.epc}`)

      if (delayMs > 0 && i < tags.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    this.sendToRenderer('handheld-complete', `Broadcasted ${sentTotal} EPC(s) to handheld clients`)
  }

  // Java: private int broadcastBatch(List<String> epcs)
  private broadcastBatch(tags: {epc: string, tid?: string}[]): number {
    if (tags.length === 0) return 0

    // Java: StringBuilder sb = ... for (String epc : epcs) { String json = ...; sb.append(json).append("\r\n"); }
    let payload = ''
    for (const tag of tags) {
      // Java: String json = "{\"epc\":\"" + epc + "\",\"date\":\"" + nowString() + "\",\"rssi\":70.0}";
      const json = JSON.stringify({
        epc: tag.epc,
        tid: tag.tid || tag.epc, // User requested: defaults to EPC if not provided
        date: this.nowString(),
        rssi: 70.0
      })
      payload += json + '\r\n'
    }

    // Java: synchronized (connectedClients) { for (Socket client : connectedClients) { ... os.write(payload); os.flush(); } }
    const toRemove: Socket[] = []
    for (const client of this.connectedClients) {
      try {
        client.write(payload)
      } catch (err) {
        toRemove.push(client)
      }
    }

    // Remove disconnected clients
    for (const client of toRemove) {
      const index = this.connectedClients.indexOf(client)
      if (index > -1) {
        this.connectedClients.splice(index, 1)
      }
    }

    return tags.length
  }

  // Java: private static String nowString()
  private nowString(): string {
    // Java: DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
    const now = new Date()
    const yyyy = now.getFullYear()
    const MM = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const HH = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const SSS = String(now.getMilliseconds()).padStart(3, '0')
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${SSS}`
  }

  // Java: public void cancelSend()
  cancelSend(): void {
    this.cancelRequested = true
  }

  // Java: public void stop(Consumer<String> onLog)
  stop(): void {
    // Java: running = false;
    this.serverRunning = false
    
    // Java: if (serverSocket != null && !serverSocket.isClosed()) { serverSocket.close(); }
    if (this.serverSocket) {
      this.serverSocket.close()
      this.serverSocket = null
    }

    // Java: for (Socket client : connectedClients) { try { client.close(); } ... } connectedClients.clear();
    for (const client of this.connectedClients) {
      try {
        client.destroy()
      } catch (err) {
        // Ignore
      }
    }
    this.connectedClients = []

    this.sendToRenderer('handheld-stopped', 'Handheld server stopped')
  }

  private sendToRenderer(channel: string, message: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, this.port, message)
    }
  }

  getPort(): number {
    return this.port
  }

  // Java: public void shutdown()
  shutdown(): void {
    this.stop()
  }
}

// OCR Handler - EXACTLY like Java EmulatorUI.java lines 653-687
// Java does NOT set a timeout, just creates socket, writes, flushes, closes
export async function sendOCRMessage(host: string, message: string, window: BrowserWindow): Promise<void> {
  console.log(`OCR: Sending to ${host}:10482`)
  
  return new Promise<void>((resolve) => {
    // Use the imported Socket class
    const socket = new Socket()
    
    // NO TIMEOUT - Java doesn't set one
    // socket.setTimeout() is NOT called
    
    socket.on('error', (error: Error) => {
      console.log('OCR: Error -', error.message)
      window.webContents.send('ocr-error', `Error: ${error.message}`)
      socket.destroy()
      resolve()
    })
    
    // Java: socket = new Socket(host, 10482)
    socket.connect(10482, host, () => {
      console.log('OCR: Connected, sending message')
      
      // Java: PrintWriter writer = new PrintWriter(socket.getOutputStream(), true)
      // Java: writer.print(message + "\n")
      // Java: writer.flush()
      // Java: socket.close()
      socket.write(message + '\n', 'utf8', (err) => {
        if (err) {
          console.log('OCR: Write error:', err.message)
          window.webContents.send('ocr-error', `Error: ${err.message}`)
        } else {
          console.log('OCR: Message sent successfully')
          window.webContents.send('ocr-success', `Sent: ${message}`)
        }
        socket.end()
        resolve()
      })
    })
  })
}

// Custom Message Handler - Similar to OCR but allows custom port
export async function sendCustomMessage(host: string, port: number, message: string, window: BrowserWindow): Promise<void> {
  console.log(`Custom: Sending to ${host}:${port}`)
  
  return new Promise<void>((resolve) => {
    const socket = new Socket()

    // Add 5 second timeout
    socket.setTimeout(5000)
    socket.on('timeout', () => {
      console.log('Custom: Connection timed out')
      window.webContents.send('custom-error', `Error: Connection timed out`)
      socket.destroy()
      resolve()
    })
    
    socket.on('error', (error: Error) => {
      console.log('Custom: Error -', error.message)
      window.webContents.send('custom-error', `Error: ${error.message}`)
      socket.destroy()
      resolve()
    })
    
    socket.connect(port, host, () => {
      console.log(`Custom: Connected to ${host}:${port}, sending message`)
      socket.setTimeout(0) // Disable timeout once connected
      
      socket.write(message + '\n', 'utf8', (err) => {
        if (err) {
          console.log('Custom: Write error:', err.message)
          window.webContents.send('custom-error', `Error: ${err.message}`)
        } else {
          console.log('Custom: Message sent successfully')
          window.webContents.send('custom-success', `Sent to ${port}: ${message}`)
        }
        socket.end()
        resolve()
      })
    })
  })
}
