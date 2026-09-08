import { useEffect, useState } from 'react'
import { Megaphone, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { cn } from '@/lib/utils'
import {
  APP_VERSION,
  getWhatsNewForDialog,
  setSeenWhatsNewVersion,
  shouldAutoShowWhatsNew,
  type WhatsNewEntry,
} from '@/lib/whats-new'

type WhatsNewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, mark the current version as seen on close. */
  markSeenOnClose?: boolean
}

export function WhatsNewDialog({ open, onOpenChange, markSeenOnClose = true }: WhatsNewDialogProps) {
  const entries = getWhatsNewForDialog(APP_VERSION)

  const handleOpenChange = (next: boolean) => {
    if (!next && markSeenOnClose) {
      setSeenWhatsNewVersion(APP_VERSION)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/50 bg-card/95 p-0 shadow-xl backdrop-blur-xl sm:max-w-[480px]">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border/40 px-6 pb-4 pt-6 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sparkles className="h-4 w-4" />
            </span>
            What&apos;s New
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Zeus <span className="font-mono text-foreground/90">v{APP_VERSION}</span> — patch notes and recent
            highlights.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-5 pr-1">
            {entries.map((entry, index) => (
              <WhatsNewSection key={entry.version} entry={entry} featured={index === 0} />
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/40 px-6 py-4">
          <Button type="button" className="rounded-lg" onClick={() => handleOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WhatsNewSection({ entry, featured }: { entry: WhatsNewEntry; featured: boolean }) {
  return (
    <section className={cn(!featured && 'opacity-90')}>
      <div className="mb-2 flex items-baseline gap-2">
        <h3
          className={cn(
            'font-mono text-sm font-semibold tracking-tight',
            featured ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          v{entry.version}
        </h3>
        {entry.date && <span className="text-[11px] text-muted-foreground">{entry.date}</span>}
        {featured && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary ring-1 ring-primary/25">
            Current
          </span>
        )}
      </div>
      <ul className="space-y-2.5">
        {entry.highlights.map((item) => (
          <li key={item.title} className="flex gap-2.5 text-sm leading-snug">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{item.title}</p>
              {item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Title-bar control + auto-open once per version after update/install. */
export function WhatsNewTitleBarControl() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!shouldAutoShowWhatsNew(APP_VERSION)) return
    const id = window.setTimeout(() => setOpen(true), 600)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-drag inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        title="What's New"
        aria-label="What's New"
      >
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="hidden text-xs font-medium sm:inline">What&apos;s New</span>
      </button>
      <WhatsNewDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
