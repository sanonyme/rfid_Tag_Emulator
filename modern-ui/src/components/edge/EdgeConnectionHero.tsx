import { motion, LayoutGroup } from 'framer-motion'
import {
  AlertCircle,
  Copy,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { indicatorSpring, prefersReducedMotion } from '@/lib/motion'
import { sectionCard } from '@/lib/ui-tokens'
import { toast } from 'sonner'

export type EdgeMode = 'operate' | 'catalog'

type EdgeConnectionHeroProps = {
  tcpConnected: boolean
  edgeReady: boolean
  edgeConnecting: boolean
  edgeError: string | null
  edgeApiBaseUrl: string
  edgeMode: EdgeMode
  onModeChange: (mode: EdgeMode) => void
  onRefreshAll: () => void
  loading: boolean
  version: string | null
  setup: string | null
  licenseValid: boolean | null
}

const MODES: { value: EdgeMode; label: string }[] = [
  { value: 'operate', label: 'Overall' },
  { value: 'catalog', label: 'Blocks and Processes' },
]

export function EdgeConnectionHero({
  tcpConnected,
  edgeReady,
  edgeConnecting,
  edgeError,
  edgeApiBaseUrl,
  edgeMode,
  onModeChange,
  onRefreshAll,
  loading,
  version,
  setup,
  licenseValid,
}: EdgeConnectionHeroProps) {
  const reduced = prefersReducedMotion()

  const copyUrl = async () => {
    if (!edgeApiBaseUrl) return
    try {
      await navigator.clipboard.writeText(`${edgeApiBaseUrl}/ALE/api/`)
      toast.success('API URL copied')
    } catch {
      toast.error('Could not copy URL')
    }
  }

  const statusLabel = !tcpConnected
    ? 'Disconnected'
    : edgeConnecting
      ? 'Connecting…'
      : edgeError
        ? 'Error'
        : edgeReady
          ? 'Connected'
          : 'Idle'

  const statusVariant = edgeReady
    ? 'success'
    : edgeError
      ? 'destructive'
      : edgeConnecting
        ? 'info'
        : 'secondary'

  return (
    <div
      className={cn(
        sectionCard,
        'shrink-0 overflow-hidden p-4',
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              'relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
              edgeReady
                ? 'bg-success/10 text-success ring-success/30'
                : edgeError
                  ? 'bg-destructive/10 text-destructive ring-destructive/30'
                  : 'bg-muted/60 text-muted-foreground ring-border/40',
            )}
          >
            {edgeConnecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : edgeReady ? (
              <Wifi className="h-5 w-5" />
            ) : (
              <WifiOff className="h-5 w-5" />
            )}
            {edgeReady && !reduced && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Edge</h2>
              <Badge variant={statusVariant as 'success' | 'destructive' | 'info' | 'secondary'}>
                {statusLabel}
              </Badge>
            </div>

            {!tcpConnected ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Connect to an Edge IP using the connection bubble to begin.
              </p>
            ) : edgeError ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {edgeError}
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {edgeApiBaseUrl && (
                  <button
                    type="button"
                    onClick={() => void copyUrl()}
                    className="smooth-press inline-flex max-w-full items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-border/30 transition-colors hover:bg-muted hover:text-foreground"
                    title="Copy API base URL"
                  >
                    <span className="truncate">{edgeApiBaseUrl}/ALE/api/</span>
                    <Copy className="h-3 w-3 shrink-0 opacity-60" />
                  </button>
                )}
                {version && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    v{version}
                  </Badge>
                )}
                {setup && (
                  <Badge variant="outline" className="text-[10px]">
                    {setup}
                  </Badge>
                )}
                {licenseValid != null && (
                  <Badge variant={licenseValid ? 'success' : 'warning'} className="text-[10px]">
                    {licenseValid ? 'Licensed' : 'License invalid'}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LayoutGroup id="edge-mode-nav">
            <div className="flex gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/30">
              {MODES.map((m) => {
                const active = edgeMode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onModeChange(m.value)}
                    className={cn(
                      'relative z-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="edge-mode-active"
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-lg bg-background shadow-elev-sm ring-1 ring-border/40"
                        transition={reduced ? { duration: 0 } : indicatorSpring}
                      />
                    )}
                    {m.label}
                  </button>
                )
              })}
            </div>
          </LayoutGroup>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void onRefreshAll()}
            disabled={!edgeReady || loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  )
}

export function EdgeDisconnectedPlaceholder() {
  return (
    <div
      className={cn(
        sectionCard,
        'flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center',
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border/40">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Edge Command Center</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Connect to your Edge appliance to invoke blocks, control workflows, and monitor system
          health — all from one cockpit.
        </p>
      </div>
    </div>
  )
}
