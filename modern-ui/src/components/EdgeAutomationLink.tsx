import { Cloud, Workflow } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

type EdgeAutomationHintBannerProps = {
  onSwitchTab?: (tab: string) => void
  className?: string
}

/** Hint on the Edge tab: Edge API is also available in Automation workflows. */
export function EdgeAutomationHintBanner({ onSwitchTab, className }: EdgeAutomationHintBannerProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-cyan-500/5',
        'px-4 py-3 shrink-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Cloud className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" aria-hidden />
        <p className="flex-1 min-w-[200px] text-xs text-muted-foreground leading-relaxed">
          Invoke blocks and processes here, then use the same Edge API in{' '}
          <strong className="text-foreground/90">Automation</strong> — open the Auto tab and choose{' '}
          <strong className="text-foreground/90">ADD NODE → Edge API</strong> //// <strong className="text-foreground/90">STILL NOT FULLY TESTED AND PROBABLY HAS BUGS.</strong>
        </p>
        {onSwitchTab ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 shrink-0 border-cyan-500/40"
            onClick={() => onSwitchTab('automation')}
          >
            <Workflow className="w-3.5 h-3.5" />
            Open Automation
          </Button>
        ) : null}
      </div>
    </div>
  )
}
