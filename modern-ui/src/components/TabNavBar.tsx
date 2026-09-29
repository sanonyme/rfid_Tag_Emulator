import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  motion,
  LayoutGroup,
  useReducedMotion,
} from 'framer-motion'
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
  Cloud,
  Braces,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'
import { indicatorSpring, motionSafeTransition } from '@/lib/motion'
import { useWorkspaceStatus, type ServiceStatus } from '@/lib/workspace-status'
import { PopOutButton } from './PopOutButton'
import { isPopoutableTab } from '@/lib/popout-tabs'
import { GenModeHoverTarget } from './GenModeFlyout'
import type { GenMode } from '@/lib/gen-modes'

const TAB_ITEMS_BASE: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'fixed', label: 'Fixed', icon: Radio },
  { value: 'handheld', label: 'Handheld', icon: Smartphone },
  { value: 'ocr', label: 'OCR', icon: ScanLine },
  { value: 'custom', label: 'Custom', icon: Terminal },
  { value: 'edge', label: 'Edge', icon: Cloud },
  { value: 'api', label: 'API', icon: Globe },
  { value: 'decoder', label: 'Decoder', icon: Code2 },
  { value: 'jsonlint', label: 'JSON', icon: Braces },
  { value: 'automation', label: 'Auto', icon: Sparkles },
  { value: 'generator', label: 'Gen', icon: QrCode },
  { value: 'database', label: 'DB', icon: Database },
  { value: 'sftp', label: 'Files', icon: FolderInput },
  { value: 'netscan', label: 'LAN', icon: Radar },
]

const TAB_ITEMS_ADMIN = [
  { value: 'link2uid', label: 'Link→UID', icon: Link2 },
  { value: 'terminal', label: 'Terminal', icon: Terminal },
]

/** Peak icon scale under the cursor — drawn large, scaled down at rest (stays sharp). */
const DOCK_ICON_PX = 24
const DOCK_REST_PX = 16
const DOCK_REST_SCALE = DOCK_REST_PX / DOCK_ICON_PX
const DOCK_MAX_SCALE = 1
/** Slight upward lift on the icon (px). */
const DOCK_LIFT_PX = 3

interface TabNavBarProps {
  value: string
  className?: string
  isAdmin?: boolean
  poppedOutTabs?: Set<string>
  onPopOut?: (tabId: string) => void
  genMode?: GenMode
  onGenModeChange?: (mode: GenMode) => void
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

/**
 * Magnifies only the hovered icon (neighbors stay at rest).
 * SVG is painted large and scaled down at rest so hover stays sharp.
 */
function DockIcon({
  active,
  enabled,
  children,
}: {
  active: boolean
  enabled: boolean
  children: ReactNode
}) {
  if (!enabled) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-visible"
        style={{ width: DOCK_REST_PX, height: DOCK_REST_PX }}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-visible"
      style={{ width: DOCK_REST_PX, height: DOCK_REST_PX }}
    >
      <motion.span
        initial={false}
        animate={{
          scale: active ? DOCK_MAX_SCALE : DOCK_REST_SCALE,
          y: active ? -DOCK_LIFT_PX : 0,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.3 }}
        className="inline-flex origin-center will-change-transform [backface-visibility:hidden]"
      >
        {children}
      </motion.span>
    </span>
  )
}

export function TabNavBar({
  value,
  className,
  isAdmin,
  poppedOutTabs,
  onPopOut,
  genMode = 'barcode',
  onGenModeChange,
}: TabNavBarProps) {
  const TAB_ITEMS_ALL = [...TAB_ITEMS_BASE, ...(isAdmin ? TAB_ITEMS_ADMIN : [])]
  const TAB_ITEMS = IS_MOBILE
    ? TAB_ITEMS_ALL.filter((t) => t.value !== 'netscan')
    : TAB_ITEMS_ALL
  const [isCompact, setIsCompact] = useState(false)
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const dockEnabled = !reduceMotion && !IS_MOBILE

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
      <div className={cn('relative z-30 flex items-center justify-center gap-1', className)}>
        <TabsList
          className="inline-flex h-auto flex-shrink-0 flex-wrap justify-center gap-0 overflow-visible bg-background/80 border border-border/50 py-1.5 px-1.5 rounded-full"
          data-tour="tour-tab-nav"
          onMouseLeave={() => setHoveredTab(null)}
        >
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = value === item.value
            const status = tabStatus[item.value]
            const isGen = item.value === 'generator' && Boolean(onGenModeChange)

            const iconEl = (
              <DockIcon active={hoveredTab === item.value} enabled={dockEnabled}>
                <Icon
                  className="shrink-0"
                  width={dockEnabled ? DOCK_ICON_PX : DOCK_REST_PX}
                  height={dockEnabled ? DOCK_ICON_PX : DOCK_REST_PX}
                  strokeWidth={2.25}
                  absoluteStrokeWidth
                />
              </DockIcon>
            )

            const trigger = (
              <TabsTrigger
                value={item.value}
                onMouseEnter={() => setHoveredTab(item.value)}
                className={cn(
                  'relative cursor-pointer text-sm font-semibold px-4 py-2 rounded-full transition-colors border-0',
                  'outline-none focus:outline-none focus-visible:outline-none',
                  'ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                  'shadow-none data-[state=active]:shadow-none',
                  'data-[state=active]:bg-transparent',
                  'bg-transparent text-foreground/70 hover:text-foreground',
                  'data-[state=active]:text-primary dark:data-[state=active]:text-white',
                  (item.value === 'automation' || item.value === 'jsonlint') &&
                    'ring-1 ring-inset ring-primary/35 text-primary/80 hover:text-primary dark:ring-white/25',
                )}
              >
                {isCompact ? (
                  <span className="flex h-8 w-8 items-center justify-center">{iconEl}</span>
                ) : (
                  <span className="flex items-center gap-2">
                    {iconEl}
                    {item.label}
                  </span>
                )}
                <StatusDot status={status} />
                {isActive && (
                  <motion.div
                    layoutId="tab-nav-indicator"
                    layout="position"
                    className="absolute inset-0 -z-10 rounded-full"
                    initial={false}
                    transition={motionSafeTransition(indicatorSpring)}
                  >
                    <div className="absolute inset-0 rounded-full bg-primary/20 transition-colors duration-200 dark:bg-white/15" />
                    <div className="absolute -top-1.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))] transition-colors duration-200 dark:bg-white dark:shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                    <div className="absolute -top-2.5 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full bg-primary/15 blur-lg transition-colors duration-200 dark:bg-white/20" />
                  </motion.div>
                )}
              </TabsTrigger>
            )

            if (!isGen) {
              return <div key={item.value}>{trigger}</div>
            }

            return (
              <GenModeHoverTarget
                key={item.value}
                mode={genMode}
                side="bottom"
                onSelect={(mode) => onGenModeChange?.(mode)}
              >
                {trigger}
              </GenModeHoverTarget>
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
    <span className="pointer-events-none absolute right-1.5 top-1 z-10 flex items-center justify-center">
      <span className={cn('absolute h-3 w-3 rounded-full blur-[3px]', glow)} />
      {showPing && (
        <span className={cn('absolute h-2 w-2 animate-ping rounded-full', ping)} />
      )}
      <span
        className={cn(
          'relative h-1.5 w-1.5 rounded-full ring-1 ring-background/90',
          dot,
        )}
      />
    </span>
  )
}
