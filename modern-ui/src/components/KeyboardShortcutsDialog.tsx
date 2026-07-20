import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { group: 'Navigation', items: [
    { label: 'Go to Fixed', keys: 'Ctrl+1' },
    { label: 'Go to Handheld', keys: 'Ctrl+2' },
    { label: 'Go to OCR', keys: 'Ctrl+3' },
    { label: 'Go to Custom', keys: 'Ctrl+4' },
    { label: 'Go to API', keys: 'Ctrl+5' },
    { label: 'Go to Decoder', keys: 'Ctrl+6' },
    { label: 'Go to Auto', keys: 'Ctrl+7' },
    { label: 'Go to Generator', keys: 'Ctrl+8' },
    { label: 'Go to Database', keys: 'Ctrl+9' },
  ]},
  { group: 'General', items: [
    { label: 'Command palette', keys: 'Ctrl+K' },
    { label: 'Interactive UI tour', keys: '?' },
  ]},
  { group: 'Send', items: [
    { label: 'Send tags once (Fixed: anywhere; Handheld: from tag fields)', keys: 'Ctrl+Enter' },
    { label: 'Start / stop loop send', keys: 'Ctrl+Shift+Enter' },
  ]},
  { group: 'Tag list textareas', items: [
    { label: 'Save current list as preset', keys: 'Ctrl+S' },
    { label: 'Open preset menu', keys: 'Ctrl+L' },
    { label: 'Show invalid-line popover', keys: 'click → N EPCs · M errors' },
  ]},
  { group: 'Window', items: [
    { label: 'Toggle fullscreen', keys: 'F11' },
    { label: 'Reload app', keys: 'Ctrl+R' },
  ]},
]

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/50 bg-card/95 p-0 shadow-xl backdrop-blur-xl sm:max-w-[440px]">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border/40 px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Keyboard className="h-4 w-4 text-primary" />
            </div>
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions to navigate and control the app.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-5">
            {SHORTCUTS.map(({ group, items }) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="divide-y divide-border/30 overflow-hidden rounded-xl border border-border/40 bg-muted/5">
                  {items.map(({ label, keys }) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 leading-snug text-foreground/90">
                        {label}
                      </span>
                      <kbd className="shrink-0 rounded-md border border-border/50 bg-muted/80 px-2 py-1 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
