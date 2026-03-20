import { registerPlugin } from '@capacitor/core'

export interface OCRTcpPlugin {
  send(options: { host: string; message: string }): Promise<{ ok: boolean; error?: string }>
}

export const OCRTcp = registerPlugin<OCRTcpPlugin>('OCRTcp')
