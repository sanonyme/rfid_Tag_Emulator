import { Socket } from 'net'
import { BrowserWindow } from 'electron'
import Modbus from 'jsmodbus'

class AdamHandler {
  private socket: Socket | null = null
  private client: any | null = null
  private isConnected: boolean = false
  private window: BrowserWindow | null = null

  constructor() {}

  setWindow(window: BrowserWindow) {
    this.window = window
  }

  connect(host: string, port: number = 502): void {
    if (this.isConnected) {
      this.disconnect()
    }

    this.socket = new Socket()
    this.client = new Modbus.client.TCP(this.socket)

    this.socket.on('connect', () => {
      this.isConnected = true
      this.sendToRenderer('adam-connected', `Connected to ${host}:${port}`)
    })

    this.socket.on('error', (err: Error) => {
      this.isConnected = false
      this.sendToRenderer('adam-error', `Connection error: ${err.message}`)
    })

    this.socket.on('close', () => {
      this.isConnected = false
      this.sendToRenderer('adam-disconnected', 'Connection closed')
    })

    this.socket.setTimeout(5000)
    this.socket.on('timeout', () => {
      this.sendToRenderer('adam-error', 'Connection timed out')
      this.disconnect()
    })

    try {
        this.socket.connect(port, host)
    } catch (err: any) {
        this.sendToRenderer('adam-error', `Connect failed: ${err.message}`)
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
      this.client = null
      this.isConnected = false
      this.sendToRenderer('adam-disconnected', 'Disconnected')
    }
  }

  async readDIs(start: number, count: number): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.sendToRenderer('adam-error', 'Not connected')
      return
    }
    try {
      const res = await this.client.readDiscreteInputs(start, count)
      this.sendToRenderer('adam-data-di', { start, values: res.response.body.valuesAsArray })
    } catch (err: any) {
      this.sendToRenderer('adam-error', `Read DI error: ${err.message}`)
    }
  }

  async writeDO(coil: number, value: boolean): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.sendToRenderer('adam-error', 'Not connected')
      return
    }
    try {
      // ADAM-6000 series DOs typically start at address 16 (0x10)
      // The UI sends 0-based index, so we need to add the offset
      const DO_START_ADDRESS = 16
      const targetCoil = coil + DO_START_ADDRESS
      
      await this.client.writeSingleCoil(targetCoil, value)
      this.sendToRenderer('adam-write-success', `Written DO ${coil} (Address ${targetCoil}) to ${value}`)
    } catch (err: any) {
      console.error('ADAM Write Error:', err)
      this.sendToRenderer('adam-error', `Write DO error: ${err.message || 'Unknown error'}`)
    }
  }

  /**
   * Set DI invert mask on the ADAM device.
   * Bit N = 1 means invert DI N. Written to holding register.
   * Register address may vary by model (6050, 6060, etc.) - check your manual.
   */
  async setDIInvertMask(mask: number, registerAddress: number = 100): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.sendToRenderer('adam-error', 'Not connected')
      return
    }
    try {
      await this.client.writeSingleRegister(registerAddress, mask & 0xFFFF)
      this.sendToRenderer('adam-write-success', `DI invert mask set to 0x${mask.toString(16)} (register ${registerAddress})`)
    } catch (err: any) {
      console.error('ADAM DI Invert Error:', err)
      const isIllegalAddr = err?.message?.includes('Exception') || err?.err === 'ModbusException'
      const hint = isIllegalAddr
        ? `Register ${registerAddress} invalid for this model. Try 0, 16, 50, 64, or 200 (see manual). Or set invert via ADAM web UI.`
        : err.message || 'Unknown error'
      this.sendToRenderer('adam-error', `DI invert: ${hint}`)
    }
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }
}

// Singleton instance
const adamHandler = new AdamHandler()

// Exported functions matching main.ts expectations
export function connectAdam(host: string, port: number, window: BrowserWindow) {
  adamHandler.setWindow(window)
  adamHandler.connect(host, port)
}

export function disconnectAdam(window: BrowserWindow) {
  adamHandler.setWindow(window)
  adamHandler.disconnect()
}

export function setAdamDO(coil: number, value: boolean, window: BrowserWindow) {
  adamHandler.setWindow(window)
  adamHandler.writeDO(coil, value)
}

export function readAdamDIs(start: number, count: number, window: BrowserWindow) {
  adamHandler.setWindow(window)
  adamHandler.readDIs(start, count)
}

export function setAdamDIInvertMask(mask: number, registerAddress: number, window: BrowserWindow) {
  adamHandler.setWindow(window)
  adamHandler.setDIInvertMask(mask, registerAddress)
}
