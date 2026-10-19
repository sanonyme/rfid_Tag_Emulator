import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkshopBag } from '../components/workshop/WorkshopBag'
import { ElfPortrait } from '../components/workshop/WorkshopCharacter'
import { drawElf, type ElfPose } from '../components/workshop/workshop-draw'
import { DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type ElfAppearance } from '../lib/workshop-appearance'
import { ITEMS, type ItemDef } from '../lib/workshop-items'
import { addToBag, equipItem, newProfile } from '../lib/workshop-profile'
import { WorkshopMotionPreview } from './workshop-motion-preview'
import '../index.css'

if (!import.meta.env.DEV) throw new Error('The wardrobe preview is development-only.')

const HATS = ITEMS.filter(item => item.kind === 'hat')
const SHIRTS = ITEMS.filter(item => item.kind === 'shirt')
const GENDERS = ['male', 'female'] as const
const selectClass = 'rounded border border-amber-200/25 bg-[#49342b] px-2 py-1.5 text-sm text-amber-50'

const CHARACTER_LOOKS: { name: string; appearance: ElfAppearance; hat?: string; shirt?: string }[] = [
  { name: 'Town-square maker', appearance: { gender: 'male', skin: 1, hairStyle: 'swept', hairColor: 0, outfit: 0, starterHat: false } },
  { name: 'Winter courier', appearance: { gender: 'female', skin: 3, hairStyle: 'braids', hairColor: 1, outfit: 1, starterHat: true }, shirt: 'signal-winter-knit' },
  { name: 'Antenna technician', appearance: { gender: 'male', skin: 5, hairStyle: 'short', hairColor: 1, outfit: 2, starterHat: false }, hat: 'antenna-crew-headset', shirt: 'antenna-technician-parka' },
  { name: 'Lab specialist', appearance: { gender: 'female', skin: 2, hairStyle: 'bob', hairColor: 4, outfit: 2, starterHat: false }, shirt: 'qa-lab-coat' },
  { name: 'Tag runner', appearance: { gender: 'male', skin: 4, hairStyle: 'bald', hairColor: 2, outfit: 3, starterHat: false }, hat: 'tag-runner-beanie', shirt: 'uhf-field-vest' },
  { name: 'Cabin keeper', appearance: { gender: 'female', skin: 0, hairStyle: 'long', hairColor: 3, outfit: 5, starterHat: false }, hat: 'epc-winter-earmuffs', shirt: 'epc-workshop-hoodie' },
]

/** A small cast, with the exact idle and walk frames used on the floor. */
function CharacterLineup() {
  return <section aria-labelledby="character-lineup-heading" className="my-7">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div><h2 id="character-lineup-heading" className="text-lg font-semibold">Meet the workshop crew</h2><p className="mt-1 text-sm text-amber-100/60">Six looks, fitted gear, and three poses at actual floor size.</p></div>
      <span className="text-xs text-amber-100/65">Portrait · idle · walk A · walk B</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CHARACTER_LOOKS.map(look => <CharacterLineupCard key={look.name} look={look} />)}
    </div>
  </section>
}

function CharacterLineupCard({ look }: { look: typeof CHARACTER_LOOKS[number] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = 300
    canvas.height = 184
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#352720'
    ctx.fillRect(0, 0, 300, 184)
    ctx.fillStyle = '#50392c'
    ctx.fillRect(10, 12, 99, 140)
    ctx.fillStyle = '#cfbda6'
    ctx.fillRect(10, 143, 280, 5)
    ctx.fillStyle = '#f7ead8'
    ctx.fillRect(10, 140, 280, 3)
    const hatItem = ITEMS.find(item => item.id === look.hat) ?? null
    const shirtItem = ITEMS.find(item => item.id === look.shirt) ?? null
    const frames: { px: number; x: number; pose: ElfPose; label: string }[] = [
      { px: 7, x: 59, pose: 'idle', label: 'Portrait' },
      { px: 3, x: 152, pose: 'idle', label: 'Idle' },
      { px: 3, x: 204, pose: 'stepA', label: 'Walk A' },
      { px: 3, x: 256, pose: 'stepB', label: 'Walk B' },
    ]
    for (const { px, x, pose, label } of frames) {
      ctx.save()
      drawElf(ctx, {
        px, x, groundY: 140, lift: 0, dir: 1, outfit: look.appearance.outfit,
        appearance: look.appearance, pose, bigHat: false, hatItem, shirtItem,
        label: null, trim: null, self: true, bell: 0,
      }, 2.4, true)
      ctx.restore()
      ctx.fillStyle = '#d5bfa8'
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, x, 168)
    }
  }, [look])
  return <figure className="overflow-hidden rounded-lg border border-amber-200/15 bg-[#30241f]">
    <canvas ref={ref} width={300} height={184} className="mx-auto block h-[184px] w-[300px] max-w-full [image-rendering:pixelated]" role="img" aria-label={`${look.name}: ${look.appearance.gender} character with ${look.appearance.hairStyle} hair, portrait and idle, walk A and walk B floor poses`} />
    <figcaption className="border-t border-amber-200/10 px-3 py-2.5"><span className="text-sm font-medium text-[#f0d497]">{look.name}</span><span className="ml-2 text-xs capitalize text-amber-100/55">{look.appearance.gender} · {look.appearance.hairStyle}</span></figcaption>
  </figure>
}

/** Every view calls the production renderer once: no loop or profile mutation. */
function FitSample({ appearance, hat = null, shirt = null, dir, pose }: {
  appearance: ElfAppearance
  hat?: ItemDef | null
  shirt?: ItemDef | null
  dir: 1 | -1
  pose: ElfPose
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    canvas.width = 216
    canvas.height = 146
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#3b2c25'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#cfbda6'
    ctx.fillRect(7, 122, 202, 3)
    ctx.fillStyle = '#f7ead8'
    ctx.fillRect(7, 120, 202, 2)
    for (const { px, x } of [{ px: 6, x: 53 }, { px: 3, x: 142 }, { px: 1, x: 195 }]) {
      ctx.save()
      drawElf(ctx, {
        px, x, groundY: 120, lift: 0, dir, outfit: appearance.outfit, appearance,
        pose, bigHat: false, hatItem: hat, shirtItem: shirt, label: null,
        trim: null, self: true, bell: 0,
      }, 2.4, true)
      ctx.restore()
    }
    ctx.fillStyle = '#d5bfa8'
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Portrait · 6px', 53, 140)
    ctx.fillText('Panel · 3px', 142, 140)
    ctx.fillText('Mini · 1px', 195, 140)
  }, [appearance, hat, shirt, dir, pose])
  return <figure className="overflow-hidden rounded-lg border border-amber-200/15 bg-[#30241f]">
    <canvas ref={ref} width={216} height={146} className="block h-[146px] w-[216px] [image-rendering:pixelated]" role="img"
      aria-label={`${appearance.gender}, ${appearance.hairStyle} hair, ${hat?.name ?? (appearance.starterHat ? 'starter cap' : 'no headwear')}, ${shirt?.name ?? 'starter coat'} at portrait, panel and miniature scales`} />
    <figcaption className="px-2 py-2 text-xs capitalize text-amber-50/80">{appearance.gender} · {appearance.hairStyle}</figcaption>
  </figure>
}

function CharacterFitGallery() {
  const galleryRef = useRef<HTMLElement>(null)
  const [eyeCheck, setEyeCheck] = useState('')
  const [gender, setGender] = useState<'both' | ElfAppearance['gender']>('both')
  const [hairStyle, setHairStyle] = useState<'all' | ElfAppearance['hairStyle']>('all')
  const [skin, setSkin] = useState(1)
  const [hairColor, setHairColor] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [pose, setPose] = useState<ElfPose>('idle')
  const genders = gender === 'both' ? GENDERS : [gender]
  const styles = hairStyle === 'all' ? HAIR_STYLES : [hairStyle]
  const appearances = genders.flatMap(g => styles.map(style => ({ ...DEFAULT_APPEARANCE, gender: g, hairStyle: style, skin, hairColor, starterHat: false })))
  const row = (id: string, title: string, hat: ItemDef | null, shirt: ItemDef | null, starterHat = false) => <section key={id} className="my-8" aria-labelledby={`fit-${id}`}>
    <h3 id={`fit-${id}`} className="mb-3 text-base font-semibold text-[#f0d497]">{title}</h3>
    <div className="grid justify-start gap-3 [grid-template-columns:repeat(auto-fill,216px)]">
      {appearances.map(appearance => <FitSample key={`${appearance.gender}-${appearance.hairStyle}`} appearance={{ ...appearance, starterHat }} hat={hat} shirt={shirt} dir={dir} pose={pose} />)}
    </div>
  </section>
  const checkEyes = () => {
    const failures: string[] = []
    const canvases = galleryRef.current?.querySelectorAll('figure canvas') ?? []
    for (const element of canvases) {
      const canvas = element as HTMLCanvasElement
      const ctx = canvas.getContext('2d')!
      for (const { px, x } of [{ px: 6, x: 53 }, { px: 3, x: 142 }, { px: 1, x: 195 }]) {
        const data = ctx.getImageData(x - 5 * px, 120 - 14 * px, 10 * px, 6 * px).data
        let pupils = 0, whites = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === 17 && data[i + 1] === 28 && data[i + 2] === 40) pupils++
          if (data[i] === 255 && data[i + 1] === 250 && data[i + 2] === 241) whites++
        }
        if (!pupils || !whites) failures.push(`${canvas.getAttribute('aria-label')} · scale ${px}`)
      }
    }
    setEyeCheck(failures.length ? `FAIL · ${failures.length} missing eye details: ${failures.slice(0, 3).join('; ')}` : `PASS · ${canvases.length} outfits × 3 actual canvas scales: the side-profile eye keeps its white and pupil.`)
  }
  return <section ref={galleryRef} aria-labelledby="character-fit-heading" className="mt-8 border-t border-amber-200/20 pt-6">
    <h2 id="character-fit-heading" className="text-xl font-bold">Character &amp; wearable fit contact sheet</h2>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-amber-100/65">Actual drawElf frames, not enlarged icon artwork. Compare the face and hairline at portrait scale with the untouched native panel and miniature sizes. Each headwear and shirt is shown on every selected haircut and body style.</p>
    <div className="sticky top-0 z-10 mt-5 flex flex-wrap gap-3 rounded-lg border border-amber-200/15 bg-[#241c19]/95 p-3">
      <label className="flex flex-col gap-1 text-xs">Body style<select className={selectClass} value={gender} onChange={e => setGender(e.target.value as typeof gender)}><option value="both">Both styles</option><option value="male">Male</option><option value="female">Female</option></select></label>
      <label className="flex flex-col gap-1 text-xs">Haircut<select className={selectClass} value={hairStyle} onChange={e => setHairStyle(e.target.value as typeof hairStyle)}><option value="all">All six haircuts</option>{HAIR_STYLES.map(style => <option key={style} value={style}>{style}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Skin tone<select className={selectClass} value={skin} onChange={e => setSkin(Number(e.target.value))}>{SKIN_TONES.map((tone, i) => <option key={tone.name} value={i}>{tone.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Hair color<select className={selectClass} value={hairColor} onChange={e => setHairColor(Number(e.target.value))}>{HAIR_COLORS.map((tone, i) => <option key={tone.name} value={i}>{tone.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Facing<select className={selectClass} value={dir} onChange={e => setDir(Number(e.target.value) as 1 | -1)}><option value={1}>Right</option><option value={-1}>Left</option></select></label>
      <label className="flex flex-col gap-1 text-xs">Pose<select className={selectClass} value={pose} onChange={e => setPose(e.target.value as ElfPose)}><option value="idle">Idle</option><option value="stepA">Walk A</option><option value="stepB">Walk B</option></select></label>
      <p className="self-end pb-2 text-xs text-amber-100/55">{appearances.length * (HATS.length + SHIRTS.length + 2)} combinations · three native renders each · no animation loop</p>
      <button type="button" className="self-end rounded border border-amber-200/40 px-3 py-1.5 text-xs" onClick={checkEyes}>Check visible eyes</button>
      {eyeCheck && <p role="status" className="w-full text-xs text-amber-100">{eyeCheck}</p>}
    </div>
    {row('uncovered', 'Face & hair · no headwear', null, null)}
    {row('starter-cap', 'Starter stocking cap · hair tucked under brim', null, null, true)}
    <h2 className="mt-10 border-t border-amber-200/20 pt-6 text-lg font-bold">All headwear · {HATS.length} items</h2>
    {HATS.map(hat => row(hat.id, hat.name, hat, null))}
    <h2 className="mt-10 border-t border-amber-200/20 pt-6 text-lg font-bold">All shirts · {SHIRTS.length} items</h2>
    {SHIRTS.map(shirt => row(shirt.id, shirt.name, null, shirt))}
  </section>
}

/** Entirely in memory: never adds demo loot to the player's real guest/account save. */
function WardrobePreview() {
  const [profile] = useState(() => {
    const next = newProfile()
    next.appearance = { ...next.appearance, gender: 'female', hairStyle: 'braids', hairColor: 4, starterHat: false }
    for (const item of ITEMS) addToBag(next, item.id, 'present', { force: true })
    addToBag(next, 'handwritten-letter', 'letter', { note: 'Meet me at the town square. I brought cocoa!' })
    equipItem(next, 'shirt', 'uhf-field-vest')
    return next
  })
  const [open, setOpen] = useState(() => !new URLSearchParams(location.search).has('fits'))
  const [inspectFits, setInspectFits] = useState(() => new URLSearchParams(location.search).has('fits'))
  const [tab, setTab] = useState<'bag' | 'character'>('bag')
  const [, refresh] = useState(0)
  const [notice, setNotice] = useState('Demo inventory · nothing is saved or sent.')
  const update = () => refresh(n => n + 1)
  return <main className="h-dvh overflow-y-auto bg-[#241c19] p-8 text-[#f2e5d4]">
    <h1 className="text-xl font-bold">Zeus Workshop · wardrobe review</h1>
    <p className="my-3 max-w-xl text-sm text-amber-100/60">Actual bag, fitting room, and pixel renderer. All catalogue items are available here for testing only. Your real inventory and accounts are untouched.</p>
    <ElfPortrait appearance={profile.appearance} equipped={profile.equipped} />
    <div className="flex flex-wrap gap-3"><button className="rounded border border-amber-300/40 px-4 py-2" onClick={() => { setTab('bag'); setOpen(true) }}>Open bag</button><button className="rounded border border-amber-300/40 px-4 py-2" onClick={() => { setTab('character'); setOpen(true) }}>Customize elf</button><button className="rounded border border-amber-200/40 px-4 py-2" onClick={() => { setOpen(false); setInspectFits(value => !value) }}>{inspectFits ? 'Hide character & gear fits' : 'Inspect character & gear fits'}</button><a className="px-4 py-2 underline" href="/scripts/workshop-art-preview.html">World art preview</a></div>
    <p role="status" className="my-3 text-xs text-amber-100/70">{notice}</p>
    <WorkshopMotionPreview active={!open} />
    <CharacterLineup />
    {inspectFits && <CharacterFitGallery />}
    <WorkshopBag open={open} onOpenChange={setOpen} initialTab={tab} profile={profile} locked={new Set()}
      onAppearance={appearance => { profile.appearance = { ...appearance }; update() }}
      onEquip={(slot, id) => { equipItem(profile, slot, id); update() }}
      onTitle={id => { profile.title = id; update() }}
      onConsume={() => setNotice('Demo only: no item consumed.')}
      onDrop={() => setNotice('Demo only: no item dropped.')}
      onWriteLetter={() => { setNotice('Demo only: no letter sent.'); return false }} />
  </main>
}

createRoot(document.getElementById('root')!).render(<WardrobePreview />)
