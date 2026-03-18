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
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border safe-area-top"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <h1 className="text-lg font-semibold text-foreground truncate">Zeus Emulator</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConnectionPress}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl min-h-[44px] min-w-[44px] justify-center transition-colors active:scale-95',
            connected
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          )}
          aria-label={connected ? 'Connected' : 'Disconnected'}
        >
          {connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onMenuPress}
          className="flex items-center justify-center w-11 h-11 rounded-xl bg-muted active:scale-95"
          aria-label="More options"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
