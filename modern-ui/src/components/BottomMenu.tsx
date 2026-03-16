import { useRef, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Zap,
  FolderOpen,
  Save,
  Settings,
  Sun,
  Moon,
  Monitor,
  Radio,
  Smartphone,
  Workflow,
  ChevronRight,
  Keyboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { applyTheme, getSavedTheme } from '@/lib/themes'

const QUICK_TABS = [
  { id: 'fixed', icon: Radio, label: 'Fixed Reader' },
  { id: 'handheld', icon: Smartphone, label: 'Handheld' },
  { id: 'automation', icon: Workflow, label: 'Auto' },
] as const

const THEME_OPTIONS = [
  { key: 'light', icon: Sun, text: 'Light' },
  { key: 'dark', icon: Moon, text: 'Dark' },
  { key: 'system', icon: Monitor, text: 'System' },
] as const

interface BottomMenuProps {
  activeTab: string
  onSwitchTab: (tab: string) => void
  onOpenProfiles: () => void
  onOpenSaveCurrent: () => void
  onOpenSettings: () => void
  onOpenShortcuts?: () => void
  /** When true, renders inline (e.g. in title bar) with submenu opening downward */
  inline?: boolean
}

export function BottomMenu({
  activeTab,
  onSwitchTab,
  onOpenProfiles,
  onOpenSaveCurrent,
  onOpenSettings,
  onOpenShortcuts,
  inline = false,
}: BottomMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'default' | 'tabs' | 'profiles' | 'theme'>('default')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme')
    return (saved === 'light' || saved === 'dark' ? saved : 'system') as 'light' | 'dark' | 'system'
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setView('default')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const applyThemeOption = (key: 'light' | 'dark' | 'system') => {
    setTheme(key)
    localStorage.setItem('theme', key)
    if (key === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', prefersDark)
      applyTheme(getSavedTheme(), prefersDark)
    } else {
      document.documentElement.classList.toggle('dark', key === 'dark')
      applyTheme(getSavedTheme(), key === 'dark')
    }
  }

  const sharedHover =
    'group transition-all duration-150 px-3 py-2 text-sm text-muted-foreground w-full text-left rounded-xl hover:bg-muted/80 hover:text-foreground'

  const content =
    view === 'profiles' ? (
      <div className="space-y-0.5 min-w-[180px] p-1.5">
        <button onClick={() => { onOpenProfiles(); setView('default') }} className={`${sharedHover} flex items-center gap-3`}>
          <FolderOpen size={18} className="shrink-0" />
          <span>Load Profile</span>
        </button>
        <button onClick={() => { onOpenSaveCurrent(); setView('default') }} className={`${sharedHover} flex items-center gap-3`}>
          <Save size={18} className="shrink-0" />
          <span>Save Current</span>
        </button>
      </div>
    ) : view === 'tabs' ? (
      <div className="space-y-0.5 min-w-[200px] p-1.5">
        {QUICK_TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              onSwitchTab(id)
              setView('default')
            }}
            className={cn(
              sharedHover,
              'flex items-center gap-3',
              activeTab === id && 'bg-primary/15 text-primary'
            )}
          >
            <Icon size={18} className="text-muted-foreground group-hover:text-foreground shrink-0" />
            <span className="flex-1">{label}</span>
            {activeTab === id && <ChevronRight size={14} className="text-primary" />}
          </button>
        ))}
      </div>
    ) : view === 'theme' ? (
      <div className="flex items-center gap-1.5 min-w-[240px] p-1.5">
        {THEME_OPTIONS.map(({ key, icon: Icon, text }) => (
          <button
            key={key}
            onClick={() => applyThemeOption(key as 'light' | 'dark' | 'system')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition-all duration-150 flex-1',
              theme === key
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <Icon size={18} className="shrink-0" />
            <span className="text-sm font-medium">{text}</span>
          </button>
        ))}
      </div>
    ) : null

  const mainActions: Array<{ id: string; icon: typeof Zap; label: string; onClick?: () => void }> = [
    { id: 'tabs', icon: Zap, label: 'Quick tabs' },
    { id: 'profiles', icon: FolderOpen, label: 'Profiles' },
    { id: 'shortcuts', icon: Keyboard, label: 'Shortcuts', onClick: onOpenShortcuts },
    { id: 'settings', icon: Settings, label: 'Settings', onClick: onOpenSettings },
    { id: 'theme', icon: theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor, label: 'Theme' },
  ]

  const submenuPlacement = inline
    ? 'top-full left-0 mt-1.5'
    : 'bottom-full right-0 mb-2'
  const submenuOrigin = inline ? 'top left' : 'right bottom'
  const submenuY = inline ? -8 : 8
  const containerClass = inline ? 'relative' : 'fixed bottom-6 right-6 z-50'

  return (
    <div ref={containerRef} className={containerClass}>
      {/* Animated submenu - high z-index so it's never covered */}
      <AnimatePresence mode="wait">
        {view !== 'default' && content && (
          <motion.div
            key="submenu"
            initial={{ opacity: 0, y: inline ? -submenuY : submenuY, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: inline ? -submenuY : submenuY, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn('absolute z-[9999]', submenuPlacement)}
            style={{ transformOrigin: submenuOrigin }}
          >
            <div className="rounded-xl bg-background/95 backdrop-blur-xl border border-border shadow-xl overflow-visible">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar - compact height, lower than title bar */}
      <div className="flex items-center gap-0.5 bg-background/80 backdrop-blur-md border border-border/50 rounded-lg p-1 h-9">
        {mainActions.map(({ id, icon: Icon, label, onClick }) => (
          <button
            key={id}
            title={label}
            className={cn(
              'p-1.5 rounded-md transition-all duration-150',
              view === id ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              if (onClick) {
                onClick()
                setView('default')
              } else {
                setView(view === id ? 'default' : (id as 'tabs' | 'profiles' | 'theme'))
              }
            }}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  )
}
