import { useCallback, useEffect, useState } from 'react'
import { Server, Send, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import type { InstallRegistryStatus } from '@/types/electron'

/**
 * Register this app install with your backend (INSTALL_REGISTRY_URL). Sends machineId + mac + version.
 */
export function InstallRegistryPanel() {
  const [status, setStatus] = useState<InstallRegistryStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.installRegistryGetStatus) return
    try {
      const next = await window.electronAPI.installRegistryGetStatus()
      setStatus(next)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sendNowCooldownActive = (status?.sendNowAfterMs ?? 0) > 0
  useEffect(() => {
    if (!sendNowCooldownActive) return
    const t = setInterval(() => {
      void refresh()
    }, 1000)
    return () => clearInterval(t)
  }, [sendNowCooldownActive, refresh])

  const api = window.electronAPI
  if (!api?.installRegistryGetStatus) return null

  const toggle = async (next: boolean) => {
    setBusy(true)
    try {
      await api.installRegistrySetEnabled(next)
      await refresh()
      toast.success(next ? 'Install registration on' : 'Install registration off')
    } finally {
      setBusy(false)
    }
  }

  const sendNow = async () => {
    setBusy(true)
    try {
      const r = await api.installRegistrySendNow()
      await refresh()
      if (r.status === 'success') {
        toast.success('Recorded', { description: 'Your install was sent to the registry URL.' })
      } else if (r.status === 'disabled') {
        toast.error('Not sent', { description: r.error ?? 'URL not set or registration disabled.' })
      } else if (r.status === 'skipped') {
        const desc =
          r.error ??
          (r.sendNowAfterMs != null
            ? `Wait ${Math.ceil(r.sendNowAfterMs / 1000)}s before sending again.`
            : 'Already sent recently. Automatic sends are at most once per 24h.')
        toast.message('Not sent', { description: desc })
      } else {
        toast.error('Failed', { description: r.error ?? 'Unknown error.' })
      }
    } finally {
      setBusy(false)
    }
  }

  const copyPayload = async () => {
    if (!status) return
    const text = JSON.stringify(status.nextPayload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/5 p-4">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          Install registry
        </h4>
        <p className="text-xs text-muted-foreground mt-2">Loading…</p>
      </div>
    )
  }

  const hasEndpoint = Boolean(status.endpoint)
  const sendBlockedByCooldown = status.sendNowAfterMs > 0
  const sendNowLabel = sendBlockedByCooldown
    ? `Send now (${Math.ceil(status.sendNowAfterMs / 1000)}s)`
    : 'Send now'
  const lastLabel = (() => {
    if (!status.lastSentAt) return 'Never'
    const diff = Date.now() - status.lastSentAt
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`
    return `${Math.floor(diff / 86_400_000)} day(s) ago`
  })()

  return (
    <div className="rounded-xl border border-border/40 bg-muted/5 p-4 space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Server className="w-4 h-4 text-primary" />
        Install registry
      </h4>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Register this install? Skip if you're not sure.
      </p>

      <div className="flex items-center justify-between gap-4">
        <Label className="text-sm">Register this install</Label>
        <Switch checked={status.enabled} disabled={busy || !hasEndpoint} onCheckedChange={toggle} />
      </div>

      {!hasEndpoint && (
        <p className="text-xs text-amber-600 dark:text-amber-500/90">
          No <code className="font-mono text-[11px]">INSTALL_REGISTRY_URL</code> — set it and restart
          the app (or put <code className="font-mono text-[11px]">.env</code> beside the executable).
        </p>
      )}

      {hasEndpoint && !status.hasToken && (
        <p className="text-[11px] text-muted-foreground">
          Optional: set <code className="font-mono">REGISTRY_TOKEN</code> (same on server) to require{' '}
          <code className="font-mono">Authorization: Bearer …</code>.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Next payload</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyPayload}
            disabled={busy}
            className="gap-1.5 h-7 text-xs"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
        </div>
        <pre className="font-mono text-[11px] leading-relaxed bg-background/60 border border-border/40 rounded-md p-3 overflow-x-auto max-h-40">
          {JSON.stringify(status.nextPayload, null, 2)}
        </pre>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Last sent:</span> {lastLabel}
          {status.lastSentStatus && status.lastSentStatus !== 'skipped' && (
            <span
              className={
                status.lastSentStatus === 'success'
                  ? ' text-emerald-500'
                  : ' text-destructive'
              }
            >
              {' '}
              · {status.lastSentStatus}
            </span>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={sendNow}
          disabled={busy || !status.enabled || !hasEndpoint || sendBlockedByCooldown}
          className="gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          {sendNowLabel}
        </Button>
      </div>
    </div>
  )
}
