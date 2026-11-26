import { forwardRef, type HTMLAttributes } from 'react'
import { Handle, Position, type HandleProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

/**
 * Official React Flow UI (`BaseNode`) pattern adapted to Zeus shadcn/ui tokens.
 * Keeps card elevation, borders, selection rings, and execution states crisp across
 * every light and dark theme without visual clutter.
 */
export const BaseNode = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    selected?: boolean
    status?: 'idle' | 'running' | 'success' | 'error' | 'skipped'
  }
>(({ className, selected, status = 'idle', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative rounded-xl border bg-popover text-popover-foreground shadow-elev-sm transition-[border-color,box-shadow] duration-150 focus:outline-none',
      'border-border/90 hover:border-foreground/25 hover:shadow-elev-md',
      selected && 'border-primary ring-2 ring-primary/25 shadow-elev-md',
      status === 'running' &&
        'border-emerald-500 ring-2 ring-emerald-500/35 shadow-[0_0_24px_rgba(16,185,129,0.22)]',
      status === 'error' &&
        'border-destructive ring-2 ring-destructive/30',
      status === 'success' && !selected && 'border-emerald-500/55',
      className,
    )}
    {...props}
  />
))
BaseNode.displayName = 'BaseNode'

export const BaseNodeHeader = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-2 rounded-t-[11px] border-b border-border/60 bg-muted/35 px-3 py-2',
        className,
      )}
      {...props}
    />
  ),
)
BaseNodeHeader.displayName = 'BaseNodeHeader'

export const BaseNodeHeaderTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-foreground select-none',
      className,
    )}
    {...props}
  />
))
BaseNodeHeaderTitle.displayName = 'BaseNodeHeaderTitle'

export const BaseNodeContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 px-3 py-2.5 text-xs', className)} {...props} />
  ),
)
BaseNodeContent.displayName = 'BaseNodeContent'

export const BaseNodeFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-2 rounded-b-[11px] border-t border-border/50 bg-muted/20 px-3 py-1.5 text-[10.5px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
)
BaseNodeFooter.displayName = 'BaseNodeFooter'

/**
 * Flush React Flow handle.
 * Never overrides React Flow's `left: 0` / `right: 0` / `transform: translate(±50%, -50%)`,
 * so handles always stay pinned accurately on the card border without jumping on hover.
 */
export function BaseHandle({
  className,
  ...props
}: HandleProps & { className?: string }) {
  return (
    <Handle
      {...props}
      className={cn(
        '!h-3 !w-3 !rounded-full !border-2 !border-popover !bg-muted-foreground/85 transition-[background-color,box-shadow] duration-150',
        'hover:!bg-primary hover:shadow-[0_0_0_4px_hsl(var(--primary)/0.25)]',
        className,
      )}
    />
  )
}

/**
 * Dedicated branch/port row with a flush React Flow handle centered on its right/left edge.
 * Eliminates overlapping port badges on CONDITION, SWITCH, RANDOM, and Error-Output nodes.
 */
export function LabeledHandle({
  id,
  type,
  position,
  title,
  dotColor,
  labelClassName,
  handleClassName,
}: {
  id: string
  type: 'source' | 'target'
  position: Position
  title: string
  dotColor?: string
  labelClassName?: string
  handleClassName?: string
}) {
  const isRight = position === Position.Right
  return (
    <div
      className={cn(
        'relative flex items-center border-t border-border/45 px-3 py-1.5 text-[11px]',
        isRight ? 'justify-end' : 'justify-start',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-medium tracking-wide text-muted-foreground select-none',
          labelClassName,
        )}
      >
        {dotColor && (
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {title}
      </span>
      <BaseHandle
        id={id}
        type={type}
        position={position}
        className={handleClassName}
      />
    </div>
  )
}
