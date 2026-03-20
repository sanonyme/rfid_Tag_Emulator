import { Settings, RefreshCw, Download, CheckCircle, AlertCircle, Check, Type, Layout, FileText, Timer, Sparkles, BookOpen } from 'lucide-react'
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
import { useSettings } from '../lib/settings-context'
import type { FontSize, DefaultTab } from '../lib/settings'
import { IS_MOBILE } from '../lib/platform'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Switch } from './ui/switch'
import { OnboardingDialog } from './OnboardingDialog'

function hslToStyle(hsl: string) {
  return `hsl(${hsl})`
}

function ThemeCard({ theme, isActive, onClick }: { theme: Theme; isActive: boolean; onClick: () => void }) {
  const isDark = document.documentElement.classList.contains('dark')
  const colors = isDark ? theme.colors.dark : theme.colors.light

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full text-left rounded-xl border-2 p-3 transition-all min-h-[52px] active:scale-[0.98]',
        isActive
          ? 'border-primary ring-2 ring-primary/20 shadow-md'
          : 'border-border/50 hover:border-primary/40 hover:shadow-sm',
      )}
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
  /** When true, no trigger button - dialog opens only via open prop */
  noTrigger?: boolean
}

const TAB_OPTIONS_ALL: { value: DefaultTab; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'handheld', label: 'Handheld' },
  { value: 'ocr', label: 'OCR' },
  { value: 'custom', label: 'Custom' },
  { value: 'adam', label: 'ADAM' },
  { value: 'api', label: 'API' },
  { value: 'decoder', label: 'Decoder' },
  { value: 'automation', label: 'Auto' },
  { value: 'generator', label: 'Generator' },
]

const TAB_OPTIONS = IS_MOBILE ? TAB_OPTIONS_ALL.filter((t) => t.value !== 'adam') : TAB_OPTIONS_ALL

export function SettingsDialog({ open, onOpenChange, noTrigger }: SettingsDialogProps = {}) {
  const [currentTheme, setCurrentTheme] = useState(getSavedTheme())
  const { settings, setSettings } = useSettings()
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    applyTheme(currentTheme, isDark)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply initial theme only; changes go through handleThemeChange
  }, [])

  useEffect(() => {
    if (IS_MOBILE || !window.electronAPI) return

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

  const showUpdateBadge = !IS_MOBILE && (updateStatus === 'available' || updateStatus === 'downloaded')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!noTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full relative">
            <Settings className="h-5 w-5" />
            {showUpdateBadge && (
              <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-red-600 border-2 border-background animate-pulse" />
            )}
            <span className="sr-only">Settings</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          IS_MOBILE
            ? 'w-[min(100%,420px)] max-h-[88dvh] rounded-[1.35rem] border-0 bg-card shadow-2xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] translate-y-[-52%] gap-0 sm:rounded-[1.35rem]'
            : 'sm:max-w-[520px] max-h-[90vh] rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl shadow-xl p-6 gap-4',
        )}
      >
        <DialogHeader className={cn('shrink-0 text-left', IS_MOBILE && 'px-5 pt-5 pb-2 pr-14')}>
          <DialogTitle className={IS_MOBILE ? 'text-xl font-semibold tracking-tight' : undefined}>
            Settings
          </DialogTitle>
          <DialogDescription className={IS_MOBILE ? 'text-sm leading-relaxed' : undefined}>
            {IS_MOBILE
              ? 'Appearance, theme, and behavior for Zeus on this device.'
              : 'Customize the application appearance and behavior.'}
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain',
            IS_MOBILE ? 'px-4 pb-6 pt-1' : 'pr-2 -mr-2',
          )}
        >
          <div className={cn('space-y-4', !IS_MOBILE && 'space-y-6 py-2')}>
            {/* Appearance */}
            <div
              className={cn(
                'rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-4',
                IS_MOBILE && 'border-border/30 shadow-sm',
              )}
            >
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Type className="w-4 h-4 text-primary shrink-0" />
                Appearance
              </h4>
              <div className={cn('grid gap-4', IS_MOBILE ? 'grid-cols-1' : 'grid-cols-2')}>
                <div className="space-y-2">
                  <Label>Font size</Label>
                  <Select value={settings.fontSize} onValueChange={(v) => setSettings({ fontSize: v as FontSize })}>
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default tab</Label>
                  <Select value={settings.defaultTab} onValueChange={(v) => setSettings({ defaultTab: v as DefaultTab })}>
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAB_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Sound (phone) / Design & Effects (desktop) */}
            {IS_MOBILE ? (
              <div className="rounded-2xl border border-border/30 bg-muted/20 p-4 shadow-sm">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  Feedback
                </h4>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Sound effects</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Connection and send cues</p>
                  </div>
                  <Switch
                    checked={settings.soundEnabled}
                    onCheckedChange={(v: boolean) => setSettings({ soundEnabled: v })}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Design & Effects
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sound effects</Label>
                      <p className="text-xs text-muted-foreground">Play sounds for connection, success, and errors</p>
                    </div>
                    <Switch
                      checked={settings.soundEnabled}
                      onCheckedChange={(v: boolean) => setSettings({ soundEnabled: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>3D card hover effect</Label>
                      <p className="text-xs text-muted-foreground">Subtle 3D tilt on cards when hovering</p>
                    </div>
                    <Switch
                      checked={settings.card3dEnabled}
                      onCheckedChange={(v: boolean) => setSettings({ card3dEnabled: v })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Help */}
            <div className={cn('rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-3', IS_MOBILE && 'border-border/30 shadow-sm')}>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                Help
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {IS_MOBILE
                  ? 'Quick tips for Fixed reader, Handheld, OCR, and profiles.'
                  : 'New to the app? Learn how connection, fixed reader, handheld, OCR, automation, and profiles work.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnboardingOpen(true)}
                className={cn('gap-2 rounded-xl', IS_MOBILE && 'w-full h-11')}
              >
                <BookOpen className="w-4 h-4" />
                Show tutorial
              </Button>
            </div>

            {/* Logs */}
            <div className={cn('rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-3', IS_MOBILE && 'border-border/30 shadow-sm')}>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                Logs
              </h4>
              <div className="space-y-2">
                <Label>Max log lines</Label>
                <Select
                  value={settings.maxLogLines === 0 ? 'unlimited' : String(settings.maxLogLines)}
                  onValueChange={(v) => setSettings({ maxLogLines: v === 'unlimited' ? 0 : parseInt(v, 10) })}
                >
                  <SelectTrigger className={cn('rounded-xl', IS_MOBILE && 'h-11')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1,000</SelectItem>
                    <SelectItem value="2000">2,000</SelectItem>
                    <SelectItem value="5000">5,000</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Older entries are trimmed when limit is reached.</p>
              </div>
            </div>

            {/* Connection */}
            <div className={cn('rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-3', IS_MOBILE && 'border-border/30 shadow-sm')}>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary shrink-0" />
                Connection
              </h4>
              <div className="space-y-2">
                <Label>Timeout</Label>
                <Select
                  value={String(settings.connectionTimeoutMs)}
                  onValueChange={(v) => setSettings({ connectionTimeoutMs: parseInt(v, 10) })}
                >
                  <SelectTrigger className={cn('rounded-xl', IS_MOBILE && 'h-11')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5000">5 seconds</SelectItem>
                    <SelectItem value="10000">10 seconds</SelectItem>
                    <SelectItem value="15000">15 seconds</SelectItem>
                    <SelectItem value="30000">30 seconds</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used when connecting to the reader / emulator.</p>
              </div>
            </div>

            {/* Theme */}
            <div className={cn('rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-3', IS_MOBILE && 'border-border/30 shadow-sm')}>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Layout className="w-4 h-4 text-primary shrink-0" />
                Theme
              </h4>
              <div className={cn('grid gap-2', IS_MOBILE ? 'grid-cols-1' : 'grid-cols-2')}>
                {themes.map((theme) => (
                  <ThemeCard
                    key={theme.name}
                    theme={theme}
                    isActive={currentTheme === theme.name}
                    onClick={() => handleThemeChange(theme.name)}
                  />
                ))}
              </div>
            </div>

            {/* Updates — desktop (Electron) only */}
            {!IS_MOBILE && (
              <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-4">
                <h4 className="text-sm font-semibold">Updates</h4>
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
            )}
          </div>
        </div>
      </DialogContent>
      <OnboardingDialog open={onboardingOpen} onOpenChange={setOnboardingOpen} />
    </Dialog>
  )
}
