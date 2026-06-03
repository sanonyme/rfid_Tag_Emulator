import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PopOutButtonProps {
  tabId: string
  onPopOut: (tabId: string) => void
  isPoppedOut?: boolean
  className?: string
  /** When true, shows icon only (for compact nav). */
  compact?: boolean
}

export function PopOutButton({ tabId, onPopOut, isPoppedOut, className, compact }: PopOutButtonProps) {
  if (!window.electronAPI?.popoutOpen) return null

  return (
    <button
      type="button"
      title={isPoppedOut ? 'Open in separate window (already popped out)' : 'Open in separate window'}
      aria-label={isPoppedOut ? 'Tab is in a separate window' : 'Pop out to separate window'}
      disabled={isPoppedOut}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isPoppedOut) onPopOut(tabId)
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors',
        compact ? 'w-6 h-6' : 'w-7 h-7',
        isPoppedOut
          ? 'opacity-40 cursor-not-allowed'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        className,
      )}
    >
      <ExternalLink className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
    </button>
  )
}
