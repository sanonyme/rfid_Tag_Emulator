import type { ReactNode } from 'react'
import { ArrowLeftRight, Check, Hourglass, PartyPopper } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ITEM_BY_ID, RARITY_INFO, type ItemDef } from '@/lib/workshop-items'
import { bagStacks, type WorkshopProfile } from '@/lib/workshop-profile'
import { WORKSHOP_TRADE_MAX_ITEMS } from '@/lib/workshop-protocol'
import { sameItems, type TradeCloseReason, type TradeSession } from '@/lib/workshop-trade'
import { EmptySlot, GAME_DIALOG, ItemIcon, ItemSlot, PIXEL_CLIP, PixelButton } from './workshop-ui'

type Props = {
  open: boolean
  session: TradeSession | null
  profile: WorkshopProfile
  onOffer: (uids: string[]) => void
  onLockIn: () => void
  onClose: () => void
}

const CLOSED_TEXT: Record<TradeCloseReason, (partner: string) => string> = {
  declined: (p) => `${p} declined the trade.`,
  cancelled: (p) => `The trade with ${p} was cancelled.`,
  timeout: () => 'The trade timed out.',
  left: (p) => `${p} left the workshop floor.`,
  busy: (p) => `${p} is busy with another trade.`,
  invalid: () => "That trade included an item this version of Zeus doesn't know.",
}

function defs(ids: readonly string[]): ItemDef[] {
  return ids.flatMap((id) => {
    const def = ITEM_BY_ID.get(id)
    return def ? [def] : []
  })
}

export function WorkshopTrade({ open, session, profile, onOffer, onLockIn, onClose }: Props) {
  return (
    <Dialog open={open && session !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn(GAME_DIALOG, 'max-w-[640px]')}>
        {session && <TradeBody session={session} profile={profile} onOffer={onOffer} onLockIn={onLockIn} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function TradeBody({ session, profile, onOffer, onLockIn, onClose }: Omit<Props, 'open' | 'session'> & { session: TradeSession }) {
  const partner = session.partnerName

  if (session.phase === 'done') {
    const got = defs(session.theirs)
    const gave = defs(session.mineItems)
    return (
      <div className="relative overflow-hidden px-6 pb-6 pt-7 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(34,197,94,0.25),transparent)]" />
        <PartyPopper className="mx-auto h-8 w-8 text-amber-300" />
        <DialogTitle className="mt-2 text-lg font-black text-white">Trade complete!</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-slate-400">You and {partner} swapped items.</DialogDescription>
        <div className="mt-5 grid grid-cols-2 gap-4 text-left">
          <ItemList title="You got" items={got} empty="Nothing (a true gift!)" />
          <ItemList title="You gave" items={gave} empty="Nothing" />
        </div>
        <PixelButton tone="go" className="mt-6 px-6" onClick={onClose}>
          Nice!
        </PixelButton>
      </div>
    )
  }

  if (session.phase !== 'open') {
    const text = session.phase === 'closed' && session.reason ? CLOSED_TEXT[session.reason](partner) : `Waiting for ${partner}…`
    return (
      <div className="px-6 pb-6 pt-7 text-center">
        <ArrowLeftRight className="mx-auto h-7 w-7 text-slate-500" />
        <DialogTitle className="mt-2 text-base font-black text-white">Trade with {partner}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-slate-400">{text}</DialogDescription>
        <PixelButton className="mt-5 px-6" onClick={onClose}>
          Close
        </PixelButton>
      </div>
    )
  }

  const offered = new Set(session.mine)
  const mineEntries = session.mine.flatMap((uid) => {
    const entry = profile.bag.find((e) => e.uid === uid)
    const def = entry && ITEM_BY_ID.get(entry.item)
    return entry && def ? [{ uid, def }] : []
  })
  const theirs = defs(session.theirs)
  const theyLocked =
    session.theirReady !== null &&
    sameItems(session.theirReady.give, session.theirs) &&
    sameItems(session.theirReady.get, session.mineItems)
  const full = session.mine.length >= WORKSHOP_TRADE_MAX_ITEMS
  const stacks = bagStacks(profile)
    .map((s) => ({ ...s, free: s.entries.filter((e) => !offered.has(e.uid)) }))
    .filter((s) => s.free.length > 0)
  const nothing = session.mine.length === 0 && session.theirs.length === 0

  const add = (uid: string) => {
    if (!session.myReady && !full) onOffer([...session.mine, uid])
  }
  const remove = (uid: string) => {
    if (!session.myReady) onOffer(session.mine.filter((u) => u !== uid))
  }

  return (
    <div>
      <div className="border-b-2 border-[#1c2840] bg-[radial-gradient(120%_140%_at_0%_0%,#1e2b4d_0%,#0b1220_60%)] px-5 py-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base font-black text-white">
          <ArrowLeftRight className="h-4 w-4 text-sky-300" />
          Trading with {partner}
        </DialogTitle>
        <DialogDescription className="mt-0.5 text-xs text-slate-400">
          Offer up to {WORKSHOP_TRADE_MAX_ITEMS} items. The swap happens once you're both locked in; changing an offer unlocks the other side.
        </DialogDescription>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 px-5 pt-4">
        <OfferPanel title="You give" locked={session.myReady}>
          {Array.from({ length: WORKSHOP_TRADE_MAX_ITEMS }, (_, i) => {
            const slot = mineEntries[i]
            return slot ? (
              <ItemSlot
                key={slot.uid}
                item={slot.def}
                size={50}
                title={session.myReady ? slot.def.name : `${slot.def.name} (click to take back)`}
                onClick={session.myReady ? undefined : () => remove(slot.uid)}
              />
            ) : (
              <EmptySlot key={`empty-${i}`} size={50} />
            )
          })}
        </OfferPanel>
        <div className="grid place-items-center text-slate-600">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <OfferPanel title={`${partner} gives`} locked={theyLocked}>
          {Array.from({ length: WORKSHOP_TRADE_MAX_ITEMS }, (_, i) => {
            const def = theirs[i]
            return def ? (
              <ItemSlot key={`${def.id}-${i}`} item={def} size={50} title={`${def.name} · ${RARITY_INFO[def.rarity].label}`} />
            ) : (
              <EmptySlot key={`empty-${i}`} size={50} />
            )
          })}
        </OfferPanel>
      </div>

      <div className="px-5 pb-1 pt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Your bag</span>
          <span className="font-normal normal-case tracking-normal">
            {session.myReady ? 'Locked in: your offer is final' : full ? 'Offer is full' : 'Click an item to offer one'}
          </span>
        </div>
        <div className="flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto pb-1">
          {stacks.length === 0 ? (
            <div className="py-4 text-xs text-slate-500">Nothing left to offer. You can still accept a gift!</div>
          ) : (
            stacks.map((s) => (
              <ItemSlot
                key={s.item.id}
                item={s.item}
                count={s.free.length}
                size={44}
                dim={session.myReady || full}
                onClick={session.myReady || full ? undefined : () => add(s.free[s.free.length - 1].uid)}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t-2 border-[#1c2840] bg-[#0d1527] px-5 py-3">
        <PixelButton tone="warn" onClick={onClose}>
          Cancel trade
        </PixelButton>
        <PixelButton tone={session.myReady ? 'plain' : 'gold'} disabled={session.myReady || nothing} onClick={onLockIn} className="min-w-[150px]">
          {session.myReady ? (
            <>
              <Hourglass className="h-3.5 w-3.5 animate-pulse" />
              Waiting for {partner}…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Lock in
            </>
          )}
        </PixelButton>
      </div>
    </div>
  )
}

function OfferPanel({ title, locked, children }: { title: string; locked: boolean; children: ReactNode }) {
  return (
    <div
      className={cn('p-3 transition-colors', locked ? 'bg-[#10261b]' : 'bg-[#0f1729]')}
      style={{ clipPath: PIXEL_CLIP, boxShadow: `inset 0 0 0 2px ${locked ? '#22c55e' : '#1c2840'}` }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold text-slate-200">{title}</span>
        <span className={cn('flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase', locked ? 'text-emerald-400' : 'text-slate-500')}>
          {locked ? (
            <>
              <Check className="h-3 w-3" /> Locked in
            </>
          ) : (
            'Choosing…'
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">{children}</div>
    </div>
  )
}

function ItemList({ title, items, empty }: { title: string; items: ItemDef[]; empty: string }) {
  return (
    <div className="bg-[#0f1729] p-3" style={{ clipPath: PIXEL_CLIP, boxShadow: 'inset 0 0 0 2px #1c2840' }}>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-500">{empty}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={`${item.id}-${i}`} className="flex items-center gap-2">
              <ItemIcon item={item} size={26} />
              <span className="text-xs font-bold" style={{ color: RARITY_INFO[item.rarity].color }}>
                {item.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
