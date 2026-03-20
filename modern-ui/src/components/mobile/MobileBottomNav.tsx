import { Radio, Smartphone, ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAIN_TABS = [
  { id: 'fixed', label: 'Fixed', icon: Radio },
  { id: 'handheld', label: 'Handheld', icon: Smartphone },
  { id: 'ocr', label: 'OCR', icon: ScanLine },
] as const

interface MobileBottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
}: MobileBottomNavProps) {
  return (
    <nav
      id="mobile-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-background/95 backdrop-blur border-t border-border/60 safe-area-bottom"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {MAIN_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-3 px-6 min-h-[56px] flex-1 transition-colors active:scale-95',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
