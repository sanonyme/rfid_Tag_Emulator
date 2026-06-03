import { Minimize2, Maximize2, X, PanelLeft } from 'lucide-react'
import { getPopoutTabLabel } from '@/lib/popout-tabs'
import logoImage from '/ZeusLogoNoBG.png'

interface PopoutTitleBarProps {
  tabId: string
  onDock: () => void
}

export function PopoutTitleBar({ tabId, onDock }: PopoutTitleBarProps) {
  const label = getPopoutTabLabel(tabId)

  const handleMinimize = () => window.electronAPI?.minimize?.()
  const handleMaximize = () => window.electronAPI?.maximize?.()
  const handleClose = () => window.electronAPI?.close?.()

  return (
    <div className="h-14 bg-background/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-4 select-none titlebar draggable relative z-30">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <img src={logoImage} alt="" className="w-9 h-9 object-contain shrink-0 opacity-90" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{label}</h1>
          <p className="text-[10px] text-muted-foreground truncate">Pop-out window</p>
        </div>
      </div>

      <div className="flex items-center gap-1 electron-no-drag shrink-0">
        <button
          type="button"
          onClick={onDock}
          title="Dock back to main window"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <PanelLeft className="w-3.5 h-3.5" />
          Dock
        </button>
        <button
          type="button"
          onClick={handleMinimize}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
          aria-label="Minimize"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
          aria-label="Maximize"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-destructive/20 hover:text-destructive transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
