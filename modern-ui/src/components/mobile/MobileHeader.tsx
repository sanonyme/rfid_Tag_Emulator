import { Wifi, WifiOff, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileHeaderProps {
  connected: boolean
  onConnectionPress: () => void
  onMenuPress: () => void
}

export function MobileHeader({
  connected,
  onConnectionPress,
  onMenuPress,
}: MobileHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 border-b border-border/60 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] dark:shadow-none"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground truncate leading-tight">Zeus</h1>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate mt-0.5">
          RFID emulator
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onConnectionPress}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2.5 rounded-2xl min-h-[48px] min-w-[48px] justify-center transition-all active:scale-[0.96] shadow-sm',
            connected
              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25'
              : 'bg-muted text-muted-foreground ring-1 ring-border/50',
          )}
          aria-label={connected ? 'Connected — tap to change' : 'Disconnected — tap to connect'}
        >
          {connected ? <Wifi className="w-5 h-5" strokeWidth={2.25} /> : <WifiOff className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onMenuPress}
          className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted ring-1 ring-border/50 active:scale-[0.96] transition-all shadow-sm"
          aria-label="More options"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}
