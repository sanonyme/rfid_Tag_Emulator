import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Button } from './ui/button'
import { Terminal as TerminalIcon, Trash2, Power, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface AdminTerminalTabProps {
  /** When true, tab is visible - focus terminal */
  active?: boolean
}

interface TerminalTab {
  id: string
  title: string
}

let nextTabNum = 1

function generateTabId() {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function TerminalInstance({
  sessionId,
  active,
  onRegister,
  onUnregister,
  onExpectExit,
}: {
  sessionId: string
  active: boolean
  onRegister: (id: string, handler: { write: (data: string) => void; clear?: () => void }) => void
  onUnregister: (id: string) => void
  onExpectExit: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.shellStart) return

    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        cursor: 'hsl(var(--primary))',
      },
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    const focusTerm = () => term.focus()
    container.addEventListener('click', focusTerm)

    termRef.current = term
    fitRef.current = fitAddon

    onRegister(sessionId, {
      write: (data) => term.write(data),
      clear: () => term.clear(),
    })

    term.onData((data) => {
      window.electronAPI?.shellWrite?.(sessionId, data)
    })

    term.onResize(({ cols, rows }) => {
      window.electronAPI?.shellResize?.(sessionId, cols, rows)
    })

    window.electronAPI?.shellStart?.(sessionId, term.cols, term.rows)
    term.focus()

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      window.electronAPI?.shellResize?.(sessionId, term.cols, term.rows)
    })
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('click', focusTerm)
      resizeObserver.disconnect()
      onUnregister(sessionId)
      onExpectExit(sessionId)
      window.electronAPI?.shellKill?.(sessionId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [sessionId, onRegister, onUnregister, onExpectExit])

  useEffect(() => {
    if (active && termRef.current && fitRef.current) {
      fitRef.current.fit()
      window.electronAPI?.shellResize?.(sessionId, termRef.current.cols, termRef.current.rows)
      termRef.current.focus()
    }
  }, [active, sessionId])

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 w-full h-full"
      style={{
        paddingBottom: 20,
        boxSizing: 'border-box',
      }}
      role="application"
      aria-label="Terminal - click to focus and type"
    />
  )
}

export function AdminTerminalTab({ active }: AdminTerminalTabProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    { id: generateTabId(), title: `Terminal ${nextTabNum++}` },
  ])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [noElectron, setNoElectron] = useState(false)
  const termHandlersRef = useRef<Map<string, { write: (data: string) => void; clear?: () => void }>>(new Map())
  const expectedExitRef = useRef<Set<string>>(new Set())

  const activeTabIdResolved = activeTabId ?? tabs[0]?.id ?? null

  const onRegister = useCallback((id: string, handler: { write: (data: string) => void; clear?: () => void }) => {
    termHandlersRef.current.set(id, handler)
  }, [])

  const onUnregister = useCallback((id: string) => {
    termHandlersRef.current.delete(id)
  }, [])

  const onExpectExit = useCallback((id: string) => {
    expectedExitRef.current.add(id)
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.shellStart) {
      setNoElectron(true)
      return
    }

    const handleData = (sessionId: string, data: string) => {
      termHandlersRef.current.get(sessionId)?.write(data)
    }

    const handleExit = (sessionId: string, _code: number | null, _signal: string | null) => {
      if (expectedExitRef.current.has(sessionId)) {
        expectedExitRef.current.delete(sessionId)
        return
      }
      termHandlersRef.current.get(sessionId)?.write('\r\n\r\n[Shell exited]\r\n')
    }

    const cleanupData = window.electronAPI.onShellData?.(handleData)
    const cleanupExit = window.electronAPI.onShellExit?.(handleExit)

    return () => {
      cleanupData?.()
      cleanupExit?.()
    }
  }, [])

  const handleAddTab = () => {
    const newTab: TerminalTab = {
      id: generateTabId(),
      title: `Terminal ${nextTabNum++}`,
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    expectedExitRef.current.add(id)
    window.electronAPI?.shellKill?.(id)
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        setActiveTabId(null)
        nextTabNum = 2
        return [{ id: generateTabId(), title: 'Terminal 1' }]
      }
      if (activeTabIdResolved === id) {
        const idx = prev.findIndex((t) => t.id === id)
        const nextActive = prev[idx + 1] ?? prev[idx - 1]
        setActiveTabId(nextActive?.id ?? null)
      }
      return next
    })
  }

  const handleKillActive = () => {
    if (activeTabIdResolved) {
      expectedExitRef.current.add(activeTabIdResolved)
      window.electronAPI?.shellKill?.(activeTabIdResolved)
      termHandlersRef.current.get(activeTabIdResolved)?.write('\r\n[Shell killed]\r\n')
    }
  }

  const handleNewShell = () => {
    if (!activeTabIdResolved || !window.electronAPI?.shellStart) return
    termHandlersRef.current.get(activeTabIdResolved)?.clear?.()
    window.electronAPI.shellStart(activeTabIdResolved, 80, 24)
  }

  if (noElectron) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center" data-tour="tour-admin-terminal">
        <TerminalIcon className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground">
          Terminal is only available in the Electron desktop app.
        </p>
        <p className="text-sm text-muted-foreground">
          Run the app via <code className="bg-muted px-1 rounded">electron:dev</code> or build the desktop version.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0" data-tour="tour-admin-terminal">
      <div className="flex items-center gap-2 mb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={handleNewShell}>
              <Trash2 className="w-4 h-4 mr-1" />
              New Shell
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Clear terminal and start a fresh shell in this tab
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={handleKillActive}>
              <Power className="w-4 h-4 mr-1" />
              Kill
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Kill the shell process in the active tab
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex-1 min-h-[300px] flex flex-col rounded-lg border border-border/50 overflow-hidden bg-background cursor-text">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-border/50 bg-muted/30 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                activeTabIdResolved === tab.id
                  ? 'bg-background text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[120px]">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="ml-0.5 rounded p-0.5 hover:bg-muted-foreground/20 hover:text-foreground"
                aria-label="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </button>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleAddTab}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="New terminal"
              >
                <Plus className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>New terminal tab</TooltipContent>
          </Tooltip>
        </div>
        {/* Terminal content area */}
        <div className="flex-1 min-h-0 flex flex-col p-2 relative">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-session-id={tab.id}
              className={cn(
                'absolute inset-2 flex-1 min-h-0',
                activeTabIdResolved !== tab.id && 'pointer-events-none invisible'
              )}
            >
              <TerminalInstance
                sessionId={tab.id}
                active={!!active && activeTabIdResolved === tab.id}
                onRegister={onRegister}
                onUnregister={onUnregister}
                onExpectExit={onExpectExit}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
