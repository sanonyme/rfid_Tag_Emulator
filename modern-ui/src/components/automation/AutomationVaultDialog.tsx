import { useState, useEffect } from 'react'
import { Key, Lock, Plus, Trash2, Eye, EyeOff, Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import type { VaultEntry } from '@/lib/automation-vault'

interface AutomationVaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  envVars: VaultEntry[]
  secrets: VaultEntry[]
  onSaveEnvVars: (entries: VaultEntry[]) => void
  onSaveSecrets: (entries: VaultEntry[]) => Promise<void> | void
}

export function AutomationVaultDialog({
  open,
  onOpenChange,
  envVars,
  secrets,
  onSaveEnvVars,
  onSaveSecrets,
}: AutomationVaultDialogProps) {
  const [tab, setTab] = useState<'env' | 'secrets'>('env')
  const [draftEnv, setDraftEnv] = useState<VaultEntry[]>(envVars)
  const [draftSecrets, setDraftSecrets] = useState<VaultEntry[]>(secrets)
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) {
      setDraftEnv(envVars)
      setDraftSecrets(secrets)
      setRevealedKeys(new Set())
    }
  }, [open, envVars, secrets])

  const handleSaveAll = async () => {
    const cleanEnv = draftEnv
      .map((e) => ({ key: e.key.trim(), value: e.value }))
      .filter((e) => e.key.length > 0)
    const cleanSecrets = draftSecrets
      .map((e) => ({ key: e.key.trim(), value: e.value }))
      .filter((e) => e.key.length > 0)

    const invalid = [...cleanEnv, ...cleanSecrets].find((e) => !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(e.key))
    if (invalid) {
      toast.error(`Invalid key "${invalid.key}" — use letters, numbers, _ or -`)
      return
    }

    onSaveEnvVars(cleanEnv)
    await onSaveSecrets(cleanSecrets)
    toast.success(`Saved ${cleanEnv.length} env var(s) and ${cleanSecrets.length} secret(s)`)
    onOpenChange(false)
  }

  const copyToken = (prefix: 'env' | 'secret', key: string) => {
    const k = key.trim()
    if (!k) return
    const token = `{{${prefix}.${k}}}`
    void navigator.clipboard.writeText(token)
    toast.success(`Copied ${token}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-primary" />
            Environment Variables &amp; Secrets Vault
          </DialogTitle>
          <DialogDescription className="text-xs">
            Reference values anywhere in any workflow node with{' '}
            <code className="font-mono text-primary">{'{{env.KEY}}'}</code> or{' '}
            <code className="font-mono text-amber-600 dark:text-amber-400">{'{{secret.KEY}}'}</code>.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'env' | 'secrets')} className="flex flex-1 min-h-0 flex-col">
          <div className="border-b border-border/40 bg-muted/20 px-4 pt-2 shrink-0">
            <TabsList className="h-8">
              <TabsTrigger value="env" className="text-xs gap-1.5">
                Env Vars ({draftEnv.length})
              </TabsTrigger>
              <TabsTrigger value="secrets" className="text-xs gap-1.5">
                <Lock className="h-3 w-3" />
                Secrets ({draftSecrets.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="env" className="flex-1 min-h-[260px] max-h-[50vh] overflow-y-auto p-4 space-y-2.5 mt-0">
            {draftEnv.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                No environment variables yet. Add shared URLs, ports, paths, or defaults below.
              </div>
            ) : (
              draftEnv.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={entry.key}
                    onChange={(e) =>
                      setDraftEnv((prev) => prev.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
                    }
                    placeholder="API_BASE_URL"
                    className="h-8 w-44 font-mono text-xs"
                  />
                  <Input
                    value={entry.value}
                    onChange={(e) =>
                      setDraftEnv((prev) => prev.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))
                    }
                    placeholder="https://api.example.com"
                    className="h-8 flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Copy {{env.KEY}}"
                    onClick={() => copyToken('env', entry.key)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => setDraftEnv((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setDraftEnv((prev) => [...prev, { key: '', value: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Environment Variable
            </Button>
          </TabsContent>

          <TabsContent value="secrets" className="flex-1 min-h-[260px] max-h-[50vh] overflow-y-auto p-4 space-y-2.5 mt-0">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                Secrets are encrypted by OS credential storage, masked in the Variable Inspector, redacted from logs, and never exported in workflow JSON.
              </span>
            </div>

            {draftSecrets.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No secrets stored yet. Add API tokens, SSH passwords, or webhook URLs below.
              </div>
            ) : (
              draftSecrets.map((entry, idx) => {
                const shown = revealedKeys.has(idx)
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={entry.key}
                      onChange={(e) =>
                        setDraftSecrets((prev) => prev.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
                      }
                      placeholder="SLACK_WEBHOOK"
                      className="h-8 w-44 font-mono text-xs"
                    />
                    <Input
                      type={shown ? 'text' : 'password'}
                      value={entry.value}
                      onChange={(e) =>
                        setDraftSecrets((prev) => prev.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))
                      }
                      placeholder="Secret value"
                      className="h-8 flex-1 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title={shown ? 'Hide secret' : 'Show secret'}
                      onClick={() =>
                        setRevealedKeys((prev) => {
                          const next = new Set(prev)
                          if (next.has(idx)) next.delete(idx)
                          else next.add(idx)
                          return next
                        })
                      }
                    >
                      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Copy {{secret.KEY}}"
                      onClick={() => copyToken('secret', entry.key)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => setDraftSecrets((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setDraftSecrets((prev) => [...prev, { key: '', value: '' }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Encrypted Secret
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="p-3 border-t border-border/50 bg-muted/10 flex items-center justify-between shrink-0">
          <Label className="text-[11px] font-normal text-muted-foreground">
            Available in every run automatically
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleSaveAll()}>
              Save Vault
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
