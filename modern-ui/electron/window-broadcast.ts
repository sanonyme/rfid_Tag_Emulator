import { BrowserWindow } from 'electron'

/** Send an IPC event to every open, non-destroyed BrowserWindow. */
export function broadcastToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}
