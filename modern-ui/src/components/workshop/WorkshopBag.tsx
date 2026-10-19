import { useEffect, useId, useState } from 'react'
import { Backpack, Box, Check, Coffee, Flame, Gift, Heart, Lock, Mail, Search, Shirt, Sparkles, Tag, Trophy, User, Wind, X, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { type ElfAppearance } from '@/lib/workshop-appearance'
import { ITEMS, ITEM_BY_ID, RARITIES, RARITY_INFO, isConsumable, isWearable, rarityIndex, type Rarity, type WearableKind } from '@/lib/workshop-items'
import {
  ACHIEVEMENTS,
  BAG_CAPACITY,
  bagStacks,
  deviceLabel,
  type BagEntry,
  type BagStack,
  type ItemOrigin,
  type WorkshopProfile,
} from '@/lib/workshop-profile'
import { WORKSHOP_LETTER_MAX } from '@/lib/workshop-protocol'
import { ElfPortrait, WorkshopCharacterPanel } from './WorkshopCharacter'
import { GAME_DIALOG, ItemIcon, ItemSlot, PIXEL_CLIP, PixelButton, RarityTag } from './workshop-ui'

function stackKey(stack: BagStack): string {
  return stack.entries[0]?.note ? stack.entries[0]!.uid : stack.item.id
}

type Tab = 'bag' | 'character' | 'collection' | 'achievements'
type Category = 'all' | 'clothing' | 'companions' | 'effects' | 'supplies' | 'decor' | 'collectibles' | 'letters'
type Sort = 'recent' | 'rarity' | 'name'

const CATEGORIES: { id: Category; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'Everything', icon: Backpack },
  { id: 'clothing', label: 'Clothing', icon: Shirt },
  { id: 'companions', label: 'Companions', icon: Heart },
  { id: 'effects', label: 'Effects & titles', icon: Wind },
  { id: 'supplies', label: 'Supplies', icon: Coffee },
  { id: 'decor', label: 'Decor', icon: Box },
  { id: 'collectibles', label: 'Collectibles', icon: Tag },
  { id: 'letters', label: 'Letters', icon: Mail },
]

const KIND_LABEL = {
  collectible: 'Collectible',
  hat: 'Headwear',
  pet: 'Companion · follows you',
  trail: 'Footstep effect',
  shirt: 'Clothing · coat',
  wings: 'Wings · double jump',
  mount: 'Mount · ride',
  title: 'Wearable title',
  consumable: 'Supply · use once',
} as const

function categoryFor(stack: BagStack): Exclude<Category, 'all'> {
  if (stack.entries[0]?.note || stack.item.id === 'handwritten-letter') return 'letters'
  if (stack.item.placeable) return 'decor'
  switch (stack.item.kind) {
    case 'hat': case 'shirt': case 'wings': return 'clothing'
    case 'pet': case 'mount': return 'companions'
    case 'trail': case 'title': return 'effects'
    case 'consumable': return 'supplies'
    default: return 'collectibles'
  }
}

const ORIGIN_TEXT: Record<ItemOrigin, string> = {
  present: 'from a present',
  daily: 'from a daily gift',
  milestone: 'from a tree milestone',
  jingle: 'from a jingle gift',
  trade: 'by trade',
  floor: 'picked up on the floor',
  admin: 'granted by an administrator',
  mission: 'from an RFID mission',
  letter: 'written by you',
}

function originText(entry: BagEntry): string {
  const base = ORIGIN_TEXT[entry.from]
  return entry.by && (entry.from === 'trade' || entry.from === 'floor') ? `${base} with ${entry.by}` : base
}

function formatDate(ms: number): string {
  if (!ms) return 'a while ago'
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const newestAt = (stack: BagStack) => Math.max(0, ...stack.entries.map((entry) => entry.at))
const isEquipped = (stack: BagStack, profile: WorkshopProfile) => isWearable(stack.item) && profile.equipped[stack.item.kind] === stack.item.id

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mutable profile owned by the game; the parent re-renders this whenever it changes. */
  profile: WorkshopProfile
  locked: ReadonlySet<string>
  initialTab?: Tab
  onAppearance: (appearance: ElfAppearance) => void
  onEquip: (slot: WearableKind, itemId: string | null) => void
  onConsume: (uid: string) => void
  onDrop: (uid: string) => void
  onTitle: (achievementId: string | null) => void
  onWriteLetter: (handle: string, text: string) => Promise<boolean> | boolean
}

export function WorkshopBag({ open, onOpenChange, profile, locked, initialTab = 'bag', onAppearance, onEquip, onConsume, onDrop, onTitle, onWriteLetter }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [equippedOnly, setEquippedOnly] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [compose, setCompose] = useState(false)
  const [draft, setDraft] = useState('')
  const [mailTo, setMailTo] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const id = useId()
  const stacks = bagStacks(profile)
  const discovered = new Set(profile.discovered)
  const unlocked = new Set(profile.achievements)
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<Category, number>
  for (const stack of stacks) {
    counts.all += stack.entries.length
    counts[categoryFor(stack)] += stack.entries.length
  }
  const search = query.trim().toLocaleLowerCase()
  const visible = stacks.filter((stack) => {
    const { item, entries } = stack
    return (category === 'all' || categoryFor(stack) === category)
      && (rarity === 'all' || item.rarity === rarity)
      && (!equippedOnly || isEquipped(stack, profile))
      && (!search || `${item.name} ${item.description} ${KIND_LABEL[item.kind]} ${entries[0]?.note ?? ''}`.toLocaleLowerCase().includes(search))
  }).sort((a, b) => {
    if (sort === 'recent') return newestAt(b) - newestAt(a) || a.item.name.localeCompare(b.item.name)
    if (sort === 'rarity') return rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) || a.item.name.localeCompare(b.item.name)
    return a.item.name.localeCompare(b.item.name)
  })
  // Details must always describe an item in the visible results, including after a trade/drop.
  const current = visible.find((stack) => stackKey(stack) === selected) ?? visible[0] ?? null
  const filtered = !!search || rarity !== 'all' || equippedOnly
  const resetFilters = () => { setQuery(''); setRarity('all'); setEquippedOnly(false); setCategory('all') }

  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])

  const tabs: { id: Tab; label: string; icon: LucideIcon; badge?: string }[] = [
    { id: 'bag', label: 'Bag', icon: Backpack, badge: `${profile.bag.length}` },
    { id: 'character', label: 'My elf', icon: User },
    { id: 'collection', label: 'Collection', icon: Sparkles, badge: `${discovered.size}/${ITEMS.length}` },
    { id: 'achievements', label: 'Achievements', icon: Trophy, badge: `${unlocked.size}/${ACHIEVEMENTS.length}` },
  ]

  async function sendLetter() {
    if (sending || !draft.trim() || !mailTo.trim()) return
    setSending(true)
    setSendError('')
    try {
      const ok = await onWriteLetter(mailTo, draft)
      if (ok) { setCompose(false); setDraft(''); setMailTo('') }
      else setSendError('Your letter could not be delivered. Check the handle and try again.')
    } catch {
      setSendError('Delivery failed. Your draft is still here; try again when connected.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(GAME_DIALOG, 'w-[calc(100vw-24px)] max-w-[980px] border-[#715548] bg-[#281f1d]')}>
        <div className="relative overflow-hidden border-b border-[#6b4d42] bg-[radial-gradient(ellipse_at_top_left,#62413a_0%,#432c2a_45%,#302324_100%)] px-4 pt-4 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute right-12 top-0 h-px w-40 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
          <div className="flex items-start justify-between gap-4 pr-7">
            <div>
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200/70">Zeus Workshop · your little corner</div>
              <DialogTitle className="flex items-center gap-2 text-xl font-black tracking-tight text-[#fff6df]">
                <Backpack className="h-5 w-5 text-amber-200" />
                Bag & wardrobe
              </DialogTitle>
              <DialogDescription className="mt-1.5 max-w-md text-xs leading-5 text-stone-300">
                Dress your elf, sort your finds, and share a little workshop magic.
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 pt-1 text-right text-[10px] leading-5 text-[#c8b7a7] sm:block">
              <div>Device <span className="font-mono font-semibold text-stone-200">{deviceLabel(profile)}</span></div>
              {profile.daily.streak > 0 && (
                <div className="flex items-center justify-end gap-1 text-amber-200">
                  <Flame className="h-3 w-3" />{profile.daily.streak}-day streak
                </div>
              )}
              <div className="text-amber-200/70">Signed-in finds sync across devices</div>
            </div>
          </div>
          <div
            className="-mx-1 mt-4 flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Bag and wardrobe sections"
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const index = tabs.findIndex((t) => t.id === tab)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
              setTab(tabs[next].id)
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`${id}-${t.id}-tab`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`${id}-${t.id}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200',
                  tab === t.id ? 'bg-[#281f1d] text-amber-100 shadow-[inset_0_2px_0_#e3b980]' : 'text-stone-300 hover:bg-white/5 hover:text-white',
                )}
              >
                <t.icon className="h-3.5 w-3.5" />{t.label}
                {t.badge && <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold tabular-nums', tab === t.id ? 'bg-amber-200/10 text-amber-200' : 'bg-black/15 text-[#c8b7a7]')}>{t.badge}</span>}
              </button>
            ))}
          </div>
        </div>

        {tab === 'bag' && (
          <div id={`${id}-bag-panel`} role="tabpanel" aria-labelledby={`${id}-bag-tab`} className="grid min-h-[460px] md:h-[min(580px,calc(85dvh-160px))] md:min-h-0 md:grid-cols-[156px_minmax(0,1fr)_258px] md:overflow-hidden">
            <aside className="min-w-0 border-b border-[#584238] bg-[#302420] md:overflow-y-auto md:border-b-0 md:border-r">
              <div className="hidden border-b border-[#584238] p-3 md:block">
                <div className="relative mb-2 grid place-items-center overflow-hidden rounded-lg border border-amber-200/15 bg-[radial-gradient(ellipse_at_50%_10%,#654839,#382824_65%)] py-2">
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-6 border-t border-sky-100/20 bg-sky-100/10" />
                  <ElfPortrait appearance={profile.appearance} equipped={profile.equipped} size={104} className="relative" />
                </div>
                <button type="button" onClick={() => setTab('character')} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-2 text-[11px] font-bold text-amber-100 outline-none hover:bg-amber-300/20 focus-visible:ring-2 focus-visible:ring-amber-200">
                  <Shirt className="h-3.5 w-3.5" />Customize your elf
                </button>
                <div className="mt-2 space-y-1 text-[10px] leading-4 text-[#c8b7a7]">
                  <div><span className="text-[#bda896]">Hat </span>{ITEM_BY_ID.get(profile.equipped.hat ?? '')?.name ?? (profile.appearance.starterHat ? 'Workshop cap' : 'No hat')}</div>
                  <div><span className="text-[#bda896]">Coat </span>{ITEM_BY_ID.get(profile.equipped.shirt ?? '')?.name ?? 'Starter outfit'}</div>
                </div>
              </div>
              <div className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-x-visible md:p-2.5" aria-label="Inventory categories">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={cn('flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-200', category === c.id ? 'bg-[#624135] text-amber-100 shadow-[inset_2px_0_0_#efbd83]' : 'text-[#c8b7a7] hover:bg-white/5 hover:text-stone-100')}>
                    <c.icon className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">{c.label}</span><span className={cn('min-w-4 text-right text-[10px] tabular-nums', category === c.id ? 'text-amber-200' : 'text-[#bda896]')}>{counts[c.id]}</span>
                  </button>
                ))}
              </div>
              <div className="hidden border-t border-[#584238] p-3 md:block">
                <div className="mb-1.5 flex justify-between text-[10px] text-[#c8b7a7]"><span>Bag space</span><span className="tabular-nums">{profile.bag.length}/{BAG_CAPACITY}</span></div>
                <div role="progressbar" aria-label="Bag capacity" aria-valuenow={profile.bag.length} aria-valuemin={0} aria-valuemax={BAG_CAPACITY} className="h-1.5 overflow-hidden rounded-full bg-black/20"><div className={cn('h-full rounded-full', profile.bag.length >= BAG_CAPACITY ? 'bg-amber-300' : 'bg-amber-300/70')} style={{ width: `${Math.min(100, (profile.bag.length / BAG_CAPACITY) * 100)}%` }} /></div>
              </div>
            </aside>

            <div className="min-w-0 p-4 md:flex md:min-h-0 md:flex-col md:overflow-y-auto">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#f5ebd6]">{CATEGORIES.find((c) => c.id === category)!.label}</h2>
                  <p aria-live="polite" className="mt-0.5 text-[10px] text-[#bda896]">{visible.length} {visible.length === 1 ? 'find' : 'finds'} · {visible.reduce((sum, s) => sum + s.entries.length, 0)} items</p>
                </div>
                <button type="button" onClick={() => { setCompose((value) => !value); setSendError('') }} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-amber-200/20 bg-amber-200/5 px-2.5 py-2 text-[10px] font-bold text-amber-100 outline-none hover:bg-amber-200/10 focus-visible:ring-2 focus-visible:ring-amber-200"><Mail className="h-3.5 w-3.5" />Write a letter</button>
              </div>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#bda896]" />
                <input aria-label="Search bag" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find clothing, tags, letters…" className="h-9 w-full rounded-md border border-[#6a5043] bg-[#201917] pl-8 pr-8 text-xs text-stone-100 outline-none placeholder:text-[#bda896] focus:border-amber-300/70" />
                {query && <button type="button" aria-label="Clear bag search" onClick={() => setQuery('')} className="absolute right-1.5 top-1.5 cursor-pointer rounded p-1 text-[#c8b7a7] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-amber-200"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="mb-4 mt-2 flex flex-wrap items-center gap-1.5">
                <select aria-label="Filter by rarity" value={rarity} onChange={(event) => setRarity(event.target.value as Rarity | 'all')} className="h-7 max-w-[45%] rounded border border-[#6a5043] bg-[#372922] px-1.5 text-[10px] text-stone-300 outline-none focus:border-amber-300">
                  <option value="all">All rarities</option>{RARITIES.map((r) => <option key={r} value={r}>{RARITY_INFO[r].label}</option>)}
                </select>
                <select aria-label="Sort bag" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-7 rounded border border-[#6a5043] bg-[#372922] px-1.5 text-[10px] text-stone-300 outline-none focus:border-amber-300"><option value="recent">Recent first</option><option value="rarity">Rarity first</option><option value="name">Name A–Z</option></select>
                <button type="button" aria-pressed={equippedOnly} onClick={() => setEquippedOnly((value) => !value)} className={cn('flex h-7 cursor-pointer items-center gap-1 rounded border px-2 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-amber-200', equippedOnly ? 'border-amber-300/50 bg-amber-200/10 text-amber-100' : 'border-[#6a5043] text-[#c8b7a7] hover:text-white')}><Check className="h-3 w-3" />Equipped</button>
              </div>

              {compose && (
                <div className="mb-4 space-y-2 rounded-lg border border-amber-200/25 bg-[#3b2b25] p-3">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-bold text-amber-100">A little note from the workshop</h3><Mail className="h-3.5 w-3.5 text-amber-200/60" /></div>
                  <label className="block text-[10px] font-semibold text-stone-300" htmlFor={`${id}-letter-to`}>Deliver to</label>
                  <input id={`${id}-letter-to`} aria-label="Recipient handle" value={mailTo} maxLength={41} disabled={sending} placeholder="@their_handle" onChange={(event) => setMailTo(event.target.value)} className="h-8 w-full rounded-md border border-[#795e4b] bg-[#271e1b] px-2.5 font-mono text-xs text-stone-100 outline-none focus:border-amber-300 disabled:opacity-60" />
                  <label className="block text-[10px] font-semibold text-stone-300" htmlFor={`${id}-letter-compose`}>Your letter</label>
                  <textarea id={`${id}-letter-compose`} aria-label="Letter text" rows={3} maxLength={WORKSHOP_LETTER_MAX} value={draft} disabled={sending} onChange={(event) => setDraft(event.target.value)} placeholder="This arrives in their Home mailbox." className="w-full resize-y rounded-md border border-[#795e4b] bg-[#271e1b] px-2.5 py-2 text-xs text-stone-100 outline-none focus:border-amber-300 disabled:opacity-60" />
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] tabular-nums text-[#bda896]">{draft.length}/{WORKSHOP_LETTER_MAX}</span><div className="flex gap-2"><PixelButton disabled={sending} onClick={() => { setCompose(false); setDraft(''); setMailTo(''); setSendError('') }}>Cancel</PixelButton><PixelButton tone="go" disabled={sending || !draft.trim() || !mailTo.trim()} onClick={() => { void sendLetter() }}>{sending ? 'Sending…' : 'Send to mailbox'}</PixelButton></div></div>
                  {sendError && <p role="alert" className="text-[11px] leading-4 text-amber-200">{sendError}</p>}
                </div>
              )}

              <div className="max-h-[390px] overflow-y-auto pb-1 pr-1 md:min-h-0 md:max-h-none md:flex-1">
                {visible.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2" aria-label="Bag items">
                    {visible.map((stack) => {
                      const { item, entries } = stack
                      const key = stackKey(stack)
                      const color = RARITY_INFO[item.rarity].color
                      const wearing = isEquipped(stack, profile)
                      const reserved = entries.every((entry) => locked.has(entry.uid))
                      const note = entries[0]?.note
                      const active = current !== null && stackKey(current) === key
                      return (
                        <button key={key} type="button" aria-label={`${note ? `Letter: ${note.slice(0, 60)}` : item.name}, ${RARITY_INFO[item.rarity].label}, ${entries.length} owned${wearing ? ', equipped' : ''}${reserved ? ', reserved in trade' : ''}`} aria-pressed={active} onClick={() => setSelected(key)} title={note ?? item.description} className={cn('group relative flex min-w-0 cursor-pointer flex-col items-center rounded-lg border p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-200', active ? 'border-amber-200/70 bg-[#573a30] shadow-[inset_0_0_0_1px_#edc69024]' : 'border-[#664a3c] bg-[#392a24] hover:border-[#ad8564] hover:bg-[#493229]')}>
                          <div className="mb-1.5 grid h-14 w-full place-items-center" style={{ background: `radial-gradient(ellipse,${color}18,transparent 70%)` }}><ItemIcon item={item} size={48} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.25)] transition-transform group-hover:-transtone-y-0.5" /></div>
                          {wearing && <span aria-hidden className="absolute left-1.5 top-1.5 rounded bg-amber-200/15 p-0.5 text-amber-200"><Check className="h-3 w-3" /></span>}
                          {reserved && <Lock aria-hidden className="absolute right-1.5 top-1.5 h-3 w-3 text-sky-200" />}
                          <span className="line-clamp-2 min-h-8 w-full text-[11px] font-semibold leading-4 text-stone-100">{note ? 'Handwritten letter' : item.name}</span>
                          <span className="mt-1 flex w-full items-center justify-between gap-1 text-[9px]"><span className="truncate" style={{ color }}>{RARITY_INFO[item.rarity].label}</span><span className="font-mono text-[#c8b7a7]">×{entries.length}</span></span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-52 place-items-center px-4 py-8 text-center">
                    <div><Backpack className="mx-auto mb-3 h-8 w-8 text-amber-200/30" /><h3 className="text-sm font-semibold text-stone-200">{stacks.length === 0 ? 'Your next find is out there' : 'No finds in this pocket'}</h3><p className="mx-auto mt-2 max-w-60 text-xs leading-5 text-[#c8b7a7]">{stacks.length === 0 ? 'Send RFID tags to drop presents, then walk over them. Clothes, companions, and little treasures await.' : 'Try another category, rarity, or search to find something you own.'}</p><div className="mt-4">{stacks.length === 0 ? <PixelButton tone="go" onClick={() => setTab('character')}>Customize your elf</PixelButton> : <PixelButton onClick={resetFilters}>Show everything</PixelButton>}</div></div>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#584238] pt-2 text-[10px] text-[#bda896]"><span>{profile.bag.length}/{BAG_CAPACITY} slots used</span>{(filtered || category !== 'all') && <button type="button" onClick={resetFilters} className="cursor-pointer text-amber-200/80 outline-none hover:underline focus-visible:underline">Clear filters</button>}<span className="hidden sm:inline">Select a find to inspect</span></div>
            </div>

            <aside aria-label="Selected item" className="min-w-0 border-t border-[#584238] bg-[linear-gradient(160deg,#433029,#30231f)] p-4 md:overflow-y-auto md:border-l md:border-t-0">
              {current ? <ItemDetails key={stackKey(current)} stack={current} profile={profile} locked={locked} onEquip={onEquip} onConsume={onConsume} onDrop={onDrop} /> : <div className="grid h-full min-h-36 place-items-center text-center"><div><Sparkles className="mx-auto mb-2 h-6 w-6 text-amber-200/25" /><p className="text-xs text-[#c8b7a7]">A closer look at your next find.</p><p className="mt-1 text-[10px] text-[#bda896]">Select an item to see its story and actions.</p></div></div>}
            </aside>
          </div>
        )}

        {tab === 'character' && <div id={`${id}-character-panel`} role="tabpanel" aria-labelledby={`${id}-character-tab`}><WorkshopCharacterPanel profile={profile} onAppearance={onAppearance} onEquip={onEquip} locked={locked} /></div>}

        {tab === 'collection' && (
          <div id={`${id}-collection-panel`} role="tabpanel" aria-labelledby={`${id}-collection-tab`} className="max-h-[570px] space-y-5 overflow-y-auto p-5 sm:p-6">
            <div><h2 className="text-sm font-bold text-[#f5ebd6]">The workshop field guide</h2><p className="mt-1 text-xs leading-5 text-[#c8b7a7]">Every discovery stays in your collection, even after a gift or trade. Send more RFID tags for a chance at rarer finds.</p></div>
            {[...RARITIES].reverse().map((rarity) => {
              const items = ITEMS.filter((item) => item.rarity === rarity)
              const found = items.filter((item) => discovered.has(item.id)).length
              const { color, label } = RARITY_INFO[rarity]
              return (
                <section key={rarity} className="rounded-lg border border-[#584238] bg-[#342720] p-3.5">
                  <div className="mb-3 flex items-center gap-3"><span className="w-20 text-[11px] font-black uppercase tracking-wider" style={{ color }}>{label}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${items.length ? (found / items.length) * 100 : 0}%`, background: color }} /></div><span className="w-10 text-right text-[11px] tabular-nums text-[#c8b7a7]">{found}/{items.length}</span></div>
                  <div className="flex flex-wrap gap-2">{items.map((item) => <ItemSlot key={item.id} item={item} size={46} silhouette={!discovered.has(item.id)} title={discovered.has(item.id) ? `${item.name}: ${item.description}` : 'Not discovered yet'} />)}</div>
                </section>
              )
            })}
          </div>
        )}

        {tab === 'achievements' && (
          <div id={`${id}-achievements-panel`} role="tabpanel" aria-labelledby={`${id}-achievements-tab`} className="max-h-[570px] overflow-y-auto p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-[#f5ebd6]">A story worth wearing</h2><p className="mt-1 text-xs leading-5 text-[#c8b7a7]">Earn titles through workshop life. Your chosen title appears above your elf.</p></div><PixelButton onClick={() => onTitle(null)} disabled={profile.title === null}>No title</PixelButton></div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ACHIEVEMENTS.map((achievement) => {
                const done = unlocked.has(achievement.id)
                const [have, need] = achievement.progress(profile)
                const isTitle = profile.title === achievement.id
                return (
                  <div key={achievement.id} className={cn('flex gap-3 rounded-lg border p-3.5', isTitle ? 'border-amber-200/50 bg-[#50382c]' : done ? 'border-[#795744] bg-[#3b2b25]' : 'border-[#594339] bg-[#342720]')}>
                    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', done ? 'bg-amber-200/10 text-amber-200' : 'bg-white/5 text-stone-600')}><Trophy className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1"><div className={cn('text-xs font-bold', done ? 'text-white' : 'text-[#c8b7a7]')}>{achievement.name}</div><div className="mt-0.5 text-[11px] leading-4 text-[#bda896]">{achievement.description}</div>
                      {done ? <button type="button" onClick={() => onTitle(isTitle ? null : achievement.id)} className={cn('mt-2 cursor-pointer text-left text-[11px] font-bold outline-none hover:underline focus-visible:underline', isTitle ? 'text-amber-200' : 'text-amber-200')}>{isTitle ? `Wearing title "${achievement.title}"` : `Use title "${achievement.title}"`}</button> : <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-stone-600" style={{ width: `${Math.min(100, (have / need) * 100)}%` }} /></div><span className="text-[10px] tabular-nums text-[#bda896]">{Math.min(have, need)}/{need}</span></div>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#584238] pt-4 text-[11px] text-[#bda896]"><span>Presents opened {profile.stats.opened}</span><span>Tag sends {profile.stats.sends}</span><span>RFID tags transmitted {profile.stats.tags}</span><span>Fixed runs {profile.stats.fixed}</span><span>Given {profile.stats.given}</span><span>Received {profile.stats.received}</span><span>Trades {profile.stats.trades}</span><span>Snowball hits {profile.stats.hits}</span></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ItemDetails({ stack, profile, locked, onEquip, onConsume, onDrop }: {
  stack: BagStack
  profile: WorkshopProfile
  locked: ReadonlySet<string>
  onEquip: Props['onEquip']
  onConsume: Props['onConsume']
  onDrop: Props['onDrop']
}) {
  const { item, entries } = stack
  const color = RARITY_INFO[item.rarity].color
  const free = entries.filter((entry) => !locked.has(entry.uid))
  const newest = [...entries].sort((a, b) => b.at - a.at)[0]
  const oldest = [...entries].sort((a, b) => a.at - b.at)[0]
  const wearing = isWearable(item) && profile.equipped[item.kind] === item.id
  const note = newest?.note
  const reserved = entries.length - free.length
  const tryOn = item.kind === 'hat' || item.kind === 'shirt' || item.kind === 'wings'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-3 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.15em] text-[#bda896]"><span>A closer look</span>{wearing && <span className="flex items-center gap-1 text-amber-200"><Check className="h-3 w-3" />Equipped</span>}</div>
      <div className="relative mx-auto grid h-32 w-32 place-items-center" style={{ clipPath: PIXEL_CLIP, background: `radial-gradient(ellipse at 50% 35%,${color}30,#342720 75%)`, boxShadow: `inset 0 0 0 1px ${color}55` }}>{tryOn ? <ElfPortrait appearance={profile.appearance} equipped={{ ...profile.equipped, [item.kind]: item.id }} size={128} /> : <ItemIcon item={item} size={88} className="drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]" />}</div>
      {tryOn && <p className="mt-1 text-center text-[9px] text-amber-200/70">Try-on preview · {wearing ? 'currently wearing' : 'not equipped yet'}</p>}
      <div className="mt-3 text-center"><h3 className="text-base font-black leading-6 text-[#fff6df]">{note ? 'Handwritten letter' : item.name}</h3><div className="mt-1.5 flex justify-center"><RarityTag rarity={item.rarity} /></div><p className="mt-2 text-[10px] text-[#c8b7a7]">{note ? 'Written note · giftable' : item.placeable ? 'Decor · placeable' : KIND_LABEL[item.kind]}</p></div>
      {note ? <p className="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border border-amber-200/20 bg-amber-200/5 px-3 py-2.5 text-left text-xs leading-5 text-amber-50">{note}</p> : <p className="mt-3 text-center text-xs leading-5 text-stone-300">{item.description}</p>}
      <div className="mt-4 space-y-1 border-t border-[#61483b] pt-3 text-[10px] leading-4 text-[#bda896]"><div className="flex justify-between gap-2"><span>Owned</span><span className="font-mono text-stone-300">×{entries.length}</span></div><div className="flex justify-between gap-2"><span>First found</span><span>{formatDate(oldest?.at ?? 0)}</span></div>{newest && <div>Latest {originText(newest)}</div>}{reserved > 0 && <div className="flex items-center gap-1.5 pt-1 text-sky-200"><Lock className="h-3 w-3" />{reserved} {reserved === 1 ? 'copy' : 'copies'} reserved in trade</div>}</div>
      </div>
      <div className="shrink-0 space-y-2 border-t border-[#61483b] pt-3">
        {isWearable(item) && <PixelButton tone={wearing ? 'plain' : 'go'} className="w-full" disabled={!wearing && free.length === 0} title={!wearing && free.length === 0 ? 'All copies are offered in a trade' : undefined} onClick={() => onEquip(item.kind, wearing ? null : item.id)}><Shirt className="h-3.5 w-3.5" />{wearing ? 'Take off' : item.kind === 'pet' ? 'Bring along' : item.kind === 'mount' ? 'Ride' : item.kind === 'title' ? 'Use title' : 'Wear'}</PixelButton>}
        {isConsumable(item) && <PixelButton tone="go" className="w-full" disabled={free.length === 0} title={free.length === 0 ? 'All copies are offered in a trade' : `${item.consume.verb} one copy. It's gone after.`} onClick={() => { const entry = free[free.length - 1]; if (entry) onConsume(entry.uid) }}><Coffee className="h-3.5 w-3.5" />{item.consume.verb} one</PixelButton>}
        <PixelButton className="w-full" disabled={free.length === 0} title={free.length === 0 ? 'All copies are offered in a trade' : note ? 'Drop the letter so someone can pick it up' : item.placeable ? 'Plant it on the floor. Click the banner to take it back.' : 'Anyone on the floor can pick it up; walk back over it to take it back'} onClick={() => { const entry = free[free.length - 1]; if (entry) onDrop(entry.uid) }}><Gift className="h-3.5 w-3.5" />{note ? 'Gift on the floor' : item.placeable ? 'Place in the world' : 'Drop one on the floor'}</PixelButton>
        <p className="pt-1 text-center text-[9px] leading-4 text-[#bda896]">{note ? 'Letters can be gifted to another elf.' : item.placeable ? 'Decor makes a little home on the floor.' : 'Share your finds by dropping them on the floor.'}</p>
      </div>
    </div>
  )
}
