import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

/** Reusable presentational primitives for the Database tab. */

/** Context menu that flips/clamps itself to stay inside the viewport. */
export function FlippedContextMenu({
  x,
  y,
  className,
  children,
  onClick,
  onContextMenu,
}: {
  x: number
  y: number
  className?: string
  children: ReactNode
  onClick?: MouseEventHandler<HTMLDivElement>
  onContextMenu?: MouseEventHandler<HTMLDivElement>
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = y
    if (top + height > window.innerHeight - margin) top = y - height
    if (top < margin) top = margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
    if (left < margin) left = margin
    setPosition({ left, top })
  }, [x, y, children])

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9999] min-w-[200px] rounded-xl border border-border/70 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-sm p-1 animate-in fade-in-0 zoom-in-95 duration-100',
        className,
      )}
      style={{ left: position.left, top: position.top }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  )
}

/** One row inside a context menu / dropdown. */
export function MenuItem({
  icon: Icon,
  iconClassName,
  children,
  onClick,
  disabled,
  destructive,
  title,
  shortcut,
}: {
  icon?: ComponentType<{ className?: string }>
  iconClassName?: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  title?: string
  shortcut?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-left transition-colors',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'hover:bg-accent hover:text-accent-foreground',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {Icon && <Icon className={cn('w-3.5 h-3.5 shrink-0', iconClassName)} />}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <kbd className="text-[10px] text-muted-foreground font-mono">{shortcut}</kbd>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="border-t border-border/50 my-1 -mx-1" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {children}
    </div>
  )
}

/** Lightweight centered modal used by the tab's confirm/create dialogs. */
export function SubtleModal({
  className,
  children,
  animate = true,
}: {
  className?: string
  children: ReactNode
  animate?: boolean
}) {
  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center bg-black/40',
        animate && 'animate-in fade-in-0 duration-150',
      )}
    >
      <div
        className={cn(
          'rounded-xl border border-border bg-popover shadow-2xl p-5 w-full mx-4',
          animate && 'animate-in fade-in-0 zoom-in-[0.98] slide-in-from-bottom-1 duration-200 ease-out',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Compact icon button with a real tooltip (replaces bare `title=` buttons). */
export function IconAction({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  active,
  activeClassName,
  destructive,
  spinning,
  buttonRef,
  side = 'bottom',
}: {
  icon: ComponentType<{ className?: string }>
  label: ReactNode
  shortcut?: string
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  /** Color treatment when `active` (defaults to primary tint). */
  activeClassName?: string
  destructive?: boolean
  spinning?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'h-7 w-7 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none',
            active
              ? activeClassName ?? 'text-primary bg-primary/15'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            destructive && 'hover:text-destructive hover:bg-destructive/10',
          )}
        >
          {spinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && <span className="text-[10px] text-muted-foreground font-mono">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/** Thin vertical divider between toolbar icon groups. */
export function ToolbarSep() {
  return <div className="h-4 w-px shrink-0 bg-border/60 mx-0.5" aria-hidden />
}
