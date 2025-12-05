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

export interface VendorDriver {
  code: string
  name: string
}

export interface LogEntry {
  timestamp: string
  message: string
}

