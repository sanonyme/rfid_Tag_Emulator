import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import {
  ShieldCheck,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ChecksumResult {
  md5: string
  sha256: string
  sha1: string
  size: number
}

interface SftpChecksumDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  remotePath: string
  remoteContentBase64?: string
  localFilePath?: string
  localFileName?: string
}

export function SftpChecksumDialog({
  open,
  onOpenChange,
  fileName,
  remotePath,
  remoteContentBase64,
  localFilePath,
  localFileName: _localFileName,
}: SftpChecksumDialogProps) {
  const [loading, setLoading] = useState(false)
  const [remoteHashes, setRemoteHashes] = useState<ChecksumResult | null>(null)
  const [localHashes, setLocalHashes] = useState<ChecksumResult | null>(null)
  const [expectedHash, setExpectedHash] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setRemoteHashes(null)
      setLocalHashes(null)
      setExpectedHash('')
      setError(null)
      return
    }

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const api = window.electronAPI
        if (!api?.fileCalculateChecksum) {
          setError('Checksum calculator requires the Electron desktop runtime.')
          return
        }

        // Calculate remote hashes
        if (remoteContentBase64) {
          const res = await api.fileCalculateChecksum({ base64Content: remoteContentBase64 })
          if (res.ok && res.md5 && res.sha256 && res.sha1) {
            setRemoteHashes({
              md5: res.md5,
              sha256: res.sha256,
              sha1: res.sha1,
              size: res.size ?? 0,
            })
          } else {
            setError(res.error || 'Failed to compute remote checksum')
          }
        }

        // Calculate local hashes if local comparison path provided
        if (localFilePath) {
          const res = await api.fileCalculateChecksum({ filePath: localFilePath })
          if (res.ok && res.md5 && res.sha256 && res.sha1) {
            setLocalHashes({
              md5: res.md5,
              sha256: res.sha256,
              sha1: res.sha1,
              size: res.size ?? 0,
            })
          }
        }
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [open, remoteContentBase64, localFilePath])

  const copyHash = (hash: string, key: string) => {
    void navigator.clipboard.writeText(hash)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
    toast.success('Copied hash to clipboard')
  }

  // Verification status against user input
  const verification = (() => {
    const q = expectedHash.trim().toLowerCase()
    if (!q || !remoteHashes) return null
    if (q === remoteHashes.md5.toLowerCase()) return { matched: true, type: 'MD5' }
    if (q === remoteHashes.sha256.toLowerCase()) return { matched: true, type: 'SHA-256' }
    if (q === remoteHashes.sha1.toLowerCase()) return { matched: true, type: 'SHA-1' }
    return { matched: false }
  })()

  // Comparison between Remote and Local
  const localMatch =
    remoteHashes && localHashes ? remoteHashes.sha256 === localHashes.sha256 : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-background p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <div>
              <DialogTitle className="text-base font-semibold">
                File Integrity & Checksums
              </DialogTitle>
              <DialogDescription className="text-xs font-mono truncate max-w-md mt-0.5">
                {fileName} ({remotePath})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>Calculating cryptographic hashes…</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && remoteHashes && (
            <>
              {/* Local vs Remote Match Banner */}
              {localMatch !== null && (
                <div
                  className={cn(
                    'rounded-lg border p-3 flex items-center justify-between gap-3 text-xs',
                    localMatch
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {localMatch ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span>
                      {localMatch
                        ? 'Remote and Local files are 100% identical'
                        : 'Remote and Local file contents do not match!'}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    SHA-256 verified
                  </Badge>
                </div>
              )}

              {/* Hashes List */}
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      SHA-256 (Recommended)
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => copyHash(remoteHashes.sha256, 'sha256')}
                    >
                      {copiedKey === 'sha256' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <div className="font-mono text-xs break-all bg-background/80 p-2 rounded border border-border/40 select-all">
                    {remoteHashes.sha256}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      MD5
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => copyHash(remoteHashes.md5, 'md5')}
                    >
                      {copiedKey === 'md5' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <div className="font-mono text-xs break-all bg-background/80 p-2 rounded border border-border/40 select-all">
                    {remoteHashes.md5}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      SHA-1
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={() => copyHash(remoteHashes.sha1, 'sha1')}
                    >
                      {copiedKey === 'sha1' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      Copy
                    </Button>
                  </div>
                  <div className="font-mono text-xs break-all bg-background/80 p-2 rounded border border-border/40 select-all">
                    {remoteHashes.sha1}
                  </div>
                </div>
              </div>

              {/* Verify input */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <Label htmlFor="verify-hash" className="text-xs font-medium">
                  Verify against expected hash (checksum verification)
                </Label>
                <Input
                  id="verify-hash"
                  placeholder="Paste expected MD5, SHA-1, or SHA-256 hash…"
                  value={expectedHash}
                  onChange={(e) => setExpectedHash(e.target.value)}
                  className="font-mono text-xs h-8"
                />

                {verification && (
                  <div
                    className={cn(
                      'mt-2 rounded-lg p-2.5 flex items-center gap-2 text-xs font-medium',
                      verification.matched
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-destructive/15 text-destructive border border-destructive/30',
                    )}
                  >
                    {verification.matched ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>
                          Hash verified! Exact match with remote file <strong>{verification.type}</strong>.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        <span>Hash does NOT match any calculated hash!</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-3 border-t border-border/50 bg-muted/10">
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
