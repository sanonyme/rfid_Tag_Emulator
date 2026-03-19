import { useEffect, useState } from 'react'
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
  Link2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_MOBILE } from '@/lib/platform'

const TAB_ITEMS_BASE: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'fixed', label: 'Fixed', icon: Radio },
  { value: 'handheld', label: 'Handheld', icon: Smartphone },
  { value: 'ocr', label: 'OCR', icon: ScanLine },
  { value: 'custom', label: 'Custom', icon: Terminal },
  { value: 'adam', label: 'ADAM', icon: Server },
  { value: 'api', label: 'API', icon: Globe },
  { value: 'decoder', label: 'Decoder', icon: Code2 },
  { value: 'automation', label: 'Auto', icon: Workflow },
  { value: 'generator', label: 'Gen', icon: QrCode },
]

const TAB_ITEMS_ADMIN = [
  { value: 'link2uid', label: 'Link→UID', icon: Link2 },
  { value: 'terminal', label: 'Terminal', icon: Terminal },
]

interface TabNavBarProps {
  value: string
  className?: string
  isAdmin?: boolean
}

export function TabNavBar({ value, className, isAdmin }: TabNavBarProps) {
  const TAB_ITEMS_ALL = [...TAB_ITEMS_BASE, ...(isAdmin ? TAB_ITEMS_ADMIN : [])]
  const TAB_ITEMS = IS_MOBILE ? TAB_ITEMS_ALL.filter((t) => t.value !== 'adam') : TAB_ITEMS_ALL
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <LayoutGroup id="tab-nav-bar">
      <div className={cn('flex justify-center overflow-x-auto', className)}>
        <TabsList className="inline-flex h-auto flex-shrink-0 flex-wrap justify-center gap-0 bg-background/80 border border-border/50 py-1.5 px-1.5 rounded-full">
          {TAB_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = value === item.value

          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                'relative cursor-pointer text-sm font-semibold px-4 py-2 rounded-full transition-colors border-0 bg-transparent shadow-none',
                'text-foreground/70 hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0',
                'data-[state=active]:bg-transparent data-[state=active]:text-primary dark:data-[state=active]:text-white',
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
                  <div className="absolute inset-0 bg-primary/20 dark:bg-white/15 rounded-full" />
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary dark:bg-white rounded-full shadow-[0_0_6px_hsl(var(--primary))] dark:shadow-[0_0_6px_rgba(255,255,255,0.6)]" />
                  <div className="absolute w-10 h-10 bg-primary/15 dark:bg-white/20 rounded-full blur-lg -top-2.5 left-1/2 -translate-x-1/2" />
                </motion.div>
              )}
            </TabsTrigger>
          )
        })}
        </TabsList>
      </div>
    </LayoutGroup>
  )
}
