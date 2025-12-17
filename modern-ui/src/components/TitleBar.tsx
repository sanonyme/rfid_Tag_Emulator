import { Minimize2, Maximize2, X, Wifi, WifiOff } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { SettingsDialog } from './SettingsDialog'
import logoImage from '/zeus-removebg-preview.png'
import packageJson from '../../package.json' // Import version from package.json

interface TitleBarProps {
  connected?: boolean
  host?: string
  port?: string
  profileManager?: React.ReactNode
}

export function TitleBar({ connected = false, host = '', port = '', profileManager }: TitleBarProps) {
  const handleMinimize = () => {
    console.log('Minimize clicked')
    if (window.electronAPI?.minimize) {
      window.electronAPI.minimize()
    } else {
      console.error('electronAPI.minimize not available')
    }
  }

  const handleMaximize = () => {
    console.log('Maximize clicked')
    if (window.electronAPI?.maximize) {
      window.electronAPI.maximize()
    } else {
      console.error('electronAPI.maximize not available')
    }
  }

  const handleClose = () => {
    console.log('Close clicked')
    if (window.electronAPI?.close) {
      window.electronAPI.close()
    } else {
      console.error('electronAPI.close not available')
    }
  }

  return (
    <div className="h-14 bg-background/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-4 select-none titlebar draggable animate-slide-in-down">
      {/* Left - Logo & Title */}
      <div className="flex items-center gap-3 flex-1 animate-fade-in">
        <div className="relative group">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/40 transition-all duration-500"></div>
          <img 
            src={logoImage} 
            alt="edge logo" 
            className="w-16 h-16 object-contain relative transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
          />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(var(--primary),0.5)] animate-pulse-slow">
            Zeus
          </h1>
          <p className="text-[10px] text-muted-foreground tracking-widest uppercase font-medium flex items-center gap-2">
            anexya
            <span className="opacity-50">|</span>
            v{packageJson.version}
          </p>
        </div>
      </div>

      {/* Center - Connection Status */}
      <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2 animate-scale-in">
        {connected ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <div className="absolute w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
            </div>
            <Wifi className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
              {host && port ? `${host}:${port}` : 'Connected'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border/50">
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground animate-pulse-slow" />
            <span className="text-xs font-medium text-muted-foreground">
              Disconnected
            </span>
          </div>
        )}
      </div>

      {/* Right - Theme Toggle & Window Controls */}
      <div className="flex items-center gap-1 animate-fade-in">
        <div className="no-drag">
          {profileManager}
        </div>
        <div className="no-drag">
          <SettingsDialog />
        </div>
        <ThemeToggle />
        
        <div className="flex ml-2 no-drag gap-0.5">
          <button
            onClick={handleMinimize}
            className="h-11 w-12 flex items-center justify-center group transition-all duration-200 hover:bg-accent/50 rounded-lg"
            aria-label="Minimize"
          >
            <Minimize2 className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-all duration-200" />
          </button>
          
          <button
            onClick={handleMaximize}
            className="h-11 w-12 flex items-center justify-center group transition-all duration-200 hover:bg-accent/50 rounded-lg"
            aria-label="Maximize"
          >
            <Maximize2 className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-all duration-200" />
          </button>
          
          <button
            onClick={handleClose}
            className="h-11 w-12 flex items-center justify-center group transition-all duration-200 hover:bg-destructive/10 rounded-lg"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground group-hover:text-destructive group-hover:scale-110 group-hover:rotate-90 transition-all duration-200" />
          </button>
        </div>
      </div>
    </div>
  )
}

