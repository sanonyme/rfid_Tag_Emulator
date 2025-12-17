import { Settings, Palette, RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Label } from './ui/label'
import { themes, applyTheme, saveTheme, getSavedTheme } from '../lib/themes'
import { useState, useEffect } from 'react'
import { Progress } from './ui/scroll-area' // Assuming Progress component exists or I'll use simple div

export function SettingsDialog() {
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    // Initial application of theme
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(currentTheme, isDark)

    // Update listeners
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

  const quitAndInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.quitAndInstall()
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full relative">
          <Settings className="h-5 w-5" />
          {(updateStatus === 'available' || updateStatus === 'downloaded') && (
            <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-red-600 border-2 border-background animate-pulse" />
          )}
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize the application appearance and behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="theme" className="text-right">
              Theme
            </Label>
            <div className="col-span-3">
              <Select value={currentTheme} onValueChange={handleThemeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.name} value={theme.name}>
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        {theme.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Updates</Label>
            <div className="col-span-3 flex flex-col gap-2">
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
                  <Download className="h-3 w-3" /> Update available, downloading...
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









