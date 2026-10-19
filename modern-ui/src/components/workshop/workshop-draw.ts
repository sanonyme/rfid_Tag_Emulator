import type { ItemDef } from '@/lib/workshop-items'
import { BASE_OUTFITS, DEFAULT_APPEARANCE, HAIR_COLORS, SKIN_TONES, type ElfAppearance } from '@/lib/workshop-appearance'
import type { TreeStage } from '@/lib/workshop-state'
import { drawHexGlyph } from './workshop-pixel'
import { worldArtFor } from './workshop-world'
import { drawVillageAtmosphere, paintVillageBackdrop } from './workshop-village'
import { CHARACTER_CAP, CHARACTER_HAIR, CHARACTER_HEAD, CHARACTER_MINI_HEAD, CHARACTER_TORSO, characterFrame, characterMotion, miniatureCharacter, type CharacterPose } from './workshop-character-art'
import { WORN_TOPS } from './workshop-worn-tops'
import { getWingArt, type WingArt } from './workshop-wing-art'

/** One outfit per hat index on the wire (`WORKSHOP_HAT_COUNT`). */
export const ELF_OUTFITS = BASE_OUTFITS

const PRESENT = [
  '.RR..RR.',
  '.RrRRrR.',
  'HHHRRHHH',
  'BBBRRBBD',
  'RRRRRRRR',
  'BHBRRBBD',
  'BBBRRBBD',
  'DDDRRDDD',
]

const PRESENT_PALETTES = [
  { B: '#ce3e43', D: '#8f2635', H: '#ec7670', R: '#edcb77', r: '#fff1bd' },
  { B: '#258364', D: '#175347', H: '#68b696', R: '#f0eee0', r: '#ffffff' },
  { B: '#397fa3', D: '#28516e', H: '#7eb9d0', R: '#edcb77', r: '#fff1bd' },
  { B: '#d8a344', D: '#9b6a34', H: '#f1cd80', R: '#b93642', r: '#f1948b' },
]

/** Sprite rows from boots to hat tip; multiply by the pixel scale for canvas pixels. */
export const ELF_ROWS = 15
export const PRESENT_ROWS = PRESENT.length

const FONT = '600 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export type ElfPose = CharacterPose

export type ElfSpec = {
  /** Canvas pixels per sprite pixel. */
  px: number
  x: number
  groundY: number
  lift: number
  dir: 1 | -1
  outfit: number
  /** Cosmetic identity shared by the real floor and character portrait. */
  appearance?: ElfAppearance
  pose: ElfPose
  /** Full stride phase from distance travelled, not time or network packet count. */
  walkPhase?: number
  bigHat: boolean
  /** Equipped hat item, replacing the outfit's stocking cap. */
  hatItem: ItemDef | null
  /** Jersey drawn over the coat. */
  shirtItem?: ItemDef | null
  wingsItem?: ItemDef | null
  /** Extra pixels to stand the elf up, used when riding a mount. */
  ride?: number
  label: string | null
  /** Nameplate outline for players who have found rare loot. */
  trim: string | null
  self: boolean
  /** Remaining bell swing, 1 → 0. */
  bell: number
}

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  ttl: number
  size: number
  /** Drawn size. Defaults to a square of `size`. */
  w?: number
  h?: number
  color: string
  gravity: number
  /** Expanding arc (RF waves) or a hex digit (hex rain) instead of a square. */
  shape?: 'ring' | 'glyph'
  glyph?: string
}

export type Floater = { text: string; x: number; y: number; age: number; ttl: number; color: string }

/** Emote icons, indexed by the wire's emote number. */
export const EMOTES = [
  { name: 'Heart', rows: ['.rr.rr.', 'rrrrrrr', 'rWrrrrr', '.rrrrr.', '..rrr..', '...r...'], palette: { r: '#e11d48', W: '#fecdd3' } },
  { name: 'Star', rows: ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.'], palette: { y: '#f5b400' } },
  { name: 'Ho ho!', rows: ['.yyyyy.', 'yykykyy', 'yyyyyyy', 'ykyyyky', 'yykkkyy', '.yyyyy.'], palette: { y: '#facc15', k: '#713f12' } },
  { name: 'Jingle', rows: ['..kkkk.', '..k..k.', '..k..k.', '..k..k.', 'kkk.kkk', 'kkk.kkk'], palette: { k: '#7c3aed' } },
  { name: 'Gift', rows: ['..w.w..', '...w...', 'ggwwwgg', 'gggwggg', 'wwwwwww', 'gggwggg', 'gggwggg'], palette: { w: '#fde68a', g: '#16a34a' } },
] as const

const spriteCache = new WeakMap<readonly string[], Map<string, HTMLCanvasElement>>()

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  palette: Record<string, string>,
  left: number,
  top: number,
  px: number,
  flip: boolean,
) {
  const width = rows[0].length
  if (typeof document !== 'undefined') {
    let variants = spriteCache.get(rows)
    if (!variants) { variants = new Map(); spriteCache.set(rows, variants) }
    const key = `${flip}:${Object.entries(palette).map(([k,v]) => k + v).join('|')}`
    let cached = variants.get(key)
    if (!cached) {
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = rows.length
      const target = canvas.getContext('2d')
      if (target) {
        for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
          const color = palette[rows[r][c]]
          if (!color) continue
          target.fillStyle = color; target.fillRect(flip ? width - 1 - c : c, r, 1, 1)
        }
        if (variants.size >= 64) variants.clear()
        variants.set(key, canvas); cached = canvas
      }
    }
    if (cached) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(cached, left, top, width * px, rows.length * px)
      return
    }
  }
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(left + (flip ? width - 1 - c : c) * px, top + r * px, px, px)
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

const LABEL_H = 13

function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, self: boolean, dark: boolean, trim: string | null) {
  ctx.font = FONT
  const w = Math.ceil(ctx.measureText(text).width) + 8
  const x = Math.round(cx - w / 2)
  const y = Math.round(bottom - LABEL_H)
  ctx.fillStyle = self ? 'rgba(193, 39, 50, 0.92)' : dark ? 'rgba(4, 12, 9, 0.62)' : 'rgba(255, 255, 255, 0.9)'
  roundedRect(ctx, x, y, w, LABEL_H, 4)
  ctx.fill()
  if (trim) {
    ctx.strokeStyle = trim
    ctx.lineWidth = 1.5
    roundedRect(ctx, x + 0.75, y + 0.75, w - 1.5, LABEL_H - 1.5, 3.5)
    ctx.stroke()
  }
  ctx.fillStyle = self ? '#ffffff' : dark ? '#e8f0ec' : '#1e293b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, y + LABEL_H / 2 + 0.5)
}

function itemPalette(item: ItemDef, t: number): Readonly<Record<string, string>> {
  if (!item.blink) return item.palette
  const on = Math.floor(t * 2.2) % 2 === 0
  return { ...item.palette, [item.blink.char]: on ? item.blink.on : item.blink.off }
}

/** Last sprite row that actually paints a pixel. Empty trailing rows are padding. */
function lastOpaqueRow(rows: readonly string[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (/[^.]/.test(rows[i])) return i
  }
  return rows.length - 1
}

/** Draws an item sprite with its bottom-centre at (cx, bottom). */
export function drawItem(ctx: CanvasRenderingContext2D, item: ItemDef, cx: number, bottom: number, px: number, flip: boolean, t: number) {
  const cols = item.sprite[0].length
  const left = Math.round(cx - (cols * px) / 2)
  const top = Math.round(bottom - item.sprite.length * px)
  drawSprite(ctx, item.sprite, itemPalette(item, t), left, top, px, flip)
}

export function itemWidth(item: ItemDef, px: number): number {
  return item.sprite[0].length * px
}

export function itemHeight(item: ItemDef, px: number): number {
  return item.sprite.length * px
}

function drawBell(ctx: CanvasRenderingContext2D, cx: number, top: number, t: number, strength: number) {
  ctx.save()
  ctx.translate(cx, top)
  ctx.rotate(Math.sin(t * 18) * 0.5 * strength)
  ctx.globalAlpha = Math.min(1, strength * 3)
  ctx.fillStyle = '#f0c34a'
  ctx.beginPath()
  ctx.moveTo(-5, 8)
  ctx.quadraticCurveTo(-5, 1, 0, 1)
  ctx.quadraticCurveTo(5, 1, 5, 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(-6, 8, 12, 1.5)
  ctx.fillStyle = '#b8862b'
  ctx.fillRect(-1, -1, 2, 2)
  ctx.beginPath()
  ctx.arc(0, 10.5, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const wornTopCache = new WeakMap<ItemDef, readonly string[]>()
const farWingPalettes = new WeakMap<WingArt, Record<string, string>>()
function wornTop(item: ItemDef): readonly string[] {
  let rows = wornTopCache.get(item)
  if (!rows) {
    const art = WORN_TOPS[item.id] ?? Array.from({ length: 9 }, (_, y) => item.sprite[Math.min(item.sprite.length - 1, Math.floor(y * item.sprite.length / 9))])
    rows = characterFrame(art, 6, 13)
    wornTopCache.set(item, rows)
  }
  return rows
}

/** Draws the elf and returns the y just above its nameplate (or hat), where bubbles go. */
export function drawElf(ctx: CanvasRenderingContext2D, e: ElfSpec, t: number, dark: boolean): number {
  const px = e.px
  const unit = px / 2
  const mini = px < 2
  const appearance = e.appearance ?? { ...DEFAULT_APPEARANCE, outfit: e.outfit }
  const outfit = ELF_OUTFITS[appearance.outfit % ELF_OUTFITS.length] ?? ELF_OUTFITS[0]
  const skin = SKIN_TONES[appearance.skin] ?? SKIN_TONES[DEFAULT_APPEARANCE.skin]
  const hairColor = HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[DEFAULT_APPEARANCE.hairColor]
  const fit = e.hatItem?.hatFit ?? (e.hatItem ? ((e.hatItem.hatSit ?? 1) < 0 ? 'floating' : 'cap') : appearance.starterHat ? 'cap' : null)
  const hairstyle = CHARACTER_HAIR[appearance.hairStyle] ?? CHARACTER_HAIR.swept
  const hair = fit === 'cap' ? hairstyle.cap : hairstyle.full
  const shade = (hex: string, factor = 0.66) => {
    const n = Number.parseInt(hex.slice(1), 16)
    return `rgb(${Math.round(((n >> 16) & 255) * factor)}, ${Math.round(((n >> 8) & 255) * factor)}, ${Math.round((n & 255) * factor)})`
  }
  const highlight = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16)
    return `rgb(${Math.round(((n >> 16) & 255) * 0.72 + 255 * 0.28)}, ${Math.round(((n >> 8) & 255) * 0.72 + 255 * 0.28)}, ${Math.round((n & 255) * 0.72 + 255 * 0.28)})`
  }
  const palette: Record<string, string> = {
    S: skin.base, s: skin.shadow, o: shade(outfit.coat, 0.45),
    C: outfit.coat, c: shade(outfit.coat), H: highlight(outfit.coat),
    p: shade(outfit.coat, 0.8), W: '#e7e4cd', B: '#4b3930', G: '#d6b566',
  }
  const left = Math.round(e.x - 5 * px)
  const ride = e.ride ?? 0
  const motion = characterMotion(ride ? 'idle' : e.pose, e.walkPhase, !ride && e.lift > 0)
  const legTop = Math.round(e.groundY - ELF_ROWS * px - e.lift - ride)
  // Keep the entire upper assembly together; moving just the head stretches the
  // neck, while moving the soles makes the character float. Minis skip the dip.
  const rigTop = legTop + (mini ? 0 : motion.bodyDip * unit)
  const flip = e.dir === -1
  const hairPalette = { H: hairColor.color, h: hairColor.shadow, A: hairColor.highlight, G: '#d6b566' }
  const facePalette = { S: skin.base, s: skin.shadow, o: shade(skin.shadow), b: hairColor.shadow, W: '#fffaf1', P: '#111c28' }
  const paint = (rows: readonly string[], colors: Record<string, string>, top = rigTop) =>
    drawSprite(ctx, mini ? miniatureCharacter(rows) : rows, colors, left, top, mini ? px : unit, flip)

  const shadowHalf = Math.max(px, px * 2.7 - e.lift * 0.12)
  ctx.fillStyle = dark ? 'rgba(3, 22, 32, 0.2)' : 'rgba(59, 92, 113, 0.1)'
  ctx.beginPath()
  ctx.ellipse(e.x, e.groundY + 1, shadowHalf + px, px, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = dark ? 'rgba(3, 15, 25, 0.33)' : 'rgba(41, 75, 96, 0.22)'
  ctx.beginPath()
  ctx.ellipse(e.x, e.groundY + 1, shadowHalf * 0.72, Math.max(0.6, px * 0.55), 0, 0, Math.PI * 2)
  ctx.fill()

  if (px >= 2 && e.pose === 'idle' && e.lift === 0 && !ride) {
    const breath = (t * 0.28 + e.x * 0.013 + e.outfit * 0.17) % 1
    if (breath < 0.42) {
      const drift = breath / 0.42
      const bx = Math.round(e.x + e.dir * px * (3.2 + drift * 3))
      const by = Math.round(rigTop + px * (5.7 - drift * 1.4))
      ctx.save()
      ctx.globalAlpha *= Math.sin(drift * Math.PI) * (dark ? 0.4 : 0.3)
      ctx.fillStyle = dark ? '#e5f3f0' : '#a9c9d5'
      ctx.fillRect(bx, by, px, unit)
      ctx.fillRect(bx + e.dir * px, by - unit, px, unit)
      ctx.restore()
    }
  }

  let wingTop = Infinity
  if (e.wingsItem) {
    const wing = e.wingsItem
    const art = getWingArt(wing.id)
    if (art) {
      // Four beats make a complete flap. Articulated feathers and membranes
      // pivot around one fixed shoulder, instead of inflating the whole sprite.
      const beat = e.lift > 0 && !ride && !mini ? Math.floor(t * 10) % 4 : 1
      const rows = beat === 0 ? art.raised : beat === 2 ? art.swept : art.rest
      let farPalette = farWingPalettes.get(art)
      if (!farPalette) {
        farPalette = Object.fromEntries(Object.entries(art.palette).map(([key, color]) => [key, shade(color, 0.72)]))
        farWingPalettes.set(art, farPalette)
      }
      const shoulderY = rigTop + 15 * unit
      const farUnit = unit * 0.78
      const farRoot = e.x + e.dir * unit
      // Draw the smaller, darker far wing first; both roots disappear behind
      // the shoulder blades. Hair, face, clothing and arms remain in front.
      drawSprite(ctx, rows, farPalette, flip ? farRoot - 23 * farUnit : farRoot, shoulderY - 16 * farUnit, farUnit, !flip)
      const nearRoot = e.x - e.dir * unit
      wingTop = shoulderY - 16 * unit
      drawSprite(ctx, rows, art.palette, flip ? nearRoot : nearRoot - 23 * unit, wingTop, unit, flip)
    } else {
      drawItem(ctx, wing, e.x - e.dir * px * 3, rigTop + px * 12, unit, flip, t)
    }
  }

  // Shirts have their own nine-row tailoring. The near sleeve borrows the main
  // fabric and shading, while the hand and cuff remain separate moving layers.
  let armPalette = palette
  if (e.shirtItem) {
    const shirt = e.shirtItem
    const counts = new Map<string, number>()
    for (const row of shirt.sprite) for (const ch of row) if (shirt.palette[ch]) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    const cloth = shirt.palette[main] ?? outfit.coat
    armPalette = { ...palette, C: cloth, c: shade(cloth), H: highlight(cloth), o: shade(cloth, 0.45), W: shade(cloth, 0.85) }
  }
  paint(hair.back, hairPalette)
  paint(motion.back, armPalette)
  if (!ride) paint(motion.legs, { L: '#52768b', l: '#344d60', H: '#7294a4', K: '#493c35', k: '#766751', o: '#253039' }, legTop)
  paint(CHARACTER_TORSO[appearance.gender], armPalette)
  if (e.shirtItem) paint(wornTop(e.shirtItem), itemPalette(e.shirtItem, t))
  drawSprite(ctx, mini ? CHARACTER_MINI_HEAD : CHARACTER_HEAD, facePalette, left, rigTop, mini ? px : unit, flip)
  paint(motion.front, armPalette)
  paint(hair.front, hairPalette)

  // All headwear uses the same fine grid as the head. The crown and brim sit
  // above eye row eight; ear cups descend outside the face on their own anchor.
  const hatCx = left + (flip ? 9 : 11) * unit
  let hatTop = rigTop + (appearance.hairStyle === 'bald' ? 4 * unit : 0)
  if (e.hatItem) {
    const item = e.hatItem
    const brimRow = fit === 'earwear' ? 11 : fit === 'floating' ? 1 : 7
    const trailing = item.sprite.length - 1 - lastOpaqueRow(item.sprite)
    const bottom = rigTop + (brimRow + trailing) * unit
    hatTop = bottom - item.sprite.length * unit
    drawItem(ctx, item, hatCx, bottom, unit, flip, t)
  } else if (appearance.starterHat) {
    paint(CHARACTER_CAP, { H: outfit.hat, h: shade(outfit.hat), W: '#f7f3ee' })
    hatTop = rigTop + 2 * unit
    if (e.bigHat) {
      ctx.fillStyle = '#d6b566'
      ctx.fillRect(left + (flip ? 7 : 12) * unit, rigTop + 4 * unit, unit, unit)
    }
  }

  let top = Math.min(hatTop, wingTop) - 2
  if (e.bell > 0) {
    drawBell(ctx, e.x, top - 13, t, e.bell)
    top -= 15
  }
  if (e.label) {
    drawLabel(ctx, e.label, e.x, top, e.self, dark, e.trim)
    top -= LABEL_H + 2
  }
  return top
}

/** Soft rarity-coloured pool of light on the ground. */
export function drawGlow(ctx: CanvasRenderingContext2D, cx: number, groundY: number, radius: number, color: string, strength: number) {
  const g = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, radius)
  g.addColorStop(0, withAlpha(color, 0.5 * strength))
  g.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, groundY, radius, radius * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Vertical loot beam for epic and legendary drops. */
export function drawBeam(ctx: CanvasRenderingContext2D, cx: number, bottom: number, width: number, height: number, color: string, t: number) {
  const beamH = Math.min(height, 54)
  const pulse = 0.8 + 0.2 * Math.sin(t * 3)
  const g = ctx.createLinearGradient(0, bottom, 0, bottom - beamH)
  g.addColorStop(0, withAlpha(color, 0.23 * pulse))
  g.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(Math.round(cx - width / 2), bottom - beamH, Math.round(width), beamH)
  for (let i = 0; i < 3; i++) {
    const age = (t * .4 + i / 3) % 1
    ctx.fillStyle = withAlpha(color, Math.sin(age * Math.PI) * .7)
    ctx.fillRect(Math.round(cx + Math.sin(i * 3 + t) * width * .4), Math.round(bottom - age * beamH), 1, 2)
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`
}

export function drawSnowball(ctx: CanvasRenderingContext2D, x: number, y: number, groundY: number) {
  ctx.fillStyle = 'rgba(40, 70, 100, 0.18)'
  ctx.beginPath()
  ctx.ellipse(x, groundY + 1, 3, 1.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.round(x - 2), Math.round(y - 3), 4, 6)
  ctx.fillRect(Math.round(x - 3), Math.round(y - 2), 6, 4)
  ctx.fillStyle = '#c9dcef'
  ctx.fillRect(Math.round(x), Math.round(y + 1), 2, 1)
}

/** Little stars circling a bonked elf's head. */
export function drawDizzy(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, px: number) {
  for (let i = 0; i < 3; i++) {
    const a = t * 6 + (i * Math.PI * 2) / 3
    const sx = Math.round(cx + Math.cos(a) * px * 4)
    const sy = Math.round(y + Math.sin(a) * px * 1.2)
    ctx.fillStyle = i === 1 ? '#fff6c9' : '#f5c542'
    ctx.fillRect(sx - 1, sy, 3, 1)
    ctx.fillRect(sx, sy - 1, 1, 3)
  }
}

export function drawPresent(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottom: number,
  color: number,
  sparkle: number,
  px: number,
) {
  const size = PRESENT_ROWS * px
  const left = Math.round(cx - size / 2)
  const top = Math.round(bottom - size)
  drawSprite(ctx, PRESENT, PRESENT_PALETTES[color % PRESENT_PALETTES.length], left, top, px, false)
  // A tiny paper tag separates gift boxes from dropped wearable sprites at floor scale.
  if (px >= 2) {
    ctx.fillStyle = '#fff3d3'
    ctx.fillRect(left + 5 * px, top + 3 * px, px, px * 1.5)
    ctx.fillStyle = '#af8062'
    ctx.fillRect(left + 5 * px, top + 3 * px, 1, 1)
  }
  if (sparkle > 0) {
    ctx.save()
    ctx.globalAlpha = sparkle
    ctx.fillStyle = '#fff6c9'
    const sx = left + size + 1
    const sy = top - 1
    ctx.fillRect(sx - 3, sy, 7, 1)
    ctx.fillRect(sx, sy - 3, 1, 7)
    ctx.restore()
  }
}

type Slot = { v: number; u: number }

/** Two sprite rows per ledge: an irregular, stepped fir silhouette, 49 × 52 pixels. */
const FIR_HALVES = [0, 1, 2, 3, 4, 6, 8, 7, 6, 8, 10, 12, 11, 10, 12, 14, 16, 17, 15, 14, 17, 19, 21, 23, 24, 22]

function halfWidthAt(u: number): number {
  return FIR_HALVES[Math.max(0, Math.min(FIR_HALVES.length - 1, Math.floor(u * FIR_HALVES.length)))] / 24
}

function seededSlots(seed: number, count: number, minU: number, spacing: number): Slot[] {
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
  const slots: Slot[] = []
  for (let attempt = 0; attempt < 4000 && slots.length < count; attempt++) {
    const u = minU + rand() * (0.97 - minU)
    const v = (rand() * 2 - 1) * halfWidthAt(u) * 0.86
    if (slots.some((o) => Math.hypot((o.v - v) * 0.42, o.u - u) < spacing)) continue
    slots.push({ u, v })
  }
  // Fill top-down so the first ornaments of the day land near the star.
  return slots.sort((a, b) => a.u - b.u)
}

const ORNAMENT_SLOTS = seededSlots(7, 64, 0.16, 0.055)

/** Built once; drawSprite keeps only two tiny cached palette variants for the fir. */
const FIR_ROWS = (() => {
  const pixels: string[][] = Array.from({ length: 52 }, (_, y) => Array.from({ length: 49 }, (_, x) => {
    const half = FIR_HALVES[Math.floor(y / 2)]
    const distance = Math.abs(x - 24)
    if (distance > half) return '.'
    if (distance === half || y === 51) return 'D'
    const grain = (x * 31 + y * 13 + (x * y) % 17) % 37
    return grain < 3 ? 'H' : x < 24 ? 'L' : 'G'
  }))
  const put = (x: number, y: number, color: string) => {
    if (pixels[y]?.[x + 24] && pixels[y][x + 24] !== '.') pixels[y][x + 24] = color
  }
  // Each branch slopes into an individual jagged tip; staggered shadows avoid flat bands.
  const branches = [[-1, 6, 5], [1, 8, 5], [-1, 12, 8], [1, 14, 9], [-1, 18, 11], [1, 21, 12], [-1, 25, 15], [1, 28, 16], [-1, 33, 18], [1, 35, 20], [-1, 42, 23], [1, 44, 23]]
  for (const [side, y, reach] of branches) {
    for (let x = 1; x <= reach; x++) {
      const row = y + Math.floor(x * 0.25)
      put(side * x, row, side < 0 ? 'H' : 'L')
      put(side * x, row + 2, 'D')
      if (x > reach * 0.5) put(side * x, row + 3, 'D')
    }
  }
  // Snow collects in short shelves, with a blue underside and scattered loose crystals.
  for (const [x, y, length] of [[-5, 10, 3], [3, 15, 3], [-10, 22, 5], [-3, 27, 3], [8, 30, 5], [-17, 39, 6], [5, 43, 4], [15, 47, 6]]) {
    for (let i = 0; i < length; i++) {
      put(x + i, y, 'W')
      put(x + i, y + 1, 'I')
    }
    put(x + 1, y - 1, 'W')
  }
  return pixels.map(row => row.join(''))
})()

const FIR_PALETTE_DARK = { D: '#0a3432', G: '#155144', L: '#206c50', H: '#348264', W: '#edf3df', I: '#a4c5bd' }
const FIR_PALETTE_LIGHT = { D: '#144638', G: '#236345', L: '#327c52', H: '#529063', W: '#fff9e8', I: '#b7d2c4' }
const TREE_BAUBLES = ['#d9584b', '#e9bd65', '#94c7ce', '#f5ead2']
const TREE_STAR = [
  '.....G.....', '....GYG....', '....GYG....', 'GGGGYWYGGGG', '.GYYWWWYYG.',
  '..GYWWWYG..', '...GYYYG...', '..GYYYYYG..', '..GYYGYYG..', '.GYYG.GYYG.', '.GGG...GGG.',
]

function drawTreeRibbon(ctx: CanvasRenderingContext2D, cx: number, top: number, fh: number, maxHalf: number, stage: TreeStage, t: number) {
  const swags = [{ u: 0.22, half: 0.25 }, { u: 0.43, half: 0.42 }, { u: 0.67, half: 0.63 }, { u: 0.84, half: 0.84 }]
  for (let row = 0; row < swags.length; row++) {
    const swag = swags[row]
    const span = maxHalf * swag.half
    const samples = Math.ceil(span * 2)
    for (let i = 0; i <= samples; i++) {
      const p = i / samples
      const x = Math.round(cx + (p * 2 - 1) * span)
      const y = Math.round(top + fh * (swag.u + p * 0.035 + Math.sin(p * Math.PI) * 0.045))
      ctx.fillStyle = '#8d773f'
      ctx.fillRect(x, y, 1, 1)
      if (stage < 2 || i % 6 !== row % 3) continue
      const flicker = 0.78 + 0.22 * Math.sin(t * 2.3 + i * 1.7 + row)
      ctx.globalAlpha = flicker * 0.18
      ctx.fillStyle = '#f6cb76'
      ctx.fillRect(x - 2, y - 1, 5, 5)
      ctx.globalAlpha = flicker
      ctx.fillStyle = i % 3 ? '#ffe5a0' : '#eab56b'
      ctx.fillRect(x, y + 1, 1, 2)
    }
  }
  ctx.globalAlpha = 1
}

export type TreeSpec = {
  cx: number
  groundY: number
  height: number
  ornaments: number
  stage: TreeStage
  /** 0 → 1 pulse after a milestone unlocks. */
  celebrate: number
}

export function drawTree(ctx: CanvasRenderingContext2D, tree: TreeSpec, t: number, dark: boolean) {
  const { cx, groundY, height, stage } = tree
  // At 23px, a full set of 64 baubles obscures the silhouette. Use a tiny authored tree.
  if (height < 42) {
    const x = Math.round(cx)
    const top = Math.round(groundY - height)
    ctx.save()
    ctx.fillStyle = '#6b4931'
    ctx.fillRect(x - 1, groundY - 4, 3, 4)
    const miniRows = [0, 1, 2, 3, 2, 4, 5, 4, 6, 7]
    for (let i = 0; i < miniRows.length; i++) {
      const half = miniRows[i]
      const y = top + i * 2
      ctx.fillStyle = dark ? '#184e3f' : '#286147'
      ctx.fillRect(x - half, y, half * 2 + 1, 2)
      ctx.fillStyle = dark ? '#397657' : '#43855d'
      ctx.fillRect(x - half, y, half + 1, 1)
      if (i === 3 || i === 6 || i === 9) {
        ctx.fillStyle = '#d0e3d5'
        ctx.fillRect(x - half + 1, y, 2, 1)
      }
    }
    const count = Math.min(6, Math.ceil(tree.ornaments / 5))
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = TREE_BAUBLES[i % TREE_BAUBLES.length]
      ctx.fillRect(x + (i % 2 ? 3 : -3), top + 6 + Math.floor(i / 2) * 4, 1, 1)
    }
    if (stage >= 1) {
      ctx.fillStyle = '#ffdf83'
      ctx.fillRect(x - 2, top, 5, 1)
      ctx.fillRect(x, top - 2, 1, 5)
    }
    if (stage >= 2) {
      ctx.fillStyle = '#ffe4a0'
      ctx.fillRect(x - 5, groundY - 8, 1, 1)
      ctx.fillRect(x + 4, groundY - 6, 1, 1)
    }
    ctx.restore()
    return
  }
  const trunkH = Math.max(3, Math.round(height * 0.12))
  const trunkW = Math.max(3, Math.round(height * 0.075))
  const base = groundY - trunkH + 1
  const top = groundY - height
  const fh = base - top
  const maxHalf = fh * 24 / 52

  ctx.save()
  if (tree.celebrate > 0) {
    ctx.strokeStyle = withAlpha('#f7d98b', tree.celebrate * 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx, groundY - 2, height * (0.45 + (1 - tree.celebrate) * 0.35), 4 + (1 - tree.celebrate) * 5, 0, Math.PI, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 8; i++) {
      const a = t * 0.5 + i * Math.PI / 4
      const sx = Math.round(cx + Math.cos(a) * height * 0.52)
      const sy = Math.round(top + height * 0.45 + Math.sin(a) * height * 0.42)
      ctx.fillStyle = withAlpha('#ffe9ac', tree.celebrate)
      ctx.fillRect(sx - 2, sy, 5, 1)
      ctx.fillRect(sx, sy - 2, 1, 5)
    }
  }
  // A low timber planter anchors the tree in the town square.
  ctx.fillStyle = dark ? '#173a36' : '#99b5a0'
  ctx.fillRect(Math.round(cx - maxHalf * 0.93), groundY - 1, Math.round(maxHalf * 1.86), 2)
  ctx.fillStyle = '#604630'
  ctx.fillRect(Math.round(cx - trunkW / 2), base - 1, trunkW, trunkH)
  ctx.fillStyle = '#99724a'
  ctx.fillRect(Math.round(cx - trunkW / 2), base, 2, trunkH - 1)
  ctx.fillStyle = dark ? '#6b4234' : '#89543d'
  ctx.fillRect(Math.round(cx - height * 0.17), groundY - 5, Math.round(height * 0.34), 5)
  ctx.fillStyle = '#c19a62'
  ctx.fillRect(Math.round(cx - height * 0.18), groundY - 6, Math.round(height * 0.36), 2)
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = '#d3b37d'
    ctx.fillRect(Math.round(cx + i * height * 0.11), groundY - 3, 1, 1)
  }
  const pixel = fh / FIR_ROWS.length
  drawSprite(ctx, FIR_ROWS, dark ? FIR_PALETTE_DARK : FIR_PALETTE_LIGHT, Math.round(cx - 24.5 * pixel), Math.round(top), pixel, false)
  drawTreeRibbon(ctx, cx, top, fh, maxHalf, stage, t)

  const ornamentR = Math.max(1, Math.round(height / 70))
  const shown = Math.min(tree.ornaments, ORNAMENT_SLOTS.length)
  for (let i = 0; i < shown; i++) {
    const slot = ORNAMENT_SLOTS[i]
    const x = Math.round(cx + slot.v * maxHalf)
    const y = Math.round(top + slot.u * fh)
    ctx.fillStyle = '#bc984f'
    ctx.fillRect(x, y - ornamentR - 1, 1, 1)
    ctx.fillStyle = '#0b3931'
    ctx.fillRect(x - ornamentR, y - ornamentR, ornamentR * 2 + 2, ornamentR * 2 + 2)
    ctx.fillStyle = TREE_BAUBLES[i % TREE_BAUBLES.length]
    ctx.fillRect(x - ornamentR, y - ornamentR, ornamentR * 2 + 1, ornamentR * 2)
    ctx.fillRect(x, y + ornamentR, 1, 1)
    ctx.fillStyle = '#fff1cd'
    ctx.fillRect(x - ornamentR, y - ornamentR, 1, 1)
    if ((i + Math.floor(t * 0.8)) % 23 === 0) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 2.8 + i) * 0.35
      ctx.fillRect(x - 2, y - 1, 5, 1)
      ctx.fillRect(x, y - 3, 1, 5)
      ctx.globalAlpha = 1
    }
  }

  const starR = Math.max(4, height * 0.068)
  const starY = top - starR * 0.4
  if (stage >= 1) {
    const pulse = 1 + 0.08 * Math.sin(t * 3) + tree.celebrate * 0.5
    const glowR = starR * 2.6 * pulse
    const glow = ctx.createRadialGradient(cx, starY, 0, cx, starY, glowR)
    glow.addColorStop(0, `rgba(255, 226, 138, ${0.5 + 0.15 * Math.sin(t * 3)})`)
    glow.addColorStop(1, 'rgba(255, 226, 138, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, starY, glowR, 0, Math.PI * 2)
    ctx.fill()
    const starPixel = starR * 2 / TREE_STAR.length
    drawSprite(ctx, TREE_STAR, { G: '#d39a49', Y: '#f4ca70', W: '#fff2bd' }, Math.round(cx - starR), Math.round(starY - starR), starPixel, false)
    // Sparse orbiting ice glints make the unlocked topper visible across a busy floor.
    for (let i = 0; i < 3; i++) {
      const a = t * 0.32 + i * Math.PI * 2 / 3
      const x = Math.round(cx + Math.cos(a) * starR * (2.1 + i * 0.15))
      const y = Math.round(starY + Math.sin(a) * starR * 1.5)
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2.1 + i * 2)
      ctx.fillStyle = '#fff0bb'
      ctx.fillRect(x - 1, y, 3, 1)
      ctx.fillRect(x, y - 1, 1, 3)
    }
    ctx.globalAlpha = 1
  } else {
    ctx.strokeStyle = dark ? 'rgba(245, 197, 66, 0.4)' : 'rgba(180, 130, 20, 0.45)'
    ctx.lineWidth = 1
    starPath(ctx, cx, starY, starR)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawTrain(ctx: CanvasRenderingContext2D, cx: number, groundY: number, span: number, t: number) {
  ctx.strokeStyle = 'rgba(75, 103, 114, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(cx, groundY + 1, span * 0.54, 3, 0, 0, Math.PI * 2)
  ctx.stroke()
  const traverse = span / 26
  const phase = (t / traverse) % 2
  const dir = phase < 1 ? 1 : -1
  const p = phase < 1 ? phase : 2 - phase
  const lead = cx - span / 2 + p * span
  const y = groundY + 2

  const car = (x: number, w: number, color: string, cargo: string | null) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x - w / 2), y - 7, w, 5)
    if (cargo) {
      ctx.fillStyle = cargo
      ctx.fillRect(Math.round(x - 2), y - 10, 4, 3)
    }
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(x - w / 2 + 2.5, y - 1.5, 1.6, 0, Math.PI * 2)
    ctx.arc(x + w / 2 - 2.5, y - 1.5, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  car(lead - dir * 25, 9, '#2f7de1', '#f4d27a')
  car(lead - dir * 14, 9, '#1f9d55', '#d42530')
  ctx.fillStyle = '#7a7a7a'
  ctx.fillRect(Math.round(lead - dir * 20 - 1), y - 4, 2, 1)
  ctx.fillRect(Math.round(lead - dir * 9 - 1), y - 4, 2, 1)

  car(lead, 12, '#c62828', null)
  ctx.fillStyle = '#8e1c1c'
  ctx.fillRect(Math.round(lead - dir * 5 - 2), y - 11, 5, 4)
  ctx.fillStyle = '#222'
  ctx.fillRect(Math.round(lead + dir * 3 - 1), y - 11, 2, 4)
  ctx.fillStyle = '#f5c542'
  ctx.fillRect(Math.round(lead + dir * 6 - (dir > 0 ? 0 : 1)), y - 6, 1, 2)

  for (let i = 0; i < 3; i++) {
    const age = (t * 1.4 + i / 3) % 1
    ctx.globalAlpha = 0.7 * (1 - age)
    ctx.fillStyle = '#f4f7fb'
    ctx.beginPath()
    ctx.arc(lead + dir * 3 - dir * age * 10, y - 13 - age * 9, 1.5 + age * 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

export function drawGround(ctx: CanvasRenderingContext2D, width: number, height: number, groundY: number, dark: boolean, room = 'anexya-general', t = 0) {
  if (height < 50) {
    ctx.fillStyle = dark ? '#d2e5ec' : '#eff8fc'
    ctx.fillRect(0, groundY, width, height - groundY)
    ctx.fillStyle = dark ? '#7eacbd' : '#b2d1df'
    ctx.fillRect(0, height - 1, width, 1)
    return
  }
  ctx.save()
  // The raised street has a powder cap and a faceted ice edge, within the same ground line.
  ctx.fillStyle = dark ? '#a6c5c3' : '#c4dcd5'
  ctx.fillRect(0, groundY - 1, width, height - groundY + 1)
  ctx.fillStyle = dark ? '#dce9dc' : '#f3f7e9'
  ctx.fillRect(0, groundY - 1, width, 3)
  for (let x = 0; x < width; x += 31) {
    ctx.fillRect(x + 5, groundY - 2, 16, 1)
    ctx.fillStyle = dark ? '#779d9f' : '#a0c0bd'
    ctx.fillRect(x + 26, groundY + 3, 1, 3)
    ctx.fillStyle = dark ? '#dce9dc' : '#f3f7e9'
  }
  ctx.fillStyle = dark ? '#5d8b91' : '#8db2b3'
  ctx.fillRect(0, height - 1, width, 1)
  ctx.fillStyle = dark ? 'rgba(75, 126, 137, .4)' : 'rgba(103, 152, 155, .3)'
  for (let x = 19; x < width - 110; x += 43) {
    ctx.fillRect(x, groundY + 2, 3, 1); ctx.fillRect(x + 8, groundY + 4, 3, 1)
  }
  const art = worldArtFor(room)
  ctx.fillStyle = withAlpha(art.accent, dark ? .13 : .07)
  ctx.fillRect(Math.round(width * (art.key === 'home' ? .44 : .48) - 27), groundY + 2, 54, 2)
  ctx.fillStyle = dark ? '#f2f7e5' : '#ffffff'
  for (let i = 0; i < 18; i++) {
    const x = ((i * 97) % Math.max(8, width - 8)) + 4
    const y = groundY + 2 + i % 4
    if (i % 3 !== Math.floor(t * 1.5) % 3) ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, 1)
  }
  ctx.restore()
}


const SKY_FLAKES = Array.from({ length: 48 }, (_, i) => {
  const a = Math.sin(i * 4.11 + 2.1) * 9973.1
  const b = Math.sin(i * 9.73 + 0.7) * 43758.5
  return {
    x: a - Math.floor(a),
    y: b - Math.floor(b),
    speed: 0.35 + (i % 5) * 0.12,
    size: 1 + (i % 3 === 0 ? 1 : 0),
    drift: ((i % 7) - 3) * 0.08,
  }
})


const worldBackdropCache = new Map<string, HTMLCanvasElement>()
const WORLD_CACHE_LIMIT = 10

export function drawSky(ctx: CanvasRenderingContext2D, width: number, groundY: number, t: number, dark: boolean, room = 'anexya-general') {
  const art = worldArtFor(room)
  const mini = groundY < 50
  const key = `${art.key}:${dark}:${Math.ceil(width)}:${Math.ceil(groundY)}`
  let backdrop = worldBackdropCache.get(key)
  if (!backdrop && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width))
    canvas.height = Math.max(1, Math.ceil(groundY) + 1)
    const target = canvas.getContext('2d')
    if (target) {
      paintVillageBackdrop(target, width, groundY, dark, art)
      worldBackdropCache.set(key, canvas)
      if (worldBackdropCache.size > WORLD_CACHE_LIMIT) worldBackdropCache.delete(worldBackdropCache.keys().next().value as string)
      backdrop = canvas
    }
  }
  ctx.save()
  ctx.imageSmoothingEnabled = false
  if (backdrop) ctx.drawImage(backdrop, 0, 0)
  else paintVillageBackdrop(ctx, width, groundY, dark, art)
  if (!mini) drawVillageAtmosphere(ctx, width, groundY, t, dark, art)

  // Falling snow
  const flakes = mini ? 9 : SKY_FLAKES.length
  for (let i = 0; i < flakes; i++) {
    const f = SKY_FLAKES[i]
    const x = ((f.x * width + t * f.drift * 40) % width + width) % width
    const y = ((f.y * groundY + t * f.speed * 28) % groundY + groundY) % groundY
    ctx.globalAlpha = dark ? 0.35 + f.size * 0.1 : 0.55 + f.size * 0.15
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(Math.round(x), Math.round(y), mini ? 1 : f.size, mini ? 1 : f.size)
  }
  ctx.restore()
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]) {
  for (const p of particles) {
    const k = p.age / p.ttl
    ctx.globalAlpha = Math.max(0, 1 - k)
    if (p.shape === 'ring') {
      ctx.strokeStyle = p.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size + k * 14, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      continue
    }
    ctx.fillStyle = p.color
    if (p.shape === 'glyph' && p.glyph) drawHexGlyph(ctx, p.glyph, Math.round(p.x), Math.round(p.y), p.size)
    else ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w ?? p.size, p.h ?? p.size)
  }
  ctx.globalAlpha = 1
}

export function drawFloaters(ctx: CanvasRenderingContext2D, floaters: readonly Floater[], dark: boolean) {
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const f of floaters) {
    const k = f.age / f.ttl
    ctx.globalAlpha = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25)
    ctx.lineWidth = 3
    ctx.strokeStyle = dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.9)'
    ctx.strokeText(f.text, f.x, f.y - k * 16)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y - k * 16)
  }
  ctx.globalAlpha = 1
}
