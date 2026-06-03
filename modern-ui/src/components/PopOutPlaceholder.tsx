import { ExternalLink, PanelLeft } from 'lucide-react'
import { Button } from './ui/button'
import { getPopoutTabLabel } from '@/lib/popout-tabs'

interface PopOutPlaceholderProps {
  tabId: string
  onFocusWindow: () => void
  onDock: () => void
}

export function PopOutPlaceholder({ tabId, onFocusWindow, onDock }: PopOutPlaceholderProps) {
  const label = getPopoutTabLabel(tabId)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/10">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <ExternalLink className="w-6 h-6 text-primary" />
      </div>
      <div className="space-y-1 max-w-sm">
        <h3 className="text-lg font-semibold">{label} is in a separate window</h3>
        <p className="text-sm text-muted-foreground">
          This tab was popped out. Bring it back here or focus the external window.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="default" onClick={onFocusWindow}>
          <ExternalLink className="w-4 h-4 mr-2" />
          Focus window
        </Button>
        <Button type="button" variant="outline" onClick={onDock}>
          <PanelLeft className="w-4 h-4 mr-2" />
          Dock here
        </Button>
      </div>
    </div>
  )
}
