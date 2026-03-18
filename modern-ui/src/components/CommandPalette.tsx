import { useState, useEffect, useRef } from 'react'
import {
  Radio, Smartphone, ScanLine, Terminal, Server, Globe,
  Code2, Workflow, QrCode, Wifi, WifiOff, Moon, Sun,
  Search, Settings, User, Maximize2, RotateCcw, Clipboard, Braces
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'

interface Command {
  id: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  group: string
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSwitchTab: (tab: string) => void
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
  onToggleTheme: () => void
  isDark: boolean
  onOpenSettings: () => void
  onOpenProfiles: () => void
  onOpenBase64: () => void
  host: string
}

const TAB_COMMANDS_ALL: { value: string; label: string; icon: React.ReactNode; num: number }[] = [
  { value: 'fixed', label: 'Fixed', icon: <Radio className="w-4 h-4" />, num: 1 },
  { value: 'handheld', label: 'Handheld', icon: <Smartphone className="w-4 h-4" />, num: 2 },
  { value: 'ocr', label: 'OCR', icon: <ScanLine className="w-4 h-4" />, num: 3 },
  { value: 'custom', label: 'Custom', icon: <Terminal className="w-4 h-4" />, num: 4 },
  { value: 'adam', label: 'ADAM', icon: <Server className="w-4 h-4" />, num: 5 },
  { value: 'api', label: 'API', icon: <Globe className="w-4 h-4" />, num: 6 },
  { value: 'decoder', label: 'Decoder', icon: <Code2 className="w-4 h-4" />, num: 7 },
  { value: 'automation', label: 'Auto', icon: <Workflow className="w-4 h-4" />, num: 8 },
  { value: 'generator', label: 'Gen', icon: <QrCode className="w-4 h-4" />, num: 9 },
]

const TAB_COMMANDS = IS_MOBILE
  ? TAB_COMMANDS_ALL.filter((t) => t.value !== 'adam').map((t, i) => ({ ...t, num: i + 1 }))
  : TAB_COMMANDS_ALL

export function CommandPalette({
  open,
  onOpenChange,
  onSwitchTab,
  connected,
  onConnect,
  onDisconnect,
  onToggleTheme,
  isDark,
  onOpenSettings,
  onOpenProfiles,
  onOpenBase64,
  host,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands: Command[] = [
    ...TAB_COMMANDS.map((t) => ({
      id: `tab-${t.value}`,
      label: `Go to ${t.label}`,
      icon: t.icon,
      shortcut: `Ctrl+${t.num}`,
      action: () => { onSwitchTab(t.value); onOpenChange(false) },
      group: 'Navigation',
    })),
    connected
      ? {
          id: 'disconnect',
          label: 'Disconnect',
          icon: <WifiOff className="w-4 h-4" />,
          action: () => { onDisconnect(); onOpenChange(false) },
          group: 'Connection',
        }
      : {
          id: 'connect',
          label: 'Connect',
          icon: <Wifi className="w-4 h-4" />,
          action: () => { onConnect(); onOpenChange(false) },
          group: 'Connection',
        },
    {
      id: 'toggle-theme',
      label: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
      action: () => { onToggleTheme(); onOpenChange(false) },
      group: 'Appearance',
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      icon: <Settings className="w-4 h-4" />,
      action: () => { onOpenSettings(); onOpenChange(false) },
      group: 'General',
    },
    {
      id: 'open-profiles',
      label: 'Open Profiles',
      icon: <User className="w-4 h-4" />,
      action: () => { onOpenProfiles(); onOpenChange(false) },
      group: 'General',
    },
    {
      id: 'toggle-fullscreen',
      label: 'Toggle Fullscreen',
      icon: <Maximize2 className="w-4 h-4" />,
      shortcut: 'F11',
      action: () => {
        if (window.electronAPI?.maximize) window.electronAPI.maximize()
        onOpenChange(false)
      },
      group: 'Window',
    },
    {
      id: 'reload-app',
      label: 'Reload App',
      icon: <RotateCcw className="w-4 h-4" />,
      shortcut: 'Ctrl+R',
      action: () => { window.location.reload() },
      group: 'Window',
    },
    {
      id: 'copy-host',
      label: connected ? `Copy Host IP (${host})` : 'Copy Host IP',
      icon: <Clipboard className="w-4 h-4" />,
      action: () => {
        if (host) navigator.clipboard.writeText(host)
        onOpenChange(false)
      },
      group: 'Connection',
    },
    {
      id: 'open-base64',
      label: 'Open Base64 & Hex Converter',
      icon: <Braces className="w-4 h-4" />,
      action: () => { onSwitchTab('api'); onOpenBase64(); onOpenChange(false) },
      group: 'Tools',
    },
    {
      id: 'open-qrcode',
      label: 'Open QR Code Generator',
      icon: <QrCode className="w-4 h-4" />,
      action: () => { onSwitchTab('generator'); onOpenChange(false) },
      group: 'Tools',
    },
  ]

  const filtered = query.trim()
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selectedIndex]?.action()
    } else if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  if (!open) return null

  const groups: Record<string, Command[]> = {}
  for (const cmd of filtered) {
    if (!groups[cmd.group]) groups[cmd.group] = []
    groups[cmd.group].push(cmd)
  }

  let globalIdx = 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {Object.entries(groups).map(([group, cmds]) => (
            <div key={group}>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
              {cmds.map((cmd) => {
                const idx = globalIdx++
                return (
                  <button
                    key={cmd.id}
                    data-selected={idx === selectedIndex}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                      idx === selectedIndex
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    )}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className={cn("shrink-0", idx === selectedIndex ? "text-primary-foreground" : "text-muted-foreground")}>{cmd.icon}</span>
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className={cn(
                        "hidden sm:inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium",
                        idx === selectedIndex
                          ? "border-primary-foreground/30 text-primary-foreground/70"
                          : "border-border bg-muted text-muted-foreground"
                      )}>
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <span>
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">Ctrl+K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  )
}
