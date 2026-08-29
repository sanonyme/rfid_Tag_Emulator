import { useState, useEffect, useRef } from 'react'
import {
  Radio, Smartphone, ScanLine, Terminal, Cloud, Globe,
  Code2, Sparkles, QrCode, Database, FolderInput, Link2, Radar, LineChart, Wifi, WifiOff, Moon, Sun,
  Search, Settings, User, Maximize2, RotateCcw, Clipboard, Braces, Layers, PanelTop, Keyboard,
  Play, History, ClipboardPaste, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'
import { isPopoutableTab } from '@/lib/popout-tabs'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { monoXs } from '@/lib/ui-tokens'

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
  activeTab?: string
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
  onToggleTheme: () => void
  isDark: boolean
  onOpenSettings: () => void
  onOpenProfiles: () => void
  onOpenBase64: () => void
  onOpenShortcuts?: () => void
  onPopOutTab?: (tabId: string) => void
  host: string
  isAdmin?: boolean
  onAdminLogin?: () => void
  onAdminLogout?: () => void
}

const TAB_COMMANDS_ALL: { value: string; label: string; icon: React.ReactNode; num?: number }[] = [
  { value: 'fixed', label: 'Fixed', icon: <Radio className="w-4 h-4" />, num: 1 },
  { value: 'handheld', label: 'Handheld', icon: <Smartphone className="w-4 h-4" />, num: 2 },
  { value: 'ocr', label: 'OCR', icon: <ScanLine className="w-4 h-4" />, num: 3 },
  { value: 'custom', label: 'Custom', icon: <Terminal className="w-4 h-4" />, num: 4 },
  { value: 'edge', label: 'Edge', icon: <Cloud className="w-4 h-4" />, num: 5 },
  { value: 'api', label: 'API', icon: <Globe className="w-4 h-4" />, num: 6 },
  { value: 'decoder', label: 'Decoder', icon: <Code2 className="w-4 h-4" />, num: 7 },
  { value: 'automation', label: 'Auto', icon: <Sparkles className="w-4 h-4" />, num: 8 },
  { value: 'generator', label: 'Gen', icon: <QrCode className="w-4 h-4" />, num: 9 },
  { value: 'database', label: 'Database (DB)', icon: <Database className="w-4 h-4" />, num: 0 },
  { value: 'sftp', label: 'SFTP', icon: <FolderInput className="w-4 h-4" /> },
  { value: 'netscan', label: 'LAN scan', icon: <Radar className="w-4 h-4" /> },
]

const TAB_COMMANDS_PUBLIC = TAB_COMMANDS_ALL.filter(
  (t) => (IS_MOBILE ? t.value !== 'sftp' && t.value !== 'netscan' : true),
)

const TAB_COMMANDS_BASE = TAB_COMMANDS_PUBLIC.map((t, i) => ({
  ...t,
  num: i + 1,
}))

const TAB_COMMAND_LINK2UID = { value: 'link2uid', label: 'Link→UID', icon: <Link2 className="w-4 h-4" />, num: 10 }
const TAB_COMMAND_TERMINAL = { value: 'terminal', label: 'Terminal', icon: <Terminal className="w-4 h-4" />, num: 11 }
const TAB_COMMAND_LOGS = { value: 'logs', label: 'Log Analyzer', icon: <LineChart className="w-4 h-4" />, num: 12 }
const TAB_COMMAND_LOGAGG = { value: 'logagg', label: 'Log Aggregator', icon: <Layers className="w-4 h-4" />, num: 13 }

export function CommandPalette({
  open,
  onOpenChange,
  onSwitchTab,
  activeTab,
  connected,
  onConnect,
  onDisconnect,
  onToggleTheme,
  isDark,
  onOpenSettings,
  onOpenProfiles,
  onOpenBase64,
  onOpenShortcuts,
  onPopOutTab,
  host,
  isAdmin,
  onAdminLogin,
  onAdminLogout,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const tabCommands = isAdmin
    ? [...TAB_COMMANDS_BASE, TAB_COMMAND_LINK2UID, TAB_COMMAND_TERMINAL, TAB_COMMAND_LOGS, TAB_COMMAND_LOGAGG]
    : TAB_COMMANDS_BASE

  const [adminLoginOpen, setAdminLoginOpen] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')

  const handleAdminLogin = async () => {
    setAdminError('')
    if (!window.electronAPI?.adminLogin) {
      setAdminError('Admin login unavailable')
      return
    }
    const result = await window.electronAPI.adminLogin(adminUser, adminPass)
    if (result.ok) {
      onAdminLogin?.()
      setAdminLoginOpen(false)
      onOpenChange(false)
      setAdminUser('')
      setAdminPass('')
      return
    }
    setAdminError(result.error ?? 'Invalid username or password')
  }

  const commands: Command[] = [
    ...tabCommands.map((t) => ({
      id: `tab-${t.value}`,
      label: `Go to ${t.label}`,
      icon: t.icon,
      shortcut: t.num !== undefined ? `Ctrl+${t.num}` : undefined,
      action: () => { onSwitchTab(t.value); onOpenChange(false) },
      group: 'Navigation',
    })),
    isAdmin
      ? {
          id: 'admin-logout',
          label: 'Admin Logout',
          icon: <User className="w-4 h-4" />,
          action: () => { onAdminLogout?.(); onOpenChange(false) },
          group: 'Admin',
        }
      : {
          id: 'admin-login',
          label: 'Admin Login',
          icon: <User className="w-4 h-4" />,
          action: () => setAdminLoginOpen(true),
          group: 'Admin',
        },
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
          label: host ? `Connect to ${host}` : 'Connect',
          icon: <Wifi className="w-4 h-4" />,
          action: () => {
            if (!host) {
              toast.message('Set a host in the connection panel first')
              onOpenChange(false)
              return
            }
            onConnect()
            onOpenChange(false)
          },
          group: 'Connection',
        },
    {
      id: 'copy-host',
      label: host ? `Copy Host IP (${host})` : 'Copy Host IP',
      icon: <Clipboard className="w-4 h-4" />,
      action: () => {
        if (host) {
          void navigator.clipboard.writeText(host)
          toast.success('Host copied')
        } else {
          toast.message('No host set')
        }
        onOpenChange(false)
      },
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
      id: 'open-shortcuts',
      label: 'Keyboard Shortcuts',
      icon: <Keyboard className="w-4 h-4" />,
      shortcut: '?',
      action: () => { onOpenShortcuts?.(); onOpenChange(false) },
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
    ...(activeTab && onPopOutTab && isPopoutableTab(activeTab)
      ? [{
          id: 'popout-tab',
          label: 'Pop out current tab',
          icon: <PanelTop className="w-4 h-4" />,
          action: () => { onPopOutTab(activeTab); onOpenChange(false) },
          group: 'Window',
        }]
      : []),
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
    {
      id: 'open-database',
      label: 'Open Database Explorer',
      icon: <Database className="w-4 h-4" />,
      action: () => { onSwitchTab('database'); onOpenChange(false) },
      group: 'Quick Jump',
    },
    {
      id: 'open-sftp',
      label: 'Open SFTP',
      icon: <FolderInput className="w-4 h-4" />,
      action: () => { onSwitchTab('sftp'); onOpenChange(false) },
      group: 'Quick Jump',
    },
    {
      id: 'open-netscan',
      label: 'Open LAN Scan',
      icon: <Radar className="w-4 h-4" />,
      action: () => { onSwitchTab('netscan'); onOpenChange(false) },
      group: 'Quick Jump',
    },
    {
      id: 'open-automation',
      label: 'Open Automation',
      icon: <Play className="w-4 h-4" />,
      action: () => { onSwitchTab('automation'); onOpenChange(false) },
      group: 'Quick Jump',
    },
    {
      id: 'open-edge',
      label: 'Open Edge',
      icon: <Cloud className="w-4 h-4" />,
      action: () => { onSwitchTab('edge'); onOpenChange(false) },
      group: 'Quick Jump',
    },
    {
      id: 'decode-clipboard',
      label: 'Decode EPC from clipboard',
      icon: <ClipboardPaste className="w-4 h-4" />,
      action: async () => {
        onSwitchTab('decoder')
        onOpenChange(false)
        try {
          const text = await navigator.clipboard.readText()
          window.dispatchEvent(new CustomEvent('zeus:decode-clipboard', { detail: { text } }))
        } catch {
          toast.error('Could not read clipboard')
        }
      },
      group: 'Building blocks',
    },
    {
      id: 'open-scripts-folder',
      label: 'Open automation scripts folder',
      icon: <FolderOpen className="w-4 h-4" />,
      action: async () => {
        onOpenChange(false)
        const r = await window.electronAPI?.automationOpenScriptsFolder?.()
        if (!r) {
          toast.error('Desktop app required')
          return
        }
        if (!r.ok) toast.error(r.error)
        else toast.success(`Scripts folder: ${r.path}`)
      },
      group: 'Building blocks',
    },
    {
      id: 'recent-hint',
      label: 'Tip: Ctrl+K from anywhere',
      icon: <History className="w-4 h-4" />,
      action: () => onOpenChange(false),
      group: 'Tips',
    },
  ]

  const filtered = query.trim()
    ? commands.filter((c) => {
        const q = query.toLowerCase()
        return c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.id.includes(q)
      })
    : commands.filter((c) => c.group !== 'Tips')

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
    if (adminLoginOpen) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAdminLoginOpen(false)
      }
      return
    }
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
    <div
      data-command-palette
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => onOpenChange(false)}
    >
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
            placeholder="Jump, connect, pop out, settings…"
            className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            disabled={adminLoginOpen}
          />
          {host && (
            <span className={cn(monoXs, 'hidden sm:inline text-muted-foreground truncate max-w-[120px]')}>
              {host}
            </span>
          )}
          <kbd className={cn(monoXs, 'hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-medium text-muted-foreground')}>
            ESC
          </kbd>
        </div>

        {adminLoginOpen ? (
          <div className="p-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Admin Login</h3>
                <p className="text-xs text-muted-foreground">Use the local credentials to enable admin tools.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-user" className="text-xs">Username</Label>
                <Input
                  id="admin-user"
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  placeholder="admin"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-pass" className="text-xs">Password</Label>
                <Input
                  id="admin-pass"
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  placeholder="admin"
                  className="h-9"
                />
              </div>

              {adminError && <p className="text-xs text-destructive">{adminError}</p>}

              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={handleAdminLogin}>
                  Login
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setAdminLoginOpen(false)
                    setAdminError('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2">
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
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
                        idx === selectedIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent',
                      )}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className={cn('shrink-0', idx === selectedIndex ? 'text-primary-foreground' : 'text-muted-foreground')}>{cmd.icon}</span>
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className={cn(
                          monoXs,
                          'hidden sm:inline-flex h-5 items-center gap-1 rounded border px-1.5 font-medium',
                          idx === selectedIndex
                            ? 'border-primary-foreground/30 text-primary-foreground/70'
                            : 'border-border bg-muted text-muted-foreground',
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
        )}

        {!adminLoginOpen && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border text-xs text-muted-foreground">
            <span>
              <kbd className={cn(monoXs, 'rounded border border-border bg-muted px-1')}>↑↓</kbd> navigate
            </span>
            <span>
              <kbd className={cn(monoXs, 'rounded border border-border bg-muted px-1')}>↵</kbd> select
            </span>
            <span>
              <kbd className={cn(monoXs, 'rounded border border-border bg-muted px-1')}>Ctrl+K</kbd> toggle
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
