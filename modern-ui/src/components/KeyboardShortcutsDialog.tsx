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
      <DialogContent className="sm:max-w-[420px] rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-primary" />
            </div>
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions to navigate and control the app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group}
              </p>
              <div className="rounded-xl border border-border/40 bg-muted/5 divide-y divide-border/30 overflow-hidden">
                {items.map(({ label, keys }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-foreground/90">{label}</span>
                    <kbd className="px-2 py-1 rounded-md bg-muted/80 border border-border/50 text-xs font-mono text-muted-foreground">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
