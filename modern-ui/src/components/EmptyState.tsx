import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './ui/skeleton'
import { pageDescription, pageTitle } from '@/lib/ui-tokens'

/** Branded empty / unavailable state used across tabs. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  'data-tour': dataTour,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  'data-tour'?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-16 text-center px-6 h-full min-h-[12rem]',
        className,
      )}
      data-tour={dataTour}
    >
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-muted/40 ring-1 ring-border/40 flex items-center justify-center">
          <Icon className="w-6 h-6 text-muted-foreground opacity-70" />
        </div>
      )}
      <div className="space-y-1.5 max-w-md">
        <h2 className={pageTitle}>{title}</h2>
        {description && <div className={cn(pageDescription, 'mt-0')}>{description}</div>}
      </div>
      {action}
    </div>
  )
}

/** Suspense / first-visit fallback for tab panels. */
export function TabLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-full min-h-[12rem] flex-col gap-3 p-4', className)}
      aria-busy
      aria-label="Loading"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2 flex-1 max-w-sm">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64 opacity-70" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl opacity-80" />
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 p-3 space-y-2"
            style={{ opacity: Math.max(0.35, 1 - i * 0.15) }}
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-20 w-full rounded-lg mt-2" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Compact list/table skeleton for inline loading regions. */
export function ListSkeleton({
  rows = 6,
  cols = 4,
  className,
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden px-3 py-2 space-y-1.5', className)} aria-busy>
      <div className="flex gap-2 pb-1.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 rounded-md opacity-80" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2" style={{ opacity: Math.max(0.25, 1 - r * 0.1) }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-7 flex-1 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  )
}
