import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface FixedReaderTcpPlugin {
  connect(options: { host: string; port: number }): Promise<void>
  disconnect(): Promise<void>
  /** JSON array of TagData (epc, tid, uid, antenna, rssi) */
  sendTags(options: { tagsJson: string; driverCode: string; delayMs: number }): Promise<void>
  cancelSend(): Promise<void>
  getConnected(): Promise<{ connected: boolean }>
  addListener(
    eventName: 'tcpProgress' | 'tcpComplete' | 'tcpError',
    listenerFunc: (event: { message: string }) => void,
  ): Promise<PluginListenerHandle>
}

export const FixedReaderTcp = registerPlugin<FixedReaderTcpPlugin>('FixedReaderTcp')
