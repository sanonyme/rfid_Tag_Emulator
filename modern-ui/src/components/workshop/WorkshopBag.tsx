import { useState } from 'react'
import { Backpack, Flame, Gift, Shirt, Sparkles, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ITEMS, RARITIES, RARITY_INFO, isWearable, type WearableKind } from '@/lib/workshop-items'
import {
  ACHIEVEMENTS,
  BAG_CAPACITY,
  bagStacks,
  deviceLabel,
  type BagEntry,
  type ItemOrigin,
  type WorkshopProfile,
} from '@/lib/workshop-profile'
import { GAME_DIALOG, ItemIcon, ItemSlot, PIXEL_CLIP, PixelButton, RarityTag } from './workshop-ui'

type Tab = 'bag' | 'collection' | 'achievements'

const KIND_LABEL = { collectible: 'Collectible', hat: 'Hat · wearable', pet: 'Pet · follows you', trail: 'Trail · wearable' } as const

const ORIGIN_TEXT: Record<ItemOrigin, string> = {
  present: 'from a present',
  daily: 'from a daily gift',
  milestone: 'from a tree milestone',
  jingle: 'from a jingle gift',
  trade: 'by trade',
  floor: 'picked up on the floor',
}

function originText(entry: BagEntry): string {
  const base = ORIGIN_TEXT[entry.from]
  return entry.by && (entry.from === 'trade' || entry.from === 'floor') ? `${base} with ${entry.by}` : base
}

function formatDate(ms: number): string {
  if (!ms) return 'a while ago'
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mutable profile owned by the game; the parent re-renders this whenever it changes. */
  profile: WorkshopProfile
  locked: ReadonlySet<string>
  onEquip: (slot: WearableKind, itemId: string | null) => void
  onDrop: (uid: string) => void
  onTitle: (achievementId: string | null) => void
}

export function WorkshopBag({ open, onOpenChange, profile, locked, onEquip, onDrop, onTitle }: Props) {
  const [tab, setTab] = useState<Tab>('bag')
  const [selected, setSelected] = useState<string | null>(null)
  const stacks = bagStacks(profile)
  const current = stacks.find((s) => s.item.id === selected) ?? stacks[0] ?? null
  const discovered = new Set(profile.discovered)
  const unlocked = new Set(profile.achievements)

  const tabs: { id: Tab; label: string; icon: typeof Backpack; badge: string }[] = [
    { id: 'bag', label: 'Bag', icon: Backpack, badge: `${profile.bag.length}` },
    { id: 'collection', label: 'Collection', icon: Sparkles, badge: `${discovered.size}/${ITEMS.length}` },
    { id: 'achievements', label: 'Achievements', icon: Trophy, badge: `${unlocked.size}/${ACHIEVEMENTS.length}` },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(GAME_DIALOG, 'max-w-[800px]')}>
        <div className="relative border-b-2 border-[#1c2840] bg-[radial-gradient(120%_140%_at_0%_0%,#1d3b2e_0%,#0b1220_55%)] px-5 pb-0 pt-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-black tracking-wide text-white">
                <Gift className="h-4 w-4 text-rose-400" />
                Workshop Bag
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-400">
                Everything this Zeus install has collected. Items stay on this device until you trade or drop them.
              </DialogDescription>
            </div>
            <div className="shrink-0 text-right text-[11px] leading-5 text-slate-400">
              <div>
                Device <span className="font-mono font-bold text-slate-200">{deviceLabel(profile)}</span>
              </div>
              {profile.daily.streak > 0 && (
                <div className="flex items-center justify-end gap-1 text-amber-300">
                  <Flame className="h-3 w-3" />
                  {profile.daily.streak}-day streak
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 px-3 pb-2 pt-1.5 text-xs font-bold outline-none transition-colors focus-visible:text-white',
                  tab === t.id ? 'bg-[#0b1220] text-white shadow-[inset_0_2px_0_#22c55e]' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                <span className="rounded bg-white/5 px-1 text-[10px] font-semibold tabular-nums text-slate-400">{t.badge}</span>
              </button>
            ))}
          </div>
        </div>

        {tab === 'bag' && (
          <div className="grid min-h-[360px] grid-cols-[1fr_250px]">
            <div className="max-h-[420px] overflow-y-auto p-4">
              {stacks.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-400">
                  <div>
                    <Backpack className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                    Your bag is empty. Send tags to drop presents on the floor, then walk over them to open them.
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stacks.map((s) => (
                    <ItemSlot
                      key={s.item.id}
                      item={s.item}
                      count={s.entries.length}
                      selected={current?.item.id === s.item.id}
                      equipped={isWearable(s.item) && profile.equipped[s.item.kind] === s.item.id}
                      locked={s.entries.every((e) => locked.has(e.uid))}
                      onClick={() => setSelected(s.item.id)}
                    />
                  ))}
                </div>
              )}
              <div className="mt-4 text-[11px] text-slate-500">
                {profile.bag.length}/{BAG_CAPACITY} slots used
              </div>
            </div>
            <aside className="border-l-2 border-[#1c2840] bg-[#0d1527] p-4">
              {current ? (
                <ItemDetails
                  key={current.item.id}
                  stack={current}
                  profile={profile}
                  locked={locked}
                  onEquip={onEquip}
                  onDrop={onDrop}
                />
              ) : (
                <div className="text-xs text-slate-500">Select an item to see it here.</div>
              )}
            </aside>
          </div>
        )}

        {tab === 'collection' && (
          <div className="max-h-[440px] space-y-4 overflow-y-auto p-5">
            {[...RARITIES].reverse().map((rarity) => {
              const items = ITEMS.filter((i) => i.rarity === rarity)
              const found = items.filter((i) => discovered.has(i.id)).length
              const { color, label } = RARITY_INFO[rarity]
              return (
                <section key={rarity}>
                  <div className="mb-2 flex items-center gap-3">
                    <span className="w-20 text-xs font-black uppercase tracking-wider" style={{ color }}>
                      {label}
                    </span>
                    <div className="h-2 flex-1 bg-[#131d33]" style={{ clipPath: PIXEL_CLIP }}>
                      <div className="h-full transition-[width] duration-500" style={{ width: `${(found / items.length) * 100}%`, background: color }} />
                    </div>
                    <span className="w-10 text-right text-[11px] tabular-nums text-slate-400">
                      {found}/{items.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => {
                      const known = discovered.has(item.id)
                      return (
                        <ItemSlot
                          key={item.id}
                          item={item}
                          size={46}
                          silhouette={!known}
                          title={known ? `${item.name}: ${item.description}` : 'Not discovered yet'}
                        />
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {tab === 'achievements' && (
          <div className="max-h-[440px] overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
              <span>Unlock achievements to earn titles. Your title shows to everyone on the floor.</span>
              <PixelButton onClick={() => onTitle(null)} disabled={profile.title === null}>
                No title
              </PixelButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ACHIEVEMENTS.map((a) => {
                const done = unlocked.has(a.id)
                const [have, need] = a.progress(profile)
                const isTitle = profile.title === a.id
                return (
                  <div
                    key={a.id}
                    className={cn('flex gap-3 p-3', done ? 'bg-[#16213a]' : 'bg-[#0f1729]')}
                    style={{ clipPath: PIXEL_CLIP, boxShadow: `inset 0 0 0 2px ${isTitle ? '#fbbf24' : done ? '#2c3c62' : '#18233b'}` }}
                  >
                    <div
                      className={cn('grid h-9 w-9 shrink-0 place-items-center', done ? 'text-amber-300' : 'text-slate-600')}
                      style={{ clipPath: PIXEL_CLIP, background: done ? '#3b2a0b' : '#131c30' }}
                    >
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-xs font-bold', done ? 'text-white' : 'text-slate-400')}>{a.name}</div>
                      <div className="text-[11px] leading-4 text-slate-500">{a.description}</div>
                      {done ? (
                        <button
                          type="button"
                          onClick={() => onTitle(isTitle ? null : a.id)}
                          className={cn(
                            'mt-1.5 cursor-pointer text-[11px] font-bold outline-none hover:underline focus-visible:underline',
                            isTitle ? 'text-amber-300' : 'text-sky-300',
                          )}
                        >
                          {isTitle ? `Wearing title "${a.title}"` : `Use title "${a.title}"`}
                        </button>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-[#18233b]">
                            <div className="h-full bg-slate-500" style={{ width: `${Math.min(100, (have / need) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] tabular-nums text-slate-500">
                            {Math.min(have, need)}/{need}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-[#1c2840] pt-3 text-[11px] text-slate-500">
              <span>Presents opened {profile.stats.opened}</span>
              <span>Tag sends {profile.stats.sends}</span>
              <span>Given {profile.stats.given}</span>
              <span>Received {profile.stats.received}</span>
              <span>Trades {profile.stats.trades}</span>
              <span>Snowball hits {profile.stats.hits}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ItemDetails({
  stack,
  profile,
  locked,
  onEquip,
  onDrop,
}: {
  stack: ReturnType<typeof bagStacks>[number]
  profile: WorkshopProfile
  locked: ReadonlySet<string>
  onEquip: Props['onEquip']
  onDrop: Props['onDrop']
}) {
  const { item, entries } = stack
  const color = RARITY_INFO[item.rarity].color
  const free = entries.filter((e) => !locked.has(e.uid))
  const newest = [...entries].sort((a, b) => b.at - a.at)[0]
  const oldest = [...entries].sort((a, b) => a.at - b.at)[0]
  const wearing = isWearable(item) && profile.equipped[item.kind] === item.id

  return (
    <div className="flex h-full flex-col">
      <div
        className="mx-auto grid h-28 w-28 place-items-center"
        style={{ clipPath: PIXEL_CLIP, background: `radial-gradient(circle at 50% 45%, ${color}55, #0b1220 70%)`, boxShadow: `inset 0 0 0 2px ${color}88` }}
      >
        <ItemIcon item={item} size={76} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.45)]" />
      </div>
      <div className="mt-3 text-center">
        <div className="text-sm font-black text-white">{item.name}</div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <RarityTag rarity={item.rarity} />
          <span className="text-[10px] text-slate-400">{KIND_LABEL[item.kind]}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-slate-300">{item.description}</p>
      <div className="mt-3 space-y-0.5 text-center text-[11px] text-slate-500">
        <div>
          Owned ×{entries.length} · first found {formatDate(oldest?.at ?? 0)}
        </div>
        {newest && <div>Latest {originText(newest)}</div>}
      </div>
      <div className="mt-auto space-y-2 pt-4">
        {isWearable(item) && (
          <PixelButton
            tone={wearing ? 'plain' : 'go'}
            className="w-full"
            onClick={() => onEquip(item.kind, wearing ? null : item.id)}
          >
            <Shirt className="h-3.5 w-3.5" />
            {wearing ? 'Take off' : item.kind === 'pet' ? 'Bring along' : 'Wear'}
          </PixelButton>
        )}
        <PixelButton
          className="w-full"
          disabled={free.length === 0}
          title={free.length === 0 ? 'Offered in a trade' : 'Anyone on the floor can pick it up; walk back over it to take it back'}
          onClick={() => {
            const last = free[free.length - 1]
            if (last) onDrop(last.uid)
          }}
        >
          <Gift className="h-3.5 w-3.5" />
          Drop one on the floor
        </PixelButton>
      </div>
    </div>
  )
}
