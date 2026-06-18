import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderInput, Plus, X, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SftpSessionPanel } from './sftp/SftpSessionPanel'

type SftpConnectionTab = {
  id: string
  label: string
}

interface SftpTabProps {
  host: string
  setHost: (h: string) => void
}

function newTabId(): string {
  return `sftp-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTab(defaultHost: string): SftpConnectionTab {
  const hostLabel = defaultHost.trim()
  return {
    id: newTabId(),
    label: hostLabel ? `${hostLabel}:22` : 'New connection',
  }
}

export function SftpTab({ host }: SftpTabProps) {
  const hasSftp = Boolean(window.electronAPI?.sftpConnect)

  const initialTab = createTab(host)
  const [tabs, setTabs] = useState<SftpConnectionTab[]>(() => [initialTab])
  const [activeTabId, setActiveTabId] = useState(() => initialTab.id)
  const disconnectRef = useRef<Map<string, () => Promise<void>>>(new Map())

  useEffect(() => {
    return () => {
      void Promise.all([...disconnectRef.current.values()].map((fn) => fn()))
      disconnectRef.current.clear()
    }
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const registerDisconnect = useCallback((tabId: string, fn: () => Promise<void>) => {
    disconnectRef.current.set(tabId, fn)
  }, [])

  const unregisterDisconnect = useCallback((tabId: string) => {
    disconnectRef.current.delete(tabId)
  }, [])

  const handleConnectionChange = useCallback(
    (tabId: string, info: { connected: boolean; host?: string; port?: number; label?: string }) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t
          return {
            ...t,
            label: info.label ?? (info.host ? `${info.host}:${info.port ?? 22}` : 'New connection'),
          }
        }),
      )
    },
    [],
  )

  const addTab = useCallback(() => {
    const tab = createTab(host)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [host])

  const closeTab = useCallback(
    async (tabId: string) => {
      const disconnect = disconnectRef.current.get(tabId)
      if (disconnect) await disconnect()

      setTabs((prev) => {
        if (prev.length <= 1) {
          const fresh = createTab(host)
          setActiveTabId(fresh.id)
          return [fresh]
        }
        const next = prev.filter((t) => t.id !== tabId)
        if (tabId === activeTabId) {
          setActiveTabId(next[next.length - 1]!.id)
        }
        return next
      })
      unregisterDisconnect(tabId)
    },
    [activeTabId, host, unregisterDisconnect],
  )

  if (!hasSftp) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6" data-tour="tour-sftp">
        <Monitor className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">SFTP explorer</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            SFTP is only available in the desktop Electron app. Run the packaged or dev desktop build to
            connect over SSH and browse remote files.
          </p>
        </div>
      </div>
    )
  }

  if (!activeTab) return null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-lg border border-border/50 bg-muted/20 px-1 py-1"
        role="tablist"
        aria-label="SFTP connections"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={cn(
                'group flex max-w-[220px] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                isActive
                  ? 'border-primary/50 bg-background text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                onClick={() => setActiveTabId(tab.id)}
                title={tab.label}
              >
                <FolderInput className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-mono">{tab.label}</span>
              </button>
              <button
                type="button"
                className="rounded p-0.5 opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                aria-label={`Close ${tab.label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTab(tab.id)
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background/60 hover:text-foreground"
          aria-label="New SFTP connection"
          onClick={addTab}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <SftpSessionPanel
            key={tab.id}
            tabId={tab.id}
            isActive={tab.id === activeTabId}
            defaultHost={host}
            onConnectionChange={(info) => handleConnectionChange(tab.id, info)}
            onRegisterDisconnect={(fn) => registerDisconnect(tab.id, fn)}
            onUnregisterDisconnect={() => unregisterDisconnect(tab.id)}
          />
        ))}
      </div>
    </div>
  )
}
