import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { GEN_MODE_OPTIONS, type GenMode } from '@/lib/gen-modes'

interface GenModeFlyoutProps {
  mode: GenMode
  onSelect: (mode: GenMode) => void
  /** Flyout opens below (top nav) or to the right (sidebar). */
  side?: 'bottom' | 'right'
  /** Anchor element for positioning (the Gen tab wrapper). */
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
}

/**
 * Portaled hover submenu for Gen tab modes — escapes overflow clipping.
 */
export function GenModeFlyout({
  mode,
  onSelect,
  side = 'bottom',
  anchorRef,
  open,
}: GenModeFlyoutProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return
    const rect = anchor.getBoundingClientRect()
    const mw = menu.offsetWidth
    const mh = menu.offsetHeight
    const gap = 6
    const margin = 8

    let left: number
    let top: number
    if (side === 'right') {
      left = rect.right + gap
      top = rect.top
      if (left + mw > window.innerWidth - margin) left = Math.max(margin, rect.left - gap - mw)
      if (top + mh > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - mh)
    } else {
      left = rect.left + rect.width / 2 - mw / 2
      top = rect.bottom + gap
      if (left < margin) left = margin
      if (left + mw > window.innerWidth - margin) left = window.innerWidth - margin - mw
      if (top + mh > window.innerHeight - margin) top = Math.max(margin, rect.top - gap - mh)
    }
    setPos({ left, top })
  }, [anchorRef, side])

  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    updatePosition()
    const onScroll = () => updatePosition()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updatePosition])

  if (!open) return null

  return createPortal(
    <div
      ref={menuRef}
      data-tour="tour-gen-modes"
      role="menu"
      aria-label="Generator modes"
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { visibility: 'hidden', left: 0, top: 0 }
      }
      className={cn(
        'fixed z-[9999] min-w-[13.5rem]',
        'rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl shadow-black/15 backdrop-blur-md',
      )}
    >
      {GEN_MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="menuitem"
            data-tour={opt.value === 'batch' ? 'tour-gen-batch-tab' : undefined}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelect(opt.value)
            }}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
              active
                ? 'bg-primary/12 text-primary'
                : 'text-foreground/85 hover:bg-muted hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                active ? 'bg-primary/15 text-primary' : 'bg-muted/70 text-muted-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{opt.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {opt.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/** Hover/focus wrapper that opens GenModeFlyout for a child trigger. */
export function GenModeHoverTarget({
  mode,
  onSelect,
  side = 'bottom',
  className,
  children,
}: {
  mode: GenMode
  onSelect: (mode: GenMode) => void
  side?: 'bottom' | 'right'
  className?: string
  children: React.ReactNode
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  useEffect(() => () => clearClose(), [])

  return (
    <div
      ref={anchorRef}
      className={cn('relative', className)}
      onMouseEnter={() => {
        clearClose()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
      onFocusCapture={() => {
        clearClose()
        setOpen(true)
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleClose()
      }}
    >
      {children}
      <GenModeFlyout
        mode={mode}
        onSelect={(m) => {
          onSelect(m)
          setOpen(false)
        }}
        side={side}
        anchorRef={anchorRef}
        open={open}
      />
      {open && (
        <MenuHoverBridge
          onEnter={() => {
            clearClose()
            setOpen(true)
          }}
          onLeave={scheduleClose}
        />
      )}
    </div>
  )
}

/** Invisible bridge: attach hover listeners to the portaled menu via document. */
function MenuHoverBridge({
  onEnter,
  onLeave,
}: {
  onEnter: () => void
  onLeave: () => void
}) {
  useEffect(() => {
    const menu = document.querySelector('[data-tour="tour-gen-modes"]')
    if (!menu) return
    const enter = () => onEnter()
    const leave = () => onLeave()
    menu.addEventListener('mouseenter', enter)
    menu.addEventListener('mouseleave', leave)
    return () => {
      menu.removeEventListener('mouseenter', enter)
      menu.removeEventListener('mouseleave', leave)
    }
  }, [onEnter, onLeave])
  return null
}
