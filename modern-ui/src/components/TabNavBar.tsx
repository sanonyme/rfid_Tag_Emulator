import { useEffect, useMemo, useState } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { TabsList, TabsTrigger } from './ui/tabs'
import {
  Radio,
  Smartphone,
  ScanLine,
  Terminal,
  Server,
  Globe,
  Code2,
  Workflow,
  QrCode,
  Database,
  FolderInput,
  Link2,
  Radar,
  Cloud,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'
import { useWorkspaceStatus, type ServiceStatus } from '@/lib/workspace-status'
import { PopOutButton } from './PopOutButton'
import { isPopoutableTab } from '@/lib/popout-tabs'

const TAB_ITEMS_BASE: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'fixed', label: 'Fixed', icon: Radio },
  { value: 'handheld', label: 'Handheld', icon: Smartphone },
  { value: 'ocr', label: 'OCR', icon: ScanLine },
  { value: 'custom', label: 'Custom', icon: Terminal },
  { value: 'edge', label: 'Edge', icon: Cloud },
  { value: 'api', label: 'API', icon: Globe },
  { value: 'decoder', label: 'Decoder', icon: Code2 },
  { value: 'automation', label: 'Auto', icon: Workflow },
  { value: 'generator', label: 'Gen', icon: QrCode },
  { value: 'database', label: 'DB', icon: Database },
  { value: 'sftp', label: 'SFTP', icon: FolderInput },
  { value: 'netscan', label: 'LAN', icon: Radar },
]

const TAB_ITEMS_ADMIN = [
  { value: 'adam', label: 'ADAM', icon: Server },
  { value: 'link2uid', label: 'Link→UID', icon: Link2 },
  { value: 'terminal', label: 'Terminal', icon: Terminal },
]

interface TabNavBarProps {
  value: string
  className?: string
  isAdmin?: boolean
  poppedOutTabs?: Set<string>
  onPopOut?: (tabId: string) => void
}

/**
 * Worst-case aggregate status for a given tab.
 * Priority: error > sending > connected > connecting > idle.
 */
function aggregateStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('sending')) return 'sending'
  if (statuses.includes('connected')) return 'connected'
  if (statuses.includes('connecting')) return 'connecting'
  return 'idle'
}

export function TabNavBar({ value, className, isAdmin, poppedOutTabs, onPopOut }: TabNavBarProps) {
  const TAB_ITEMS_ALL = [...TAB_ITEMS_BASE, ...(isAdmin ? TAB_ITEMS_ADMIN : [])]
  const TAB_ITEMS = IS_MOBILE
    ? TAB_ITEMS_ALL.filter((t) => t.value !== 'adam' && t.value !== 'netscan')
    : TAB_ITEMS_ALL.filter((t) => t.value !== 'adam' || isAdmin)
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const statusMap = useWorkspaceStatus()

  /**
   * Map tab value → aggregated connection status (derived from the workspace-status store).
   * Handheld aggregates every `hh:<port>` entry.
   */
  const tabStatus = useMemo<Record<string, ServiceStatus>>(() => {
    const out: Record<string, ServiceStatus> = {}

    const pickOne = (tab: string, key: string) => {
      const s = statusMap[key]?.status
      if (s && s !== 'idle') out[tab] = s
    }
    pickOne('fixed', 'fixed')
    pickOne('ocr', 'ocr')
    pickOne('adam', 'adam')
    pickOne('edge', 'edge')
    pickOne('automation', 'automation')
    pickOne('database', 'db')
    pickOne('sftp', 'sftp')

    const hhStatuses = Object.entries(statusMap)
      .filter(([k]) => k.startsWith('hh:'))
      .map(([, v]) => v.status)
      .filter((s) => s !== 'idle')
    if (hhStatuses.length > 0) out['handheld'] = aggregateStatus(hhStatuses)

    return out
  }, [statusMap])

  return (
    <LayoutGroup id="tab-nav-bar">
      <div className={cn('flex items-center justify-center gap-1 overflow-x-auto', className)}>
        <TabsList
          className="inline-flex h-auto flex-shrink-0 flex-wrap justify-center gap-0 bg-background/80 border border-border/50 py-1.5 px-1.5 rounded-full"
          data-tour="tour-tab-nav"
        >
          {TAB_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = value === item.value
          const status = tabStatus[item.value]

          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                'relative cursor-pointer text-sm font-semibold px-4 py-2 rounded-full transition-colors border-0',
                'outline-none focus:outline-none focus-visible:outline-none',
                'ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                'shadow-none data-[state=active]:shadow-none',
                'data-[state=active]:bg-transparent',
                'bg-transparent text-foreground/70 hover:text-foreground',
                'data-[state=active]:text-primary dark:data-[state=active]:text-white',
              )}
            >
              {isCompact ? (
                <span className="flex items-center justify-center w-8 h-8">
                  <Icon className="w-4 h-4" strokeWidth={2.5} />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                  {item.label}
                </span>
              )}
              <StatusDot status={status} />
              {isActive && (
                <motion.div
                  layoutId="tab-nav-indicator"
                  layout="position"
                  className="absolute inset-0 rounded-full -z-10"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-primary/20 transition-colors duration-200 dark:bg-white/15" />
                  <div className="absolute -top-1.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))] transition-colors duration-200 dark:bg-white dark:shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                  <div className="absolute -top-2.5 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full bg-primary/15 blur-lg transition-colors duration-200 dark:bg-white/20" />
                </motion.div>
              )}
            </TabsTrigger>
          )
        })}
        </TabsList>
        {onPopOut && isPopoutableTab(value) && (
          <PopOutButton
            tabId={value}
            onPopOut={onPopOut}
            isPoppedOut={poppedOutTabs?.has(value)}
          />
        )}
      </div>
    </LayoutGroup>
  )
}

/**
 * Modern glowing connection indicator rendered as an absolute-positioned
 * overlay so it never affects the trigger's own width/height. Sits in the
 * top-right corner of the tab like a notification badge.
 */
function StatusDot({ status }: { status: ServiceStatus | undefined }) {
  if (!status || status === 'idle') return null

  const { dot, glow, ping } = (() => {
    switch (status) {
      case 'connected':
        return {
          dot: 'bg-success',
          glow: 'bg-success/50',
          ping: 'bg-success/70',
        }
      case 'sending':
        return {
          dot: 'bg-info',
          glow: 'bg-info/50',
          ping: 'bg-info/70',
        }
      case 'connecting':
        return {
          dot: 'bg-warning',
          glow: 'bg-warning/50',
          ping: 'bg-warning/70',
        }
      case 'error':
        return {
          dot: 'bg-destructive',
          glow: 'bg-destructive/50',
          ping: 'bg-destructive/70',
        }
      default:
        return { dot: '', glow: '', ping: '' }
    }
  })()

  const showPing = status === 'connecting' || status === 'sending'

  return (
    <span className="absolute top-1 right-1.5 flex items-center justify-center pointer-events-none z-10">
      <span className={cn('absolute w-3 h-3 rounded-full blur-[3px]', glow)} />
      {showPing && (
        <span className={cn('absolute w-2 h-2 rounded-full animate-ping', ping)} />
      )}
      <span
        className={cn(
          'relative w-1.5 h-1.5 rounded-full ring-1 ring-background/90',
          dot,
        )}
      />
    </span>
  )
}
