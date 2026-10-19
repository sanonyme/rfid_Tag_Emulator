import { useEffect, useId, useRef, useState } from 'react'
import { Check, RotateCcw, Scissors, Shirt, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BASE_OUTFITS,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  parseElfAppearance,
  type ElfAppearance,
  type HairStyle,
} from '@/lib/workshop-appearance'
import { ITEM_BY_ID, type WearableKind } from '@/lib/workshop-items'
import type { WorkshopProfile } from '@/lib/workshop-profile'
import { drawElf } from './workshop-draw'
import { ItemIcon, PixelButton } from './workshop-ui'

const HAIR_NAMES: Record<HairStyle, string> = {
  short: 'Short crop', swept: 'Side sweep', bob: 'Bob', long: 'Long hair', braids: 'Braids', bald: 'No hair',
}

type PortraitProps = {
  appearance: ElfAppearance
  equipped?: Partial<Record<WearableKind, string | null>>
  size?: number
  className?: string
}

/** A single still frame of the floor renderer; no animation loop while a bag is open. */
export function ElfPortrait({ appearance, equipped, size = 160, className }: PortraitProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hatId = equipped?.hat
  const shirtId = equipped?.shirt
  const wingsId = equipped?.wings
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    const side = Math.max(32, Math.round(size))
    canvas.width = side
    canvas.height = side
    ctx.imageSmoothingEnabled = false
    const groundY = Math.round(side * 0.84)
    ctx.fillStyle = '#cdb9a0'
    ctx.fillRect(Math.round(side * 0.15), groundY + 1, Math.round(side * 0.7), 3)
    ctx.fillStyle = '#f4e9d4'
    ctx.fillRect(Math.round(side * 0.2), groundY - 1, Math.round(side * 0.6), 2)
    drawElf(ctx, {
      px: Math.max(1, Math.floor(side / 24)), x: Math.round(side / 2), groundY,
      lift: 0, dir: 1, outfit: appearance.outfit, appearance, pose: 'idle', bigHat: false,
      hatItem: hatId ? ITEM_BY_ID.get(hatId) ?? null : null,
      shirtItem: shirtId ? ITEM_BY_ID.get(shirtId) ?? null : null,
      wingsItem: wingsId ? ITEM_BY_ID.get(wingsId) ?? null : null,
      label: null, trim: null, self: true, bell: 0,
    }, 2.4, true)
  }, [appearance, hatId, shirtId, wingsId, size])

  const hair = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0]
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      role="img"
      aria-label={`${appearance.gender === 'female' ? 'Female' : 'Male'} workshop elf, ${HAIR_NAMES[appearance.hairStyle].toLowerCase()}, ${hair.name.toLowerCase()} hair`}
      className={cn('block shrink-0 [image-rendering:pixelated]', className)}
      style={{ width: size, height: size }}
    />
  )
}

type CharacterProps = {
  profile: WorkshopProfile
  onAppearance: (appearance: ElfAppearance) => void
  onEquip: (slot: WearableKind, itemId: string | null) => void
  /** Bag entry UIDs reserved by an open trade. */
  locked: ReadonlySet<string>
}

const choice = 'cursor-pointer rounded-md border px-2 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-200'
const chosen = 'border-amber-400/70 bg-amber-400/15 text-amber-100'
const unchosen = 'border-white/10 bg-[#382923] text-stone-300 hover:border-amber-300/40 hover:bg-[#4b352c]'
const legend = 'mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d1bca5]'

export function WorkshopCharacterPanel({ profile, onAppearance, onEquip, locked }: CharacterProps) {
  const [draft, setDraft] = useState(() => parseElfAppearance(profile.appearance))
  const [savedMessage, setSavedMessage] = useState('')
  const capId = useId()
  useEffect(() => {
    setDraft(parseElfAppearance(profile.appearance))
  }, [profile.appearance])
  const saved = parseElfAppearance(profile.appearance)
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  const edit = <K extends keyof ElfAppearance>(key: K, value: ElfAppearance[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setSavedMessage('')
  }
  const hat = profile.equipped.hat ? ITEM_BY_ID.get(profile.equipped.hat) : undefined
  const shirt = profile.equipped.shirt ? ITEM_BY_ID.get(profile.equipped.shirt) : undefined
  const isReserved = (itemId: string) => {
    const entries = profile.bag.filter((entry) => entry.item === itemId)
    return entries.length > 0 && entries.every((entry) => locked.has(entry.uid))
  }

  return (
    <div className="grid gap-5 bg-[#281f1c] p-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-5">
      <aside className="flex flex-col items-center gap-3 self-start rounded-xl border border-[#725442] bg-[radial-gradient(ellipse_at_50%_20%,#694a36_0%,#392821_68%)] p-4 sm:sticky sm:top-4">
        <div className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-[#cdb58a]">
          <span>Fitting room</span><Scissors className="h-3.5 w-3.5" aria-hidden />
        </div>
        <ElfPortrait appearance={draft} equipped={profile.equipped} size={168} className="-my-2" />
        <div className="text-center">
          <h3 className="text-sm font-bold text-[#f3e5cb]">Your workshop elf</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[#c8b3a0]">A little personality for every inventory run.</p>
        </div>
        <div className="w-full border-t border-[#725442] pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#d6c5a5]"><Shirt className="h-3.5 w-3.5" aria-hidden /> Wearing now</p>
          {([['hat', hat], ['shirt', shirt]] as const).map(([slot, item]) => (
            <div key={slot} className="mb-2 flex min-h-9 items-center gap-2 rounded-md bg-black/15 px-2 py-1.5">
              {item ? <ItemIcon item={item} size={28} /> : <span className="grid h-7 w-7 shrink-0 place-items-center text-xs text-[#ad9581]">—</span>}
              <span className="min-w-0 flex-1 text-[10px] leading-4 text-[#e0cbb7]">{item?.name ?? (slot === 'hat' ? (draft.starterHat ? 'Starter cap' : 'Hair showing') : `${BASE_OUTFITS[draft.outfit].name} workwear`)}</span>
              {item && <button type="button" disabled={isReserved(item.id)} onClick={() => onEquip(slot, null)} aria-label={`Take off ${item.name}`} className="cursor-pointer rounded px-1 py-1 text-[10px] text-amber-200 underline underline-offset-2 outline-none hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-40">Off</button>}
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-[#bfa58e]">Find RFID workwear in presents. Equip it from the Clothing category in your bag.</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#f3e5cb]"><Sparkles className="h-4 w-4 text-amber-300" aria-hidden /> Make yourself at home</h3>
          <p className="mt-1 text-xs leading-5 text-[#c7ae98]">Choose your look. Every haircut and outfit works with either elf.</p>
        </div>
        <fieldset>
          <legend className={legend}>Elf</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['male', 'female'] as const).map((gender) => <button key={gender} type="button" aria-pressed={draft.gender === gender} onClick={() => edit('gender', gender)} className={cn(choice, draft.gender === gender ? chosen : unchosen)}>{gender === 'male' ? 'Male' : 'Female'}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className={legend}>Skin tone <span className="ml-1 font-normal normal-case tracking-normal text-[#e5d3b0]">{SKIN_TONES[draft.skin].name}</span></legend>
          <div className="flex flex-wrap gap-2">
            {SKIN_TONES.map((skin, i) => <button key={skin.name} type="button" title={skin.name} aria-label={`Skin: ${skin.name}`} aria-pressed={draft.skin === i} onClick={() => edit('skin', i)} className={cn('grid h-8 w-8 cursor-pointer place-items-center rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#281f1c]', draft.skin === i ? 'border-[#f1d5a3]' : 'border-white/10 hover:border-white/50')} style={{ background: skin.base, boxShadow: `inset 0 -7px 0 ${skin.shadow}` }}>{draft.skin === i && <Check className="h-4 w-4 text-white [filter:drop-shadow(0_1px_1px_#251c19)]" aria-hidden />}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className={legend}>Haircut</legend>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {HAIR_STYLES.map((style) => <button key={style} type="button" aria-label={`Haircut: ${HAIR_NAMES[style]}`} aria-pressed={draft.hairStyle === style} onClick={() => edit('hairStyle', style)} className={cn(choice, 'flex flex-col items-center px-1 py-1', draft.hairStyle === style ? chosen : unchosen)}><ElfPortrait appearance={{ ...draft, starterHat: false, hairStyle: style }} size={50} /><span className="text-[10px] leading-4">{HAIR_NAMES[style]}</span></button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className={legend}>Hair color <span className="ml-1 font-normal normal-case tracking-normal text-[#e5d3b0]">{HAIR_COLORS[draft.hairColor].name}</span></legend>
          <div className="flex flex-wrap gap-2">
            {HAIR_COLORS.map((hair, i) => <button key={hair.name} type="button" title={hair.name} aria-label={`Hair color: ${hair.name}`} aria-pressed={draft.hairColor === i} onClick={() => edit('hairColor', i)} className={cn('grid h-8 w-8 cursor-pointer place-items-center rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#281f1c]', draft.hairColor === i ? 'border-[#f1d5a3]' : 'border-white/10 hover:border-white/50')} style={{ background: hair.color, boxShadow: `inset 0 -7px 0 ${hair.shadow}, inset 0 3px 0 ${hair.highlight}` }}>{draft.hairColor === i && <Check className="h-4 w-4 text-white [filter:drop-shadow(0_1px_1px_#251c19)]" aria-hidden />}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className={legend}>Starter workwear</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {BASE_OUTFITS.map((outfit, i) => <button key={outfit.name} type="button" aria-pressed={draft.outfit === i} onClick={() => edit('outfit', i)} className={cn(choice, 'flex items-center gap-2 text-left', draft.outfit === i ? chosen : unchosen)}><span aria-hidden className="block h-5 w-4 shrink-0 rounded-sm border-t-[6px] border-[#eddcbd]" style={{ background: outfit.coat, borderTopColor: outfit.hat }} /><span className="truncate text-[11px]">{outfit.name}</span></button>)}
          </div>
          {shirt && <p className="mt-2 text-[10px] text-[#c7ae98]">Take off your equipped top to reveal your starter workwear.</p>}
        </fieldset>
        <div className="rounded-lg border border-[#725442] bg-[#3a2922] px-3 py-2.5">
          <label htmlFor={capId} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#f0ddc7]"><input id={capId} type="checkbox" checked={draft.starterHat} onChange={(event) => edit('starterHat', event.target.checked)} className="h-3.5 w-3.5 accent-amber-500" /> Wear a starter cap</label>
          <p className="mt-1 pl-[22px] text-[10px] leading-4 text-[#c7ae98]">{hat ? 'Your equipped hat takes priority. Take it off to show your hair or starter cap.' : 'Switch it off to show your full hairstyle on the floor.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#725442] pt-3">
          <PixelButton tone="go" disabled={!changed} onClick={() => { onAppearance({ ...draft }); setSavedMessage('Look saved. See you on the floor!') }}><Check className="h-3.5 w-3.5" aria-hidden /> Save look</PixelButton>
          <PixelButton disabled={!changed} onClick={() => { setDraft(saved); setSavedMessage('') }}><RotateCcw className="h-3 w-3" aria-hidden /> Reset changes</PixelButton>
          <span role="status" aria-live="polite" className="text-[10px] text-[#e0c4a8]">{savedMessage || (changed ? 'Preview · unsaved changes' : 'Your current look')}</span>
        </div>
      </div>
    </div>
  )
}
