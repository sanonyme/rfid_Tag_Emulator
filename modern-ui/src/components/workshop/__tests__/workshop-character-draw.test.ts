// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BASE_OUTFITS, DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type ElfAppearance } from '@/lib/workshop-appearance'
import { ITEMS, ITEM_BY_ID, type ItemDef } from '@/lib/workshop-items'
import { drawElf, ELF_ROWS, type ElfPose, type ElfSpec } from '../workshop-draw'
import { CHARACTER_ARMS, CHARACTER_LEGS, CHARACTER_WALK, characterMotion } from '../workshop-character-art'

type Pixel = { x: number; y: number; w: number; h: number; color: string }
const EYE_WHITE = '#fffaf1'
const EYE_PUPIL = '#111c28'
const ITEM_MARKER = '#010203'
const POSES: ElfPose[] = ['idle', 'stepA', 'stepB']
const HATS = ITEMS.filter(item => item.kind === 'hat')
const TOPS = ITEMS.filter(item => item.kind === 'shirt')

/** Records actual art pixels; the node fallback avoids the offscreen canvas cache. */
function drawing() {
  const pixels: Pixel[] = []
  let transform = { x: 0, y: 0, sx: 1, sy: 1 }
  const stack: { transform: typeof transform; fillStyle: string; globalAlpha: number }[] = []
  const ctx = {
    fillStyle: '', globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) { pixels.push({ x: transform.x + x * transform.sx, y: transform.y + y * transform.sy, w: w * transform.sx, h: h * transform.sy, color: ctx.fillStyle }) },
    save() { stack.push({ transform: { ...transform }, fillStyle: ctx.fillStyle, globalAlpha: ctx.globalAlpha }) },
    restore() { const saved = stack.pop()!; transform = saved.transform; ctx.fillStyle = saved.fillStyle; ctx.globalAlpha = saved.globalAlpha },
    translate(x: number, y: number) { transform.x += x * transform.sx; transform.y += y * transform.sy },
    scale(x: number, y: number) { transform.sx *= x; transform.sy *= y },
    beginPath() {}, ellipse() {}, fill() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pixels }
}

function elf(appearance: ElfAppearance, px: number = 2): ElfSpec {
  return { px, x: 100, groundY: 100, lift: 0, dir: 1, outfit: appearance.outfit, appearance, pose: 'stepA', bigHat: false, hatItem: null, label: null, trim: null, self: true, bell: 0 }
}

function render(e: ElfSpec, t = 1): Pixel[] {
  const { ctx, pixels } = drawing()
  // This time is outside the idle breath window, leaving only the character pixels.
  drawElf(ctx, e, t, true)
  return pixels
}

function colorAt(pixels: Pixel[], x: number, y: number) {
  for (let i = pixels.length - 1; i >= 0; i--) {
    const p = pixels[i]
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p.color
  }
  return undefined
}

function visible(pixels: Pixel[], predicate: (pixel: Pixel) => boolean) {
  return pixels.filter(p => predicate(p) && colorAt(pixels, p.x + p.w / 2, p.y + p.h / 2) === p.color)
}

function eyes(pixels: Pixel[]) {
  return visible(pixels, p => p.color === EYE_WHITE || p.color === EYE_PUPIL)
}

function markerItem(item: ItemDef): ItemDef {
  return { ...item, blink: undefined, palette: Object.fromEntries(Object.keys(item.palette).map(key => [key, ITEM_MARKER])) }
}

beforeEach(() => vi.stubGlobal('document', undefined))
afterEach(() => vi.unstubAllGlobals())

describe('customizable elf drawing', () => {
  it('keeps hips and shoulders fixed from idle to walking and removes recovery-frame foot jumps', () => {
    const boots = CHARACTER_WALK.map(frame => {
      const y = frame.legs.findIndex(row => row.includes('k'))
      return { x: frame.legs[y].indexOf('k'), y }
    })
    for (let i = 0; i < CHARACTER_WALK.length; i++) {
      const frame = CHARACTER_WALK[i]
      const next = boots[(i + 1) % boots.length]
      expect(frame.legs[22], `frame ${i}: same hips as idle`).toBe(CHARACTER_LEGS.idle[22])
      expect(frame.front[14], `frame ${i}: same near shoulder as idle`).toBe(CHARACTER_ARMS.idle.front[14])
      expect(frame.back[14], `frame ${i}: same far shoulder as idle`).toBe(CHARACTER_ARMS.idle.back[14])
      expect(Math.abs(next.x - boots[i].x), `frame ${i}: no sideways foot teleport`).toBeLessThanOrEqual(2)
      expect(Math.abs(next.y - boots[i].y), `frame ${i}: smooth foot lift`).toBeLessThanOrEqual(1)
      expect(characterMotion('stepA', i / CHARACTER_WALK.length, false), 'frames are cached').toBe(frame)
    }
    expect(characterMotion('stepA', -0.5, false)).toBe(CHARACTER_WALK[CHARACTER_WALK.length / 2])
    expect(characterMotion('idle', 0.1, false).bodyDip).toBe(0)
    expect(characterMotion('stepA', 0.1, true).bodyDip).toBe(0)
  })

  it('alternates the leading leg through passing frames while keeping a boot on the ground', () => {
    for (const px of [1, 2, 3]) for (const dir of [1, -1] as const) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, starterHat: false }, px), dir }
      const frames = CHARACTER_WALK.map((_, step) => render({ ...e, walkPhase: step / CHARACTER_WALK.length }))
      const legs = frames.map(frame => visible(frame, p => p.y >= e.groundY - 4 * px))
      expect(new Set(legs.map(frame => JSON.stringify(frame))).size, `scale${px}: distinct passing frames`).toBeGreaterThanOrEqual(6)
      for (const frame of legs) expect(Math.max(...frame.map(p => p.y + p.h)), `scale${px}: planted foot`).toBe(e.groundY)
      if (px >= 2) {
        const nearBootX = (frame: Pixel[]) => {
          const boot = frame.filter(p => p.color === '#766751')
          return boot.reduce((sum, p) => sum + p.x + p.w / 2, 0) / boot.length
        }
        expect((nearBootX(legs[0]) - nearBootX(legs[CHARACTER_WALK.length / 2])) * dir, 'the near foot changes from forward to backward').toBeGreaterThan(px * 2)
      }
      const bareEyes = eyes(frames[0])
      frames.forEach((frame, index) => {
        const dip = px < 2 ? 0 : CHARACTER_WALK[index].bodyDip * px / 2
        expect(eyes(frame), 'eyes move together with the one-pixel weight shift').toEqual(bareEyes.map(p => ({ ...p, y: p.y + dip })))
      })
      expect(render({ ...e, walkPhase: 1 })).toEqual(frames[0])
    }
  })

  it('keeps headwear and eyes aligned through the full stride', () => {
    for (const hat of HATS) for (const gender of ['male', 'female'] as const) for (const px of [1, 3]) for (let step = 0; step < CHARACTER_WALK.length; step++) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, gender, hairStyle: 'long', starterHat: false }, px), walkPhase: step / CHARACTER_WALK.length }
      expect(eyes(render({ ...e, hatItem: markerItem(hat) })), `${hat.id}/${gender}/${px}/frame${step}`).toEqual(eyes(render(e)))
    }
  })

  it('layers every wing behind the face and keeps flight independent of the ground stride', () => {
    for (const wing of ITEMS.filter(item => item.kind === 'wings')) for (const px of [1, 2, 3]) for (const dir of [1, -1] as const) for (const lift of [0, 12]) for (const t of [0, 0.1, 0.2]) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, hairStyle: 'long', starterHat: false }, px), lift, dir, walkPhase: 0.25 }
      const bare = render(e, t)
      const equipped = render({ ...e, wingsItem: wing }, t)
      expect(eyes(equipped), `${wing.id}/${px}/${dir}/lift${lift}/flap${t}: visible face`).toEqual(eyes(bare))
      expect(equipped.length, 'wings paint behind the body').toBeGreaterThan(bare.length)
      expect(equipped.filter(p => p.y >= e.groundY - lift - px), 'wings never extend through the boots').toEqual(bare.filter(p => p.y >= e.groundY - lift - px))
      if (lift) expect(render({ ...e, walkPhase: 0.75 }, t), 'no cycling feet in midair').toEqual(bare)
    }
  })

  it('keeps readable eyes and ground contact across bodies, hairstyles, walk poses and scales', () => {
    expect(ELF_ROWS).toBe(15)
    for (const gender of ['male', 'female'] as const) for (const hairStyle of HAIR_STYLES) for (const px of [1, 2, 3]) for (const pose of POSES) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, gender, hairStyle, starterHat: false }, px), pose }
      const pixels = render(e)
      const context = `${gender}/${hairStyle}/${pose}/scale${px}`
      const face = eyes(pixels)
      expect(face.some(p => p.color === EYE_PUPIL), `${context}: visible pupil`).toBe(true)
      expect(face.some(p => p.color === EYE_WHITE), `${context}: visible eye white`).toBe(true)
      expect(Math.max(...pixels.map(p => p.y + p.h)), `${context}: boots meet the ground`).toBe(e.groundY)
      expect(pixels.every(p => p.y >= e.groundY - ELF_ROWS * px), `${context}: keeps the gameplay height`).toBe(true)
    }
  })

  it('mirrors the face, hair, body and walk cycle around the same character center', () => {
    for (const gender of ['male', 'female'] as const) for (const hairStyle of HAIR_STYLES) for (const px of [1, 2, 3]) for (const pose of POSES) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, gender, hairStyle, starterHat: false }, px), pose }
      const right = render(e)
      const left = render({ ...e, dir: -1 })
      const unit = px < 2 ? px : px / 2
      const width = 10 * px / unit
      const height = ELF_ROWS * px / unit
      const x0 = e.x - 5 * px
      const y0 = e.groundY - ELF_ROWS * px
      const mismatches: number[][] = []
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const x = x0 + (col + 0.5) * unit
        const y = y0 + (row + 0.5) * unit
        if (colorAt(right, x, y) !== colorAt(left, 2 * e.x - x, y)) mismatches.push([col, row])
      }
      expect(mismatches, `${gender}/${hairStyle}/${pose}/scale${px}: exact direction mirror`).toEqual([])
    }
  })

  it('joins the chin to a short neckline without a dangling white collar or skin stripe', () => {
    for (const gender of ['male', 'female'] as const) for (const px of [1, 2, 3]) for (const shirt of [null, ...TOPS]) {
      const appearance = { ...DEFAULT_APPEARANCE, gender, hairStyle: 'bald' as const, starterHat: false }
      const e = { ...elf(appearance, px), shirtItem: shirt ? markerItem(shirt) : null }
      const pixels = render(e)
      const skinColors: string[] = [SKIN_TONES[appearance.skin].base, SKIN_TONES[appearance.skin].shadow]
      const finePixel = px / 2
      const at = (col: number, row: number) => colorAt(pixels, e.x - 5 * px + (col + 0.5) * finePixel, e.groundY - ELF_ROWS * px + (row + 0.5) * finePixel)
      const context = `${gender}/${shirt?.id ?? 'base-outfit'}/scale${px}`
      const throat = [9, 10, 11, 12].flatMap(col => [13, 14, 15].map(row => at(col, row)))
      expect(throat.every(color => color !== undefined), `${context}: head connects to the shoulders`).toBe(true)
      expect(throat.includes('#e7e4cd'), `${context}: no white V hanging below the chin`).toBe(false)
      expect([14, 15].flatMap(row => [10, 11, 12].map(col => at(col, row))).some(color => skinColors.includes(color ?? '')), `${context}: no elongated skin stripe`).toBe(false)
    }
  })

  it('protects the visible eye when every hat is layered over every hair and skin option', () => {
    for (const hat of HATS) for (const hairStyle of HAIR_STYLES) for (let skin = 0; skin < SKIN_TONES.length; skin++) for (const dir of [1, -1] as const) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, hairStyle, skin, starterHat: false }, 3), dir }
      const bareFace = eyes(render(e))
      const equipped = render({ ...e, hatItem: markerItem(hat) })
      expect(eyes(equipped), `${hat.id}/${hairStyle}/skin${skin}/dir${dir}: unchanged visible eyes`).toEqual(bareFace)
      expect(equipped.some(p => p.color === ITEM_MARKER), `${hat.id}: worn art exists`).toBe(true)
    }
  })

  it('fits headwear for both body styles, all scales, poses and account ranks', () => {
    for (const hat of [null, ...HATS]) for (const gender of ['male', 'female'] as const) for (const px of [1, 2, 3]) for (const pose of POSES) for (const bigHat of [false, true]) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, gender, hairStyle: 'long', starterHat: false }, px), pose, bigHat }
      const bareFace = eyes(render(e))
      const equipped = render({ ...e, appearance: { ...e.appearance!, starterHat: hat === null }, hatItem: hat ? markerItem(hat) : null })
      expect(eyes(equipped), `${hat?.id ?? 'starter-cap'}/${gender}/${pose}/scale${px}/rank${bigHat}`).toEqual(bareFace)
    }
  })

  it('retains long hair below caps and gives every miniature haircut its own silhouette', () => {
    for (const px of [1, 3]) {
      const e = elf({ ...DEFAULT_APPEARANCE, hairStyle: 'long', starterHat: false }, px)
      const pixels = render({ ...e, hatItem: markerItem(ITEM_BY_ID.get('hard-hat')!) })
      const hairColors: string[] = Object.values(HAIR_COLORS[0])
      const hair = visible(pixels, p => hairColors.includes(p.color))
      const eyeBottom = Math.max(...eyes(pixels).map(p => p.y + p.h))
      expect(hair.some(p => p.y >= eyeBottom), `scale${px}: long hair hangs below the fitted cap`).toBe(true)
    }
    const silhouettes = HAIR_STYLES.map(hairStyle => {
      const pixels = render(elf({ ...DEFAULT_APPEARANCE, hairStyle, starterHat: false }, 1))
      const colors: string[] = Object.values(HAIR_COLORS[0])
      return JSON.stringify(visible(pixels, p => colors.includes(p.color)))
    })
    expect(new Set(silhouettes).size).toBe(HAIR_STYLES.length)
  })

  it('can hide the starter cap while still wearing a looted hat', () => {
    const e = elf({ ...DEFAULT_APPEARANCE, starterHat: false })
    const bare = render(e)
    expect(bare.some(p => p.color === BASE_OUTFITS[0].hat)).toBe(false)
    const equipped = render({ ...e, hatItem: markerItem(ITEM_BY_ID.get('tag-runner-beanie')!) })
    expect(equipped.some(p => p.color === ITEM_MARKER)).toBe(true)
  })

  it('fits every top below the face and above the boots using square native pixels', () => {
    for (const top of TOPS) for (const gender of ['male', 'female'] as const) for (const px of [1, 2, 3]) for (const pose of POSES) {
      const e = { ...elf({ ...DEFAULT_APPEARANCE, gender, hairStyle: 'bald', starterHat: false }, px), pose }
      const bare = render(e)
      const equipped = render({ ...e, shirtItem: markerItem(top) })
      const garment = equipped.filter(p => p.color === ITEM_MARKER)
      const faceBottom = Math.max(...eyes(bare).map(p => p.y + p.h))
      const unit = px < 2 ? px : px / 2
      const context = `${top.id}/${gender}/${pose}/scale${px}`
      expect(garment.length, `${context}: worn art exists`).toBeGreaterThan(0)
      expect(garment.every(p => p.y >= faceBottom && p.y + p.h < e.groundY), `${context}: torso bounds`).toBe(true)
      expect(garment.every(p => p.w === unit && p.h === unit), `${context}: undistorted native art`).toBe(true)
      expect(eyes(equipped), `${context}: eyes remain uncovered`).toEqual(eyes(bare))
      expect(equipped.filter(p => p.y < faceBottom), `${context}: face and hair remain unchanged`).toEqual(bare.filter(p => p.y < faceBottom))
    }
  })
})
