import { useState } from 'react'
import { Button } from '../ui/button'
import {
  AlertCircle,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  Server,
  User,
  Wifi,
} from 'lucide-react'

/** Shown while the emulator itself is not connected to a reader host. */
export function DbNoHostScreen({ onDirectHost }: { onDirectHost: (host: string) => void }) {
  const [showIp, setShowIp] = useState(false)
  const [ip, setIp] = useState('')

  const submit = () => {
    const next = ip.trim()
    if (!next) return
    onDirectHost(next)
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground"
      data-tour="tour-database"
    >
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-muted/40 ring-1 ring-border/40 flex items-center justify-center">
          <Database className="w-9 h-9 opacity-40" />
        </div>
        <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-background ring-1 ring-border/60 flex items-center justify-center">
          <Wifi className="w-3.5 h-3.5 text-amber-500" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold text-foreground">Not Connected</p>
        <p className="text-sm max-w-sm">
          Connect to an IP with the connection button above, then come back here to browse the MySQL database on that host.
        </p>
      </div>
      {!showIp ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg text-xs"
          onClick={() => setShowIp(true)}
        >
          <Server className="h-3.5 w-3.5" />
          Connect by IP
        </Button>
      ) : (
        <div className="flex w-full max-w-xs items-center gap-1.5">
          <input
            autoFocus
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setShowIp(false)
            }}
            placeholder="192.168.1.10"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border/50 bg-background/60 px-2.5 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Database host IP"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-xs"
            disabled={!ip.trim()}
            onClick={submit}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  )
}

export type DbEngineChoice = 'mysql' | 'postgres'

interface DbLoginScreenProps {
  host: string
  dbEngine: DbEngineChoice
  dbPort: string
  dbName: string
  dbSsl: boolean
  dbUser: string
  dbPass: string
  rememberCreds: boolean
  connecting: boolean
  credsLoaded: boolean
  error: string
  onEngineChange: (v: DbEngineChoice) => void
  onPortChange: (v: string) => void
  onDbNameChange: (v: string) => void
  onSslChange: (v: boolean) => void
  onUserChange: (v: string) => void
  onPassChange: (v: string) => void
  onRememberChange: (v: boolean) => void
  onConnect: () => void
  onChangeHost?: () => void
}

/** Database sign-in card shown before a session exists (MySQL or PostgreSQL). */
export function DbLoginScreen({
  host,
  dbEngine,
  dbPort,
  dbName,
  dbSsl,
  dbUser,
  dbPass,
  rememberCreds,
  connecting,
  credsLoaded,
  error,
  onEngineChange,
  onPortChange,
  onDbNameChange,
  onSslChange,
  onUserChange,
  onPassChange,
  onRememberChange,
  onConnect,
  onChangeHost,
}: DbLoginScreenProps) {
  const [showPass, setShowPass] = useState(false)
  const needsDbName = dbEngine === 'postgres'
  const canConnect =
    !connecting &&
    credsLoaded &&
    dbUser.trim().length > 0 &&
    (!needsDbName || dbName.trim().length > 0)

  return (
    <div className="flex items-center justify-center h-full" data-tour="tour-db-mysql-connect">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card/80 shadow-elev-sm ring-1 ring-border/20 backdrop-blur-sm p-6 animate-in fade-in-0 zoom-in-[0.99] duration-200">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
            <Database className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold leading-none">Database Explorer</h2>
            <p className="text-xs text-muted-foreground">
              Sign in to {dbEngine === 'postgres' ? 'PostgreSQL' : 'MySQL'} on the reader host
            </p>
          </div>

          <div className="flex w-full rounded-lg bg-muted/40 p-0.5 ring-1 ring-border/40">
            {([
              { id: 'mysql' as const, label: 'MySQL' },
              { id: 'postgres' as const, label: 'PostgreSQL' },
            ]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onEngineChange(opt.id)}
                className={
                  dbEngine === opt.id
                    ? 'flex-1 rounded-md bg-background px-2 py-1.5 text-xs font-semibold text-foreground shadow-sm ring-1 ring-border/50'
                    : 'flex-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/50 ring-1 ring-border/40 px-2.5 py-1 text-xs font-mono text-foreground/90">
            <Server className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{host}</span>
            <span className="text-muted-foreground/70">:</span>
            <input
              id="db-port"
              type="number"
              min={1}
              max={65535}
              value={dbPort}
              onChange={(e) => onPortChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canConnect && onConnect()}
              className="h-5 w-[4.25rem] rounded-md border border-border/40 bg-background/70 px-1.5 text-center font-mono text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Database port"
              title="Database port"
            />
            {onChangeHost && (
              <button
                type="button"
                onClick={onChangeHost}
                className="ml-0.5 text-[10px] font-sans text-muted-foreground hover:text-foreground"
              >
                Change
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3.5">
          {needsDbName && (
            <div className="space-y-1.5">
              <label htmlFor="db-name" className="text-xs font-medium text-muted-foreground">
                Database
              </label>
              <input
                id="db-name"
                type="text"
                value={dbName}
                onChange={(e) => onDbNameChange(e.target.value)}
                placeholder="e.g. lebanon_energy"
                className="w-full h-9 px-3 text-sm rounded-lg border border-border/50 bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 font-mono transition-shadow"
                onKeyDown={(e) => e.key === 'Enter' && canConnect && onConnect()}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="db-user" className="text-xs font-medium text-muted-foreground">Username</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                id="db-user"
                type="text"
                value={dbUser}
                onChange={(e) => onUserChange(e.target.value)}
                placeholder="e.g. admin"
                autoComplete="username"
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-border/50 bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 font-mono transition-shadow"
                onKeyDown={(e) => e.key === 'Enter' && canConnect && onConnect()}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="db-pass" className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                id="db-pass"
                type={showPass ? 'text' : 'password'}
                value={dbPass}
                onChange={(e) => onPassChange(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full h-9 pl-9 pr-9 text-sm rounded-lg border border-border/50 bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 font-mono transition-shadow"
                onKeyDown={(e) => e.key === 'Enter' && canConnect && onConnect()}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {needsDbName && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dbSsl}
                onChange={(e) => onSslChange(e.target.checked)}
                className="rounded border-border/50 accent-primary w-3.5 h-3.5"
              />
              <span className="text-xs text-muted-foreground">Use SSL (prefer / allow self-signed)</span>
            </label>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={rememberCreds}
              onChange={(e) => onRememberChange(e.target.checked)}
              className="rounded border-border/50 accent-primary w-3.5 h-3.5"
            />
            <span className="text-xs text-muted-foreground">Remember credentials on this device</span>
          </label>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 ring-1 ring-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span className="break-words min-w-0">{error}</span>
            </div>
          )}

          <Button onClick={onConnect} disabled={!canConnect} className="w-full gap-2 mt-1">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            {connecting ? 'Connecting…' : 'Connect to Database'}
          </Button>
        </div>
      </div>
    </div>
  )
}
