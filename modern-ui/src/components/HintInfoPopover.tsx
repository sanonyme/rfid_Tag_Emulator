import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HintInfoPopoverProps {
  description: string
  actionLabel: string
  onAction: () => void
  className?: string
}

/**
 * Click-to-open info menu portaled to document.body so it is not clipped by
 * scroll/overflow containers (common in tab cards and side panels).
 */
export function HintInfoPopover({
  description,
  actionLabel,
  onAction,
  className,
}: HintInfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !triggerRef.current) return

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      setPosition({
        top: rect.top - 8,
        left: rect.right,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'shrink-0 self-center rounded-md p-0.5 text-muted-foreground/70 transition-colors hover:bg-background/60 hover:text-foreground',
          open && 'bg-background/60 text-foreground',
          className,
        )}
        aria-label="About check-digit hints"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="dialog"
            className="fixed z-[200] w-[15.5rem] -translate-x-full -translate-y-full rounded-lg border border-border/60 bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border/20"
            style={{ top: position.top, left: position.left }}
          >
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
            <button
              type="button"
              className="mt-2.5 w-full rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60"
              onClick={() => {
                setOpen(false)
                onAction()
              }}
            >
              {actionLabel}
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
