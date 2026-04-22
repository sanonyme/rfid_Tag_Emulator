import { useState } from 'react'
import { AlertTriangle, FolderOpen, Layers, Replace } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { applyBackup, summarizeBackup, type BackupFile, type RestoreMode } from '@/lib/backup'

interface BackupRestoreDialogProps {
  backup: BackupFile | null
  onOpenChange: (open: boolean) => void
  onRestored: () => void
}

export function BackupRestoreDialog({ backup, onOpenChange, onRestored }: BackupRestoreDialogProps) {
  const [mode, setMode] = useState<RestoreMode>('merge')
  const open = backup !== null

  if (!backup) {
    return null
  }

  const summary = summarizeBackup(backup)

  const handleApply = () => {
    applyBackup(backup, mode)
    onRestored()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            Restore backup
          </DialogTitle>
          <DialogDescription>
            Review what's inside the file, then pick how to merge it with your current data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Backup contents
            </div>
            <ul className="text-sm space-y-1">
              <SummaryRow label="Profiles" value={summary.profiles} />
              <SummaryRow label="Automation sequences" value={summary.automationSequences} />
              <SummaryRow label="Saved DB queries" value={summary.savedQueries} />
              <SummaryRow label="Recent hosts" value={summary.recentHosts} />
              <SummaryRow label="App settings" value={summary.hasSettings ? 'Included' : '—'} />
              <SummaryRow label="Theme preferences" value={summary.hasTheme ? 'Included' : '—'} />
            </ul>
            {(summary.appVersion || summary.exportedAt) && (
              <div className="pt-2 mt-2 border-t border-border/30 text-xs text-muted-foreground space-y-0.5">
                {summary.appVersion && <div>Created with Zeus v{summary.appVersion}</div>}
                {summary.exportedAt && (
                  <div>Exported {new Date(summary.exportedAt).toLocaleString()}</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Restore mode
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                active={mode === 'merge'}
                icon={<Layers className="w-4 h-4" />}
                title="Merge"
                description="Keep current data, add items from the backup (profiles de-duplicated by ID)."
                onClick={() => setMode('merge')}
              />
              <ModeCard
                active={mode === 'replace'}
                icon={<Replace className="w-4 h-4" />}
                title="Replace"
                description="Discard current data and restore exactly what's in the backup file."
                onClick={() => setMode('replace')}
              />
            </div>
          </div>

          {mode === 'replace' && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                This will overwrite your current profiles, settings, themes and saved hosts. This action cannot be undone — consider exporting your current state first.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            {mode === 'merge' ? 'Merge backup' : 'Replace everything'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({ label, value }: { label: string; value: number | string }) {
  return (
    <li className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  )
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-xl border-2 p-3 transition-all ' +
        (active
          ? 'border-primary ring-2 ring-primary/20 shadow-sm bg-primary/5'
          : 'border-border/50 hover:border-primary/40')
      }
    >
      <div className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
    </button>
  )
}
