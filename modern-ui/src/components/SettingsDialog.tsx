import { Settings, RefreshCw, Download, CheckCircle, AlertCircle, Check } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Label } from './ui/label'
import { themes, applyTheme, saveTheme, getSavedTheme, type Theme } from '../lib/themes'
import { useState, useEffect } from 'react'
import { ScrollArea } from './ui/scroll-area'

function hslToStyle(hsl: string) {
  return `hsl(${hsl})`
}

function ThemeCard({ theme, isActive, onClick }: { theme: Theme; isActive: boolean; onClick: () => void }) {
  const isDark = document.documentElement.classList.contains('dark')
  const colors = isDark ? theme.colors.dark : theme.colors.light

  return (
    <button
      onClick={onClick}
      className={`
        relative w-full text-left rounded-xl border-2 p-3 transition-all
        ${isActive
          ? 'border-primary ring-2 ring-primary/20 shadow-md'
          : 'border-border/50 hover:border-primary/40 hover:shadow-sm'
        }
      `}
    >
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 shrink-0">
          <div className="w-5 h-10 rounded-l-md" style={{ background: hslToStyle(colors.primary) }} />
          <div className="w-5 h-10" style={{ background: hslToStyle(colors.secondary) }} />
          <div className="w-5 h-10" style={{ background: hslToStyle(colors.accent) }} />
          <div className="w-5 h-10 rounded-r-md" style={{ background: hslToStyle(colors.background) }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{theme.label}</p>
          <div className="flex gap-1 mt-1">
            {[colors.primary, colors.secondary, colors.accent, colors.destructive].map((c, i) => (
              <div key={i} className="w-3 h-3 rounded-full border border-border/30" style={{ background: hslToStyle(c) }} />
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}

interface SettingsDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps = {}) {
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(currentTheme, isDark)

    if (window.electronAPI) {
      window.electronAPI.onCheckingForUpdate(() => setUpdateStatus('checking'))
      window.electronAPI.onUpdateAvailable(() => setUpdateStatus('available'))
      window.electronAPI.onUpdateNotAvailable(() => setUpdateStatus('not-available'))
      window.electronAPI.onUpdateError((msg) => {
        setUpdateStatus('error')
        setErrorMessage(msg)
      })
      window.electronAPI.onDownloadProgress((progress) => {
        setUpdateStatus('downloading')
        setDownloadProgress(Math.round(progress.percent))
      })
      window.electronAPI.onUpdateDownloaded(() => setUpdateStatus('downloaded'))
    }
  }, [])

  const handleThemeChange = (value: string) => {
    setCurrentTheme(value)
    saveTheme(value)
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(value, isDark)
  }

  const checkForUpdates = () => {
    if (window.electronAPI) {
      setUpdateStatus('checking')
      setErrorMessage('')
      window.electronAPI.checkForUpdate()
    }
  }

  const startDownload = () => {
    if (window.electronAPI) {
      setUpdateStatus('downloading')
      window.electronAPI.startDownload()
    }
  }

  const quitAndInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstall()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full relative">
          <Settings className="h-5 w-5" />
          {(updateStatus === 'available' || updateStatus === 'downloaded') && (
            <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-red-600 border-2 border-background animate-pulse" />
          )}
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize the application appearance and behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Theme Selection */}
          <div className="space-y-3">
            <Label>Theme</Label>
            <ScrollArea className="h-[240px] pr-3">
              <div className="grid grid-cols-2 gap-2">
                {themes.map((theme) => (
                  <ThemeCard
                    key={theme.name}
                    theme={theme}
                    isActive={currentTheme === theme.name}
                    onClick={() => handleThemeChange(theme.name)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Updates */}
          <div className="space-y-2">
            <Label>Updates</Label>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkForUpdates}
                  disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                  className="flex-1 min-w-[140px]"
                >
                  {updateStatus === 'checking' ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check for Updates
                    </>
                  )}
                </Button>

                {updateStatus === 'available' && (
                  <Button size="sm" onClick={startDownload} className="flex-1 min-w-[140px]">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                )}

                {updateStatus === 'downloaded' && (
                  <Button size="sm" onClick={quitAndInstall} className="bg-green-600 hover:bg-green-700 text-white flex-1 min-w-[140px]">
                    <Download className="mr-2 h-4 w-4" />
                    Restart
                  </Button>
                )}
              </div>

              {updateStatus === 'not-available' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> App is up to date
                </span>
              )}

              {updateStatus === 'available' && (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <Download className="h-3 w-3" /> Update available
                </span>
              )}

              {updateStatus === 'downloading' && (
                <div className="w-full space-y-1">
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground block text-right">
                    {downloadProgress}%
                  </span>
                </div>
              )}

              {updateStatus === 'error' && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {errorMessage || 'Update failed'}
                </span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
