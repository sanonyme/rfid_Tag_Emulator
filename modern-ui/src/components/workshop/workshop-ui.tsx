import { memo, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RARITY_INFO, type ItemDef, type Rarity } from '@/lib/workshop-items'

/** Stepped corners so panels and slots read as pixel art. */
export const PIXEL_CLIP =
  'polygon(0 4px, 2px 4px, 2px 2px, 4px 2px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px), calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px), 2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px))'

export const GAME_DIALOG =
  '[scrollbar-color:#80634e_#2b211d] [&_*]:[scrollbar-color:#80634e_#2b211d] max-h-[85dvh] gap-0 overflow-y-auto border-[#70523f] bg-[#281f1d] p-0 text-stone-100 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.75)] sm:rounded-xl [&>button:last-child]:text-[#c8b7a7] [&>button:last-child:hover]:bg-white/10 [&>button:last-child:hover]:text-white'

type PixelArtProps = {
  rows: readonly string[]
  palette: Readonly<Record<string, string>>
  size: number
  silhouette?: boolean
  className?: string
}

/** Pixel sprite as crisp SVG, centred in a square box. Runs of one colour merge into a single rect. */
export const PixelArt = memo(function PixelArt({ rows, palette, size, silhouette = false, className }: PixelArtProps) {
  const w = rows[0]?.length ?? 1
  const h = rows.length
  const side = Math.max(w, h)
  const rects: ReactNode[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const color = palette[ch]
      if (color) {
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={silhouette ? '#574236' : color} />)
      }
      x = end
    }
  })
  return (
    <svg
      viewBox={`${(w - side) / 2} ${(h - side) / 2} ${side} ${side}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {rects}
    </svg>
  )
})

export function ItemIcon({ item, size, silhouette, className }: { item: ItemDef; size: number; silhouette?: boolean; className?: string }) {
  return <PixelArt rows={item.sprite} palette={item.palette} size={size} silhouette={silhouette} className={className} />
}

export function RarityTag({ rarity, className }: { rarity: Rarity; className?: string }) {
  const { color, label } = RARITY_INFO[rarity]
  return (
    <span
      className={cn('inline-flex items-center px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em]', className)}
      style={{ color, background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55`, clipPath: PIXEL_CLIP }}
    >
      {label}
    </span>
  )
}

type SlotProps = {
  item: ItemDef
  count?: number
  size?: number
  selected?: boolean
  equipped?: boolean
  locked?: boolean
  silhouette?: boolean
  dim?: boolean
  title?: string
  onClick?: () => void
}

export function ItemSlot({ item, count = 1, size = 52, selected, equipped, locked, silhouette, dim, title, onClick }: SlotProps) {
  const color = RARITY_INFO[item.rarity].color
  const style = {
    width: size,
    height: size,
    clipPath: PIXEL_CLIP,
    background: silhouette ? '#241b18' : `radial-gradient(circle at 50% 40%, ${color}38, #32241e 72%)`,
    boxShadow: selected
      ? `inset 0 0 0 2px #ffe3b5, inset 0 0 14px ${color}66`
      : `inset 0 0 0 2px ${color}${silhouette ? '26' : '8c'}`,
  }
  const body = (
    <>
      <ItemIcon item={item} size={Math.round(size * 0.66)} silhouette={silhouette} />
      {silhouette && (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-sm font-bold text-stone-600">
          ?
        </span>
      )}
      {count > 1 && (
        <span aria-hidden className="absolute bottom-0.5 right-1.5 text-[10px] font-bold tabular-nums text-white [text-shadow:0_1px_0_#000,0_0_3px_#000]">
          {count}
        </span>
      )}
      {equipped && (
        <span aria-hidden className="absolute left-1.5 top-0.5 text-[9px] font-black text-amber-300 [text-shadow:0_1px_0_#000]">
          E
        </span>
      )}
      {locked && <Lock className="absolute right-1 top-1 h-2.5 w-2.5 text-sky-300" />}
    </>
  )
  if (!onClick) {
    return (
      <div title={title ?? item.name} className={cn('relative grid shrink-0 place-items-center', dim && 'opacity-40')} style={style}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      title={title ?? item.name}
      aria-label={title ?? item.name}
      onClick={onClick}
      className={cn(
        'relative grid shrink-0 cursor-pointer place-items-center outline-none transition-transform duration-150 hover:-transtone-y-0.5 focus-visible:-transtone-y-0.5 active:transtone-y-0',
        dim && 'opacity-40',
      )}
      style={style}
    >
      {body}
    </button>
  )
}

export function EmptySlot({ size = 52, label }: { size?: number; label?: string }) {
  return (
    <div
      className="grid shrink-0 place-items-center text-[10px] text-stone-600"
      style={{ width: size, height: size, clipPath: PIXEL_CLIP, background: '#241b18', boxShadow: 'inset 0 0 0 2px #5c4334' }}
    >
      {label}
    </div>
  )
}

export function PixelButton({
  children,
  onClick,
  disabled,
  tone = 'plain',
  className,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'plain' | 'go' | 'warn' | 'gold'
  className?: string
  title?: string
}) {
  const tones = {
    plain: 'bg-[#49352a] text-stone-100 hover:bg-[#5e4332] shadow-[inset_0_0_0_2px_#8c684d]',
    go: 'bg-[#884752] text-white hover:bg-[#a25860] shadow-[inset_0_0_0_2px_#c68582,inset_0_-3px_0_#592c36]',
    warn: 'bg-[#3a1620] text-rose-100 hover:bg-[#4c1d2a] shadow-[inset_0_0_0_2px_#9f1239]',
    gold: 'bg-[#a16207] text-amber-50 hover:bg-[#b45309] shadow-[inset_0_0_0_2px_#f59e0b,inset_0_-3px_0_#713f12]',
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-40',
        tones[tone],
        className,
      )}
      style={{ clipPath: PIXEL_CLIP }}
    >
      {children}
    </button>
  )
}
