import { useEffect, useState } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { TabsList, TabsTrigger } from './ui/tabs'
import {
  Radio,
  Smartphone,
  ScanLine,
  Terminal,
  Globe,
  Code2,
  Sparkles,
  QrCode,
  Database,
  FolderInput,
  Link2,
  Radar,
  LineChart,
  Layers,
  Cloud,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Braces,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'
import { PopOutButton } from './PopOutButton'
import { isPopoutableTab } from '@/lib/popout-tabs'
import { GenModeHoverTarget } from './GenModeFlyout'
import type { GenMode } from '@/lib/gen-modes'

type TabItem = { value: string; label: string; icon: LucideIcon; badge?: string }
type TabGroup = { id: string; label: string; items: TabItem[] }

const GROUPS: TabGroup[] = [
  {
    id: 'emulators',
    label: 'Emulators',
    items: [
      { value: 'fixed', label: 'Fixed', icon: Radio },
      { value: 'handheld', label: 'Handheld', icon: Smartphone },
      { value: 'ocr', label: 'OCR', icon: ScanLine },
      { value: 'custom', label: 'Custom', icon: Terminal },
      { value: 'edge', label: 'Edge', icon: Cloud },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { value: 'api', label: 'API', icon: Globe },
      { value: 'decoder', label: 'Decoder', icon: Code2 },
      { value: 'jsonlint', label: 'JSON Lint', icon: Braces },
      { value: 'automation', label: 'Automation', icon: Sparkles },
      { value: 'generator', label: 'Generator', icon: QrCode },
      { value: 'database', label: 'Database', icon: Database },
      { value: 'sftp', label: 'Files', icon: FolderInput },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    items: [{ value: 'netscan', label: 'LAN Scan', icon: Radar }],
  },
]

const ADMIN_GROUP: TabGroup = {
  id: 'admin',
  label: 'Admin',
  items: [
    { value: 'link2uid', label: 'Link → UID', icon: Link2 },
    { value: 'terminal', label: 'Terminal', icon: Terminal },
    { value: 'logs', label: 'Log Analyzer', icon: LineChart, badge: 'BETA' },
    { value: 'logagg', label: 'Log Aggregator', icon: Layers },
  ],
}

const STORAGE_KEY = 'tab-sidebar-expanded'
const LEGACY_STORAGE_KEY = 'admin-sidebar-expanded'

interface TabSidebarProps {
  value: string
  className?: string
  poppedOutTabs?: Set<string>
  onPopOut?: (tabId: string) => void
  /** When true, include Admin tools and use the Admin brand. */
  isAdmin?: boolean
  /** Force collapsed icon-only rail (settings: icon-rail). */
  forceCollapsed?: boolean
  genMode?: GenMode
  onGenModeChange?: (mode: GenMode) => void
}

function readExpandedPreference(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw == null ? true : raw !== 'false'
  } catch {
    return true
  }
}

export function TabSidebar({
  value,
  className,
  poppedOutTabs,
  onPopOut,
  isAdmin = false,
  forceCollapsed = false,
  genMode = 'barcode',
  onGenModeChange,
}: TabSidebarProps) {
  const [expandedPref, setExpandedPref] = useState(readExpandedPreference)
  const expanded = forceCollapsed ? false : expandedPref

  useEffect(() => {
    if (forceCollapsed) return
    try {
      localStorage.setItem(STORAGE_KEY, String(expandedPref))
    } catch {
      /* ignore */
    }
  }, [expandedPref, forceCollapsed])

  const groups = [...GROUPS, ...(isAdmin ? [ADMIN_GROUP] : [])]
    .map((g) => ({
      ...g,
      items: IS_MOBILE
        ? g.items.filter((t) => t.value !== 'netscan')
        : g.items,
    }))
    .filter((g) => g.items.length > 0)

  const brandLabel = isAdmin ? 'Admin' : 'Menu'
  const BrandIcon = isAdmin ? Shield : Layers

  const ToggleButton = forceCollapsed ? null : (
    <button
      type="button"
      onClick={() => setExpandedPref((v) => !v)}
      title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      className={cn(
        'flex items-center justify-center rounded-lg w-8 h-8 shrink-0',
        'text-muted-foreground hover:text-foreground',
        'bg-muted/40 hover:bg-muted/70 border border-border/40',
        'transition-colors',
      )}
    >
      {expanded ? (
        <PanelLeftClose className="w-4 h-4" strokeWidth={2.25} />
      ) : (
        <PanelLeftOpen className="w-4 h-4" strokeWidth={2.25} />
      )}
    </button>
  )

  return (
    <LayoutGroup id="tab-sidebar">
      <aside
        data-tour="tour-tab-nav"
        aria-label={isAdmin ? 'Admin navigation' : 'App navigation'}
        className={cn(
          'relative flex flex-col shrink-0 border-r border-border/50',
          'bg-gradient-to-b from-background/85 to-background/60 backdrop-blur-sm',
          'transition-[width] duration-300 ease-out',
          // Allow Gen hover flyout to escape sideways; list still scrolls vertically.
          expanded ? 'w-56 overflow-visible' : 'w-[3.5rem] overflow-visible',
          className,
        )}
      >
        {/* Header: brand + expand/collapse toggle */}
        <div
          className={cn(
            'flex items-center border-b border-border/40 shrink-0 h-12',
            expanded ? 'px-2.5 justify-between gap-2' : 'px-2 justify-center',
          )}
        >
          {expanded ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                  <BrandIcon className="w-4 h-4 text-primary" strokeWidth={2.5} />
                </div>
                <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-foreground/80 truncate">
                  {brandLabel}
                </span>
              </div>
              {ToggleButton}
            </>
          ) : (
            ToggleButton ?? (
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                <BrandIcon className="w-4 h-4 text-primary" strokeWidth={2.5} />
              </div>
            )
          )}
        </div>

        {/* Navigation list */}
        <TabsList
          className={cn(
            'flex-1 flex flex-col items-stretch gap-0 bg-transparent h-auto rounded-none',
            'overflow-y-auto overflow-x-visible py-2',
            expanded ? 'px-2' : 'px-2',
          )}
        >
          {groups.map((group, gIdx) => (
            <div key={group.id} className="flex flex-col">
              {/* Group separator */}
              {gIdx > 0 &&
                (expanded ? (
                  <div className="h-px bg-border/50 mx-1 my-2" />
                ) : (
                  <div className="h-px bg-border/50 mx-2 my-1.5" />
                ))}

              {/* Group header (expanded only) */}
              {expanded && (
                <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 whitespace-nowrap">
                  {group.label}
                </div>
              )}

              {/* Items */}
              <div className={cn('flex flex-col', expanded ? 'gap-0.5' : 'gap-1 items-center')}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = value === item.value
                  const canPopOut = Boolean(onPopOut && isPopoutableTab(item.value))
                  const isGen = item.value === 'generator' && Boolean(onGenModeChange)

                  const row = (
                    <>
                    <TabsTrigger
                      value={item.value}
                      title={!expanded ? item.label : undefined}
                      className={cn(
                        'group relative cursor-pointer flex items-center rounded-lg text-sm font-medium',
                        'border-0 bg-transparent shadow-none',
                        'outline-none focus:outline-none focus-visible:outline-none',
                        'ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                        'text-muted-foreground hover:text-foreground',
                        'data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:text-white',
                        'data-[state=active]:shadow-none',
                        'transition-colors duration-150',
                        expanded
                          ? cn('gap-2.5 px-2.5 py-2 justify-start', canPopOut ? 'flex-1 min-w-0' : 'w-full')
                          : 'justify-center w-9 h-9 p-0',
                        (item.value === 'automation' || item.value === 'jsonlint') &&
                          'ring-1 ring-inset ring-primary/35 text-primary/80 hover:text-primary dark:ring-white/25',
                      )}
                    >
                      {!isActive && (
                        <span className="absolute inset-0 rounded-lg bg-foreground/0 group-hover:bg-foreground/5 transition-colors pointer-events-none" />
                      )}
                      {isActive && (
                        <motion.div
                          layoutId="tab-sidebar-indicator"
                          layout="position"
                          className="absolute inset-0 rounded-lg pointer-events-none"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        >
                          <span className="absolute inset-0 rounded-lg bg-primary/12 dark:bg-white/10" />
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        </motion.div>
                      )}
                      <Icon
                        className={cn(
                          'relative z-10 shrink-0',
                          expanded ? 'w-4 h-4' : 'w-[18px] h-[18px]',
                        )}
                        strokeWidth={2.25}
                      />
                      {expanded && (
                        <>
                          <span className="relative z-10 truncate">{item.label}</span>
                          {item.badge && (
                            <span
                              className={cn(
                                'relative z-10 ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold tracking-wider',
                                'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30',
                                'dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/30',
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {!expanded && item.badge && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-0.5 right-0.5 z-10 h-1.5 w-1.5 rounded-full',
                            'bg-amber-500 ring-1 ring-background',
                            'dark:bg-amber-400',
                          )}
                        />
                      )}
                    </TabsTrigger>
                    {expanded && canPopOut && (
                      <PopOutButton
                        tabId={item.value}
                        onPopOut={onPopOut!}
                        isPoppedOut={poppedOutTabs?.has(item.value)}
                        compact
                        className="shrink-0 mr-0.5"
                      />
                    )}
                    </>
                  )

                  if (isGen) {
                    return (
                      <GenModeHoverTarget
                        key={item.value}
                        mode={genMode}
                        side="right"
                        className={cn(
                          'flex items-center gap-0.5',
                          expanded && canPopOut ? 'w-full' : expanded ? 'w-full' : 'justify-center',
                        )}
                        onSelect={(mode) => onGenModeChange?.(mode)}
                      >
                        {row}
                      </GenModeHoverTarget>
                    )
                  }

                  return (
                    <div
                      key={item.value}
                      className={cn(
                        'flex items-center gap-0.5',
                        expanded && canPopOut ? 'w-full' : expanded ? 'w-full' : 'justify-center',
                      )}
                    >
                      {row}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </TabsList>
      </aside>
    </LayoutGroup>
  )
}
