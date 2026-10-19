import { useEffect, useRef, useState } from 'react'
import { drawElf } from '../components/workshop/workshop-draw'
import { CHARACTER_STRIDE_PX, CHARACTER_WALK } from '../components/workshop/workshop-character-art'
import { DEFAULT_APPEARANCE, HAIR_STYLES, type ElfAppearance } from '../lib/workshop-appearance'
import { ITEMS } from '../lib/workshop-items'

const WING_LOOKS = [
  { id: null, name: 'Natural stride', caption: 'No wings' },
  { id: 'leaf-wings', name: 'Sprout Wings', caption: 'Leaf & fern' },
  { id: 'angel-wings', name: 'Cloud Wings', caption: 'Layered feathers' },
  { id: 'dragon-wings', name: 'Ember Wings', caption: 'Warm dragonfire' },
  { id: 'prism-wings', name: 'Prism Wings', caption: 'Cut crystal' },
].map(look => ({ ...look, item: ITEMS.find(item => item.id === look.id) ?? null }))

const WIDTH = 1080
const HEIGHT = 366
const WALK_SPEED = 125
// Use the floor's full-stride distance so playback and moving ground stay in sync.
const STRIDE_SECONDS = CHARACTER_STRIDE_PX / WALK_SPEED
const selectClass = 'rounded border border-amber-200/25 bg-[#49342b] px-2 py-1.5 text-sm text-amber-50'

/** Dev-only, in-memory motion review. One loop, suspended behind the bag or in a hidden tab. */
export function WorkshopMotionPreview({ active = true }: { active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const cycleRef = useRef<HTMLOutputElement>(null)
  const timeRef = useRef(0)
  const paintRef = useRef<(() => void) | null>(null)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mode, setMode] = useState<'walk' | 'idle' | 'flight'>('walk')
  const [speed, setSpeed] = useState(1)
  const [dir, setDir] = useState<1 | -1>(1)
  const [scale, setScale] = useState(6)
  const [gender, setGender] = useState<ElfAppearance['gender']>('female')
  const [hairStyle, setHairStyle] = useState<ElfAppearance['hairStyle']>('swept')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    canvas.width = WIDTH
    canvas.height = HEIGHT
    ctx.imageSmoothingEnabled = false
    const appearance: ElfAppearance = { ...DEFAULT_APPEARANCE, gender, hairStyle, hairColor: 0, outfit: 1, starterHat: false }
    const paint = () => {
      const t = timeRef.current
      const phase = (t / STRIDE_SECONDS) % 1
      ctx.fillStyle = '#30241f'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      const glow = ctx.createLinearGradient(0, 20, 0, 194)
      glow.addColorStop(0, '#3e2c25')
      glow.addColorStop(1, '#594235')
      ctx.fillStyle = glow
      ctx.fillRect(12, 12, WIDTH - 24, 180)
      ctx.fillStyle = '#d6c3aa'
      ctx.fillRect(12, 190, WIDTH - 24, 6)
      ctx.fillStyle = '#f6ead6'
      ctx.fillRect(12, 187, WIDTH - 24, 3)
      // Stationary characters over a moving ruler expose skating and foot-speed errors.
      // Four marks per stride also make the ground loop seamless when scrubbing.
      const markSpacing = CHARACTER_STRIDE_PX / 4 * scale / 3
      const groundOffset = mode === 'walk' ? t * WALK_SPEED * scale / 3 * dir % markSpacing : 0
      ctx.save()
      ctx.beginPath()
      ctx.rect(12, 187, WIDTH - 24, 9)
      ctx.clip()
      ctx.fillStyle = '#846850'
      for (let mark = -1; mark <= Math.ceil(WIDTH / markSpacing) + 1; mark++) {
        const markX = Math.round(mark * markSpacing - groundOffset)
        ctx.fillRect(markX, 188, Math.max(1, scale / 3), 7)
      }
      ctx.restore()
      for (let i = 0; i < WING_LOOKS.length; i++) {
        const look = WING_LOOKS[i]
        const x = Math.round(WIDTH / WING_LOOKS.length * (i + 0.5))
        ctx.fillStyle = '#e5c690'
        ctx.globalAlpha = 0.18
        ctx.fillRect(x - 44, 193, 88, 1)
        ctx.globalAlpha = 1
        ctx.save()
        drawElf(ctx, {
          px: scale, x, groundY: 187, lift: mode === 'flight' ? scale * 2 : 0, dir,
          outfit: appearance.outfit, appearance, pose: mode === 'walk' ? 'stepA' : 'idle',
          walkPhase: phase, bigHat: false, hatItem: null, wingsItem: look.item,
          label: null, trim: null, self: true, bell: 0,
        }, t, true)
        ctx.restore()
        ctx.textAlign = 'center'
        ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = '#f3ddae'
        ctx.fillText(look.name, x, 216)
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = '#c7ad92'
        ctx.fillText(look.caption, x, 233)
      }
      ctx.fillStyle = '#211b18'
      ctx.fillRect(12, 245, WIDTH - 24, 109)
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#c7ad92'
      ctx.textAlign = 'left'
      ctx.fillText(`Complete stride · ${CHARACTER_WALK.length} frames · all feet share the same ground line`, 24, 262)
      const cellWidth = (WIDTH - 32) / CHARACTER_WALK.length
      for (let i = 0; i < CHARACTER_WALK.length; i++) {
        const x = Math.round(16 + cellWidth * (i + 0.5))
        if (mode === 'walk' && Math.floor(phase * CHARACTER_WALK.length) === i) {
          ctx.fillStyle = '#65472f'
          ctx.fillRect(Math.round(x - cellWidth / 2 + 2), 268, Math.floor(cellWidth - 4), 82)
        }
        ctx.fillStyle = '#937353'
        ctx.fillRect(Math.round(x - cellWidth / 2 + 5), 332, Math.floor(cellWidth - 10), 1)
        ctx.save()
        drawElf(ctx, {
          px: 4, x, groundY: 332, lift: 0, dir, outfit: appearance.outfit, appearance,
          pose: 'stepA', walkPhase: i / CHARACTER_WALK.length, bigHat: false,
          hatItem: null, wingsItem: null, label: null, trim: null, self: true, bell: 0,
        }, 0, true)
        ctx.restore()
        ctx.textAlign = 'center'
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = '#e5c690'
        ctx.fillText(`${i + 1} · ${Math.round(i / CHARACTER_WALK.length * 100)}%`, x, 346)
      }
      if (sliderRef.current) sliderRef.current.value = String(Math.round(phase * 1000))
      if (cycleRef.current) cycleRef.current.value = `${Math.round(phase * 100)}%`
    }
    paintRef.current = paint
    paint()

    let frame = 0
    let lastTime = 0
    const tick = (now: number) => {
      if (lastTime) timeRef.current += Math.min((now - lastTime) / 1000, 0.05) * speed
      lastTime = now
      paint()
      frame = requestAnimationFrame(tick)
    }
    const refreshVisibility = () => {
      cancelAnimationFrame(frame)
      lastTime = 0
      if (playing && active && document.visibilityState === 'visible') frame = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', refreshVisibility)
    refreshVisibility()
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', refreshVisibility)
      paintRef.current = null
    }
  }, [playing, active, mode, dir, gender, hairStyle, scale, speed])

  return <section aria-labelledby="workshop-motion-heading" className="my-8 overflow-hidden rounded-xl border border-amber-200/20 bg-[#30241f]">
    <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-5">
      <div><h2 id="workshop-motion-heading" className="text-lg font-semibold text-[#f3ddae]">Movement &amp; magnificent wings</h2><p className="mt-1 max-w-2xl text-sm text-amber-100/60">The moving ground shows the actual walking pace. Compare every stride frame below, or slow playback to inspect foot contact. Every character uses the live floor renderer.</p></div>
      <button type="button" className="rounded-lg border border-amber-200/40 bg-[#674734] px-4 py-2 text-sm font-medium text-amber-50 hover:bg-[#7a553e]" onClick={() => setPlaying(value => !value)}>{playing ? 'Pause motion' : 'Play motion'}</button>
    </div>
    <div className="flex flex-wrap items-end gap-3 border-y border-amber-200/10 bg-[#392920] px-5 py-3">
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Movement<select className={selectClass} value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="walk">Ground walk</option><option value="idle">Idle</option><option value="flight">Airborne wings</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Playback<select className={selectClass} value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1× · normal</option><option value={0.5}>0.5× · slow</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Facing<select className={selectClass} value={dir} onChange={e => setDir(Number(e.target.value) as 1 | -1)}><option value={1}>Right</option><option value={-1}>Left</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Size<select className={selectClass} value={scale} onChange={e => setScale(Number(e.target.value))}><option value={6}>Portrait</option><option value={3}>Floor · native</option><option value={1}>Mini · native</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Body style<select className={selectClass} value={gender} onChange={e => setGender(e.target.value as typeof gender)}><option value="male">Male</option><option value="female">Female</option></select></label>
      <label className="flex flex-col gap-1 text-xs text-amber-100/80">Haircut<select className={selectClass} value={hairStyle} onChange={e => setHairStyle(e.target.value as typeof hairStyle)}>{HAIR_STYLES.map(style => <option value={style} key={style}>{style}</option>)}</select></label>
      <label className="ml-auto flex min-w-[220px] flex-1 flex-col gap-2 text-xs text-amber-100/80">Stride cycle · drag to pause
        <span className="flex items-center gap-3"><input ref={sliderRef} type="range" min={0} max={1000} defaultValue={0} step={1} aria-label="Scrub motion cycle" className="w-full accent-[#d5ad6b]" onChange={e => {
          setPlaying(false)
          timeRef.current = Number(e.target.value) / 1000 * STRIDE_SECONDS
          paintRef.current?.()
        }} /><output ref={cycleRef} className="min-w-[4ch] text-right tabular-nums">0%</output></span>
      </label>
    </div>
    <div className="overflow-x-auto"><canvas ref={canvasRef} width={WIDTH} height={HEIGHT} role="img" aria-label={`${gender} elves with ${hairStyle} hair facing ${dir === 1 ? 'right' : 'left'}, showing ${mode === 'walk' ? 'a full walking cycle against moving ground marks' : mode === 'idle' ? 'their idle stance' : 'airborne wing animation'} with no wings, Sprout Wings, Cloud Wings, Ember Wings, and Prism Wings. Below, a contact sheet shows all ${CHARACTER_WALK.length} stride frames.`} className="block w-full min-w-[720px] [image-rendering:pixelated]" /></div>
    <p className="px-5 pb-4 text-xs text-amber-100/50">Motion pauses while the bag is open or this tab is hidden. Reduced-motion preferences start this preview paused.</p>
  </section>
}
