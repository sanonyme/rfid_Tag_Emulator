import { useEffect } from 'react'
import {
  ArrowLeft,
  Box,
  Hash,
  Loader2,
  Package,
  SearchX,
  ShoppingCart,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { ScrollArea } from '../ui/scroll-area'
import { SubtleModal } from './DbSurfaces'
import type { CartonInspectModel, InspectCarton, InspectLine, OrderInspectModel } from './db-inspect'

export type DbInspectView =
  | { kind: 'order'; model: OrderInspectModel }
  | { kind: 'carton'; model: CartonInspectModel; fromOrder?: OrderInspectModel }

export function packingViewLabel(view: DbInspectView): string {
  if (view.kind === 'order') return view.model.orderNumber ? `Order ${view.model.orderNumber}` : 'Order packing list'
  return view.model.sscc ? `Carton ${view.model.sscc}` : 'Carton contents'
}

function qty(n: number): string {
  return n.toLocaleString()
}

function CartonBarcode({ sscc }: { sscc: string }) {
  const digits = sscc.replace(/\D/g, '') || sscc
  return (
    <div className="rounded-sm bg-background px-2 py-1.5 ring-1 ring-border/50">
      <div className="flex h-8 items-end justify-center gap-px overflow-hidden">
        {Array.from(digits).map((ch, i) => {
          const n = ch.charCodeAt(0) % 10
          const h = 40 + n * 6
          const w = n % 3 === 0 ? 2 : 1
          return (
            <span
              key={`${ch}-${i}`}
              className="bg-foreground/85"
              style={{ height: `${h}%`, width: w }}
            />
          )
        })}
      </div>
      <p className="mt-1 text-center font-mono text-[10px] tracking-wider text-foreground/80">
        {sscc || '—'}
      </p>
    </div>
  )
}

function LineRow({ line }: { line: InspectLine }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border/30 py-1.5 last:border-0">
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-primary">
        ×{qty(line.quantity)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">{line.label}</p>
        {line.barcode && line.barcode !== line.label && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">{line.barcode}</p>
        )}
      </div>
    </div>
  )
}

function CartonCard({
  carton,
  index,
  total,
  onOpen,
}: {
  carton: InspectCarton
  index: number
  total: number
  onOpen?: (carton: InspectCarton) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(carton)}
      className={cn(
        'group text-left rounded-xl overflow-hidden transition-transform',
        onOpen && 'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      )}
    >
      <div className="mx-5 h-2.5 rounded-t-md bg-amber-800/70 dark:bg-amber-700/60" />
      <div className="rounded-xl border border-amber-900/20 bg-amber-100/70 p-3 shadow-sm ring-1 ring-amber-900/10 dark:border-amber-500/20 dark:bg-amber-950/40 dark:ring-amber-500/10">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-900/70 dark:text-amber-200/70">
            <Box className="h-3 w-3" />
            Carton {index + 1}/{total}
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono">
            {qty(carton.totalQty)} pcs
          </Badge>
        </div>
        <CartonBarcode sscc={carton.sscc} />
        <div className="mt-2 max-h-36 overflow-auto">
          {carton.lines.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">Empty carton</p>
          ) : (
            carton.lines.map((line) => (
              <LineRow key={`${line.itemId}-${line.barcode}`} line={line} />
            ))
          )}
        </div>
        {onOpen && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            Open carton
          </p>
        )}
      </div>
    </button>
  )
}

function OrderBody({
  model,
  onOpenCarton,
}: {
  model: OrderInspectModel
  onOpenCarton: (carton: InspectCarton) => void
}) {
  const totalQty = model.cartons.reduce((sum, c) => sum + c.totalQty, 0)
  const lineCount = model.cartons.reduce((sum, c) => sum + c.lines.length, 0)
  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Order</p>
          <h2 className="truncate font-mono text-lg font-semibold leading-tight">{model.orderNumber}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="h-5 gap-1 text-[10px]">
              <Package className="h-3 w-3" />
              {model.cartons.length} carton{model.cartons.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="h-5 gap-1 text-[10px]">
              {lineCount} item{lineCount === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="h-5 gap-1 font-mono text-[10px]">
              {qty(totalQty)} pcs
            </Badge>
          </div>
        </div>
      </div>
      {model.cartons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No cartons packed yet</p>
          <p className="mt-1 text-xs text-muted-foreground">This order exists, but nothing is linked in container.</p>
        </div>
      ) : (
        <ScrollArea className="h-[min(60vh,28rem)] pr-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {model.cartons.map((carton, i) => (
              <CartonCard
                key={carton.containerId || carton.sscc || i}
                carton={carton}
                index={i}
                total={model.cartons.length}
                onOpen={onOpenCarton}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  )
}

function CartonBody({ model }: { model: CartonInspectModel }) {
  const totalQty = model.lines.reduce((sum, l) => sum + l.quantity, 0)
  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Box className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Carton</p>
          <h2 className="truncate font-mono text-lg font-semibold leading-tight">{model.sscc}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {model.orderNumber && (
              <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                <Hash className="h-3 w-3" />
                {model.orderNumber}
              </Badge>
            )}
            <Badge variant="outline" className="h-5 gap-1 text-[10px]">
              {model.lines.length} item{model.lines.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="h-5 gap-1 font-mono text-[10px]">
              {qty(totalQty)} pcs
            </Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-sm">
        <div className="mx-8 h-3 rounded-t-md bg-amber-800/70 dark:bg-amber-700/60" />
        <div className="rounded-2xl border border-amber-900/20 bg-amber-100/80 p-4 shadow-sm ring-1 ring-amber-900/10 dark:border-amber-500/20 dark:bg-amber-950/50 dark:ring-amber-500/10">
          <CartonBarcode sscc={model.sscc} />
          <div className="mt-3 rounded-lg bg-background/70 px-3 py-1 ring-1 ring-border/40">
            {model.lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No items in this carton</p>
            ) : (
              <ScrollArea className="h-[min(40vh,18rem)]">
                {model.lines.map((line, i) => (
                  <LineRow key={`${line.itemId}-${line.barcode}-${i}`} line={line} />
                ))}
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function EmptyLookup({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <SearchX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function DbInspectDialog({
  view,
  onChangeView,
  onClose,
}: {
  view: DbInspectView
  onChangeView: (view: DbInspectView) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = view.kind === 'order' ? 'Order packing list' : 'Carton contents'

  return (
    <SubtleModal className="max-w-3xl p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        {view.kind === 'carton' && view.fromOrder && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={() => onChangeView({ kind: 'order', model: view.fromOrder! })}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Order
          </Button>
        )}
        <span className="text-sm font-semibold">{title}</span>
        <button
          type="button"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4">
        {view.kind === 'order' && !view.model.found && (
          <EmptyLookup title="Order not found" hint={`No row in \`order\` for ${view.model.orderNumber}`} />
        )}
        {view.kind === 'order' && view.model.found && (
          <OrderBody
            model={view.model}
            onOpenCarton={(carton) =>
              onChangeView({
                kind: 'carton',
                fromOrder: view.model,
                model: {
                  sscc: carton.sscc,
                  containerId: carton.containerId,
                  orderNumber: view.model.orderNumber,
                  lines: carton.lines,
                  found: true,
                },
              })
            }
          />
        )}
        {view.kind === 'carton' && !view.model.found && (
          <EmptyLookup title="Carton not found" hint={`No container with SSCC ${view.model.sscc}`} />
        )}
        {view.kind === 'carton' && view.model.found && <CartonBody model={view.model} />}
      </div>
    </SubtleModal>
  )
}

export function DbPackingLookupDialog({
  kind,
  onKindChange,
  value,
  onValueChange,
  lastView,
  onShowLast,
  onOpen,
  onCancel,
  busy,
}: {
  kind: 'order' | 'carton'
  onKindChange: (kind: 'order' | 'carton') => void
  value: string
  onValueChange: (v: string) => void
  lastView: DbInspectView | null
  onShowLast: () => void
  onOpen: () => void
  onCancel: () => void
  busy: boolean
}) {
  const canOpen = value.trim().length > 0 && !busy
  return (
    <SubtleModal className="max-w-md">
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold">Packing list</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Look up an order or carton without running SQL in the editor.
      </p>
      {lastView && (
        <button
          type="button"
          onClick={onShowLast}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
        >
          <Box className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{packingViewLabel(lastView)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">Show last</span>
        </button>
      )}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => onKindChange('order')}
          className={cn(
            'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            kind === 'order' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Order
        </button>
        <button
          type="button"
          onClick={() => onKindChange('carton')}
          className={cn(
            'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            kind === 'carton' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Carton
        </button>
      </div>
      <div className="space-y-2 mb-4">
        <Label htmlFor="packing-lookup-value" className="text-sm font-medium">
          {kind === 'order' ? 'Order number' : 'SSCC'}
        </Label>
        <Input
          id="packing-lookup-value"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={kind === 'order' ? 'e.g. SO-12345' : 'e.g. 006141411234567890'}
          className="font-mono text-sm"
          autoFocus
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canOpen) onOpen()
            if (e.key === 'Escape') onCancel()
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" className="gap-1" onClick={onOpen} disabled={!canOpen}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
          Open
        </Button>
      </div>
    </SubtleModal>
  )
}
