import type { ElectronAPI } from '@/types/electron'
import { initMockElectron } from './mock-electron'
import {
  ZEUS_EVENT_CHANNELS,
  ZEUS_INVOKE_CHANNELS,
  ZEUS_SEND_CHANNELS,
  channelToCamelMethod,
  eventChannelToListenerMethod,
} from './zeus-ipc-channels'

type ZeusEventPayload = { channel: string; args: unknown[] }

const zeusChannelListeners = new Map<string, Set<(...args: unknown[]) => void>>()
let zeusListenerReady = false

async function zeusInvoke(channel: string, args: unknown[] = []): Promise<unknown> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('zeus_invoke', { channel, args })
}

async function zeusSend(channel: string, args: unknown[] = []): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('zeus_send', { channel, args })
}

function onZeusChannel(channel: string, callback: (...args: unknown[]) => void): () => void {
  if (!zeusChannelListeners.has(channel)) {
    zeusChannelListeners.set(channel, new Set())
  }
  zeusChannelListeners.get(channel)!.add(callback)
  return () => zeusChannelListeners.get(channel)?.delete(callback)
}

async function ensureZeusEventPump(): Promise<void> {
  if (zeusListenerReady) return
  zeusListenerReady = true
  const { listen } = await import('@tauri-apps/api/event')
  await listen<ZeusEventPayload>('zeus-event', (event) => {
    const { channel, args } = event.payload
    const listeners = zeusChannelListeners.get(channel)
    if (!listeners) return
    for (const cb of listeners) cb(...args)
  })
}

function invokeMethod(channel: string) {
  return (...args: unknown[]) => zeusInvoke(channel, args)
}

function sendMethod(channel: string) {
  return (...args: unknown[]) => {
    void zeusSend(channel, args)
  }
}

function listenMethod(channel: string) {
  return (callback: (...args: unknown[]) => void) => {
    void ensureZeusEventPump()
    return onZeusChannel(channel, callback)
  }
}

function buildUpdaterApi(): Record<string, unknown> {
  return {
    onCheckingForUpdate: listenMethod('checking-for-update'),
    onUpdateAvailable: listenMethod('update-available'),
    onUpdateNotAvailable: listenMethod('update-not-available'),
    onUpdateError: listenMethod('update-error'),
    onDownloadProgress: listenMethod('download-progress'),
    onUpdateDownloaded: listenMethod('update-downloaded'),
  }
}

function buildPopoutApi(): Record<string, unknown> {
  return {
    popoutGetWindowInfo: () => zeusInvoke('popout-get-window-info', []),
    popoutOpen: (tabId: string, title: string, initState: unknown) =>
      zeusInvoke('popout-open', [tabId, title, initState]),
    popoutDock: (tabId: string) => zeusInvoke('popout-dock', [tabId]),
    popoutGetInitState: () => zeusInvoke('popout-get-init-state', []),
    popoutList: () => zeusInvoke('popout-list', []),
    popoutBroadcastState: (state: Record<string, unknown>, connected: boolean) => {
      void zeusSend('popout-broadcast-state', [state, connected])
    },
    onPopoutClosed: listenMethod('popout-closed'),
    onPopoutStateUpdate: listenMethod('popout-state-update'),
  }
}

function buildZeusApi(): Record<string, unknown> {
  const api: Record<string, unknown> = {}
  for (const channel of ZEUS_INVOKE_CHANNELS) {
    api[channelToCamelMethod(channel)] = invokeMethod(channel)
  }
  for (const channel of ZEUS_SEND_CHANNELS) {
    api[channelToCamelMethod(channel)] = sendMethod(channel)
  }
  for (const channel of ZEUS_EVENT_CHANNELS) {
    api[eventChannelToListenerMethod(channel)] = listenMethod(channel)
  }
  return api
}

async function buildDialogApi(): Promise<Partial<ElectronAPI>> {
  const { save, open } = await import('@tauri-apps/plugin-dialog')

  return {
    dbSaveExportTable: async (database: string, table: string, format: 'csv' | 'sql') => {
      const ext = format === 'csv' ? 'csv' : 'sql'
      const filePath = await save({
        defaultPath: `${database}_${table}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })
      if (!filePath) return { ok: false as const, cancelled: true as const }
      return zeusInvoke('db-save-export-table-to-path', [database, table, format, filePath]) as ReturnType<
        ElectronAPI['dbSaveExportTable']
      >
    },
    dbSaveExportDatabaseSql: async (database: string) => {
      const filePath = await save({
        defaultPath: `${database}_dump.sql`,
        filters: [{ name: 'SQL', extensions: ['sql'] }],
      })
      if (!filePath) return { ok: false as const, cancelled: true as const }
      return zeusInvoke('db-save-export-database-sql-to-path', [database, filePath]) as ReturnType<
        ElectronAPI['dbSaveExportDatabaseSql']
      >
    },
    dbSaveExportDatabaseCsv: async (database: string) => {
      const folderPath = await open({
        title: `Choose folder for ${database} CSV exports`,
        directory: true,
        multiple: false,
      })
      if (!folderPath || Array.isArray(folderPath)) return { ok: false as const, cancelled: true as const }
      return zeusInvoke('db-save-export-database-csv-to-path', [database, folderPath]) as ReturnType<
        ElectronAPI['dbSaveExportDatabaseCsv']
      >
    },
    localPickFolder: async () => {
      const folderPath = await open({ directory: true, multiple: false })
      if (!folderPath || Array.isArray(folderPath)) return { ok: false as const, cancelled: true as const }
      return { ok: true as const, path: folderPath }
    },
    sftpDownloadSaveDialog: async (sessionId: string, remotePath: string, operationId: string) => {
      const base = remotePath.replace(/\\/g, '/').split('/').pop() || 'download'
      const localPath = await save({ defaultPath: base, filters: [{ name: 'All files', extensions: ['*'] }] })
      if (!localPath) return { ok: false as const, error: 'Cancelled', cancelled: true as const }
      const result = (await zeusInvoke('sftp-download-to-path', [
        sessionId,
        remotePath,
        localPath,
        operationId,
      ])) as { ok: true } | { ok: false; error: string }
      if (result.ok) return { ok: true as const, localPath }
      return { ok: false as const, error: result.error ?? 'Download failed' }
    },
    logAggregatorPickZip: async () => {
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Zip archives', extensions: ['zip'] }],
      })
      if (!filePath || Array.isArray(filePath)) return { ok: false as const, cancelled: true as const }
      return { ok: true as const, path: filePath }
    },
    logAggregatorPickOutput: async () => {
      const folderPath = await open({ directory: true, multiple: false })
      if (!folderPath || Array.isArray(folderPath)) return { ok: false as const, cancelled: true as const }
      return { ok: true as const, path: folderPath }
    },
  }
}

/** Install `window.electronAPI` backed by pure Rust Tauri backend. */
export async function initTauriBridge(): Promise<void> {
  await ensureZeusEventPump()

  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const { invoke } = await import('@tauri-apps/api/core')
  const platform = await invoke<string>('get_platform')

  const api = {
    ...buildZeusApi(),
    ...buildPopoutApi(),
    ...buildUpdaterApi(),
    ...(await buildDialogApi()),
    platform,
    minimize: () => { void win.minimize() },
    maximize: () => { void win.toggleMaximize() },
    close: () => { void win.close() },
  }

  initMockElectron()
  Object.assign(window.electronAPI!, api)
}
