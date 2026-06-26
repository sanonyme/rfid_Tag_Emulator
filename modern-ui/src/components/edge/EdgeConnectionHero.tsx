import {
  AlertCircle,
  Box,
  Copy,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  Workflow,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import { sectionCard } from '@/lib/ui-tokens'
import { toast } from 'sonner'

type EdgeConnectionHeroProps = {
  tcpConnected: boolean
  edgeReady: boolean
  edgeConnecting: boolean
  edgeError: string | null
  edgeApiBaseUrl: string
  onRefreshAll: () => void
  loading: boolean
  version: string | null
  setup: string | null
  licenseValid: boolean | null
  blockCount: number
  processCount: number
  runningProcessCount: number
}

export function EdgeConnectionHero({
  tcpConnected,
  edgeReady,
  edgeConnecting,
  edgeError,
  edgeApiBaseUrl,
  onRefreshAll,
  loading,
  version,
  setup,
  licenseValid,
  blockCount,
  processCount,
  runningProcessCount,
}: EdgeConnectionHeroProps) {
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
    <div className={cn(sectionCard, 'shrink-0 overflow-hidden')}>
      <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              'relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1',
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

        {edgeReady && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-info/10 px-3 py-2 ring-1 ring-info/25">
              <Box className="h-4 w-4 text-info" />
              <div className="text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-info">Blocks</p>
                <p className="text-sm font-bold tabular-nums">{blockCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 ring-1 ring-primary/25">
              <Workflow className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Processes</p>
                <p className="text-sm font-bold tabular-nums">
                  {processCount}
                  {runningProcessCount > 0 && (
                    <span className="ml-1 text-xs font-medium text-success">({runningProcessCount} live)</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => void onRefreshAll()}
              disabled={!edgeReady || loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function EdgeDisconnectedPlaceholder() {
  return (
    <div
      className={cn(
        sectionCard,
        'flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center',
      )}
    >
      <div className="grid max-w-lg grid-cols-2 gap-3">
        <div className="rounded-2xl border border-info/25 bg-info/5 p-5 ring-1 ring-info/15">
          <Box className="mx-auto h-8 w-8 text-info" />
          <p className="mt-3 text-sm font-semibold">Blocks</p>
          <p className="mt-1 text-xs text-muted-foreground">Invoke one-shot API operations</p>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 ring-1 ring-primary/15">
          <Workflow className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm font-semibold">Processes</p>
          <p className="mt-1 text-xs text-muted-foreground">Start and stop long-running workflows</p>
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold">Edge Command Center</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Connect to your Edge appliance to invoke blocks, control workflows, and monitor activity.
        </p>
      </div>
    </div>
  )
}
