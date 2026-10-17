import type { ItemDef } from '@/lib/workshop-items'
import type { TreeStage } from '@/lib/workshop-state'
import { drawHexGlyph } from './workshop-pixel'

const ELF_COLS = 10

/** One outfit per hat index on the wire (`WORKSHOP_HAT_COUNT`). */
export const ELF_OUTFITS = [
  { hat: '#d42530', coat: '#2f7a4f' },
  { hat: '#1f9d55', coat: '#b3262f' },
  { hat: '#2f7de1', coat: '#2a4f7c' },
  { hat: '#e0a526', coat: '#7a4b1c' },
  { hat: '#8b5cf6', coat: '#4c2f8a' },
  { hat: '#e0457b', coat: '#8a2a4d' },
] as const

// Sprites face right; drawSprite mirrors them for the other direction.
const ELF_BODY = [
  '..SSSSSS..',
  '.SSSSSSSS.',
  '.SSSSSESS.',
  '.SSSSSSRS.',
  '..SSSSSS..',
  '.CCCCCCCC.',
  'CCCCCCCCCC',
  'SCBBBGBBCS',
  '.CCCCCCCC.',
]

const ELF_LEGS = {
  idle: ['..LL..LL..', '..KK..KK..'],
  stepA: ['.LL....LL.', 'KK......KK'],
  stepB: ['...LLLL...', '...KKKK...'],
} as const

const ELF_HAT = [
  'W.........',
  '.HH.......',
  '..HHHH....',
  '..HHHHHH..',
  '.WWWWWWWW.',
]

const PRESENT = [
  '.R....R.',
  '..R..R..',
  'BBBRRBBB',
  'BBBRRBBB',
  'RRRRRRRR',
  'BBBRRBBB',
  'DDDRRDDD',
  'DDDRRDDD',
]

const PRESENT_PALETTES = [
  { B: '#d42530', D: '#a51b25', R: '#f4d27a' },
  { B: '#1f9d55', D: '#16753f', R: '#f7f3ee' },
  { B: '#2f7de1', D: '#2160b0', R: '#f4d27a' },
  { B: '#e0a526', D: '#b9841a', R: '#d42530' },
]

/** Sprite rows from boots to hat tip; multiply by the pixel scale for canvas pixels. */
export const ELF_ROWS = ELF_BODY.length + ELF_LEGS.idle.length + ELF_HAT.length - 1
export const PRESENT_ROWS = PRESENT.length

const ORNAMENT_COLORS = ['#e63946', '#f4c542', '#4ea8ff', '#ffffff', '#ff7eb6']
const LIGHT_COLORS = ['#ff5a5f', '#ffd166', '#5ad1ff', '#9dff8a']
const FONT = '600 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export type ElfPose = keyof typeof ELF_LEGS

export type ElfSpec = {
  /** Canvas pixels per sprite pixel. */
  px: number
  x: number
  groundY: number
  lift: number
  dir: 1 | -1
  outfit: number
  pose: ElfPose
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

/**
 * Canvas y of the hat sprite's bottom so its brim (last opaque row) overlaps
 * the elf forehead. `hatSit` is in elf-head rows: 2 = snug, 0 = on the crown, negative = float.
 */
function hatSpriteBottom(item: ItemDef, bodyTop: number, px: number, hatPx: number): number {
  const sit = item.hatSit ?? 2
  const brim = lastOpaqueRow(item.sprite)
  const trailing = item.sprite.length - 1 - brim
  return bodyTop + sit * px + trailing * hatPx
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

/** Draws the elf and returns the y just above its nameplate (or hat), where bubbles go. */
export function drawElf(ctx: CanvasRenderingContext2D, e: ElfSpec, t: number, dark: boolean): number {
  const px = e.px
  const outfit = ELF_OUTFITS[e.outfit % ELF_OUTFITS.length]
  const palette: Record<string, string> = {
    S: '#f2c9a0',
    E: '#1d1d1f',
    R: '#e8968a',
    C: outfit.coat,
    B: '#2a1a12',
    G: '#f0cd72',
    L: '#3a2a22',
    K: '#1a1110',
    H: outfit.hat,
    W: '#f7f3ee',
  }
  const left = Math.round(e.x - (ELF_COLS * px) / 2)
  const ride = e.ride ?? 0
  const bodyTop = Math.round(e.groundY - (ELF_BODY.length + ELF_LEGS.idle.length) * px - e.lift - ride)
  const flip = e.dir === -1

  const shadowHalf = Math.max(px * 1.5, px * 4 - e.lift * 0.12)
  ctx.fillStyle = dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(40, 70, 100, 0.2)'
  ctx.beginPath()
  ctx.ellipse(e.x, e.groundY + 1, shadowHalf, px, 0, 0, Math.PI * 2)
  ctx.fill()

  if (e.wingsItem) {
    const wing = e.wingsItem
    const spread = e.lift > 0 ? 1.05 + Math.sin(t * 13) * 0.12 : 0.8 + Math.sin(t * 4) * 0.12
    const wingPx = px * spread
    const center = e.x, top = bodyTop + 3 * px
    drawSprite(ctx, wing.sprite, itemPalette(wing,t), center - wing.sprite[0].length * wingPx - px, top, wingPx, false)
    drawSprite(ctx, wing.sprite, itemPalette(wing,t), center + px, top, wingPx, true)
  }
  drawSprite(ctx, ELF_BODY, palette, left, bodyTop, px, flip)
  // A mount covers the boots. Skip the walk cycle so the legs don't step through the vehicle.
  if (!ride) drawSprite(ctx, ELF_LEGS[e.pose], palette, left, bodyTop + ELF_BODY.length * px, px, flip)
  if (e.shirtItem) {
    drawItem(ctx, e.shirtItem, e.x, bodyTop + ELF_BODY.length * px, px, flip, t)
  }

  const hatPx = e.bigHat ? px + 1 : px
  let hatTop: number
  if (e.hatItem) {
    const sit = hatSpriteBottom(e.hatItem, bodyTop, px, hatPx)
    hatTop = sit - e.hatItem.sprite.length * hatPx
    drawItem(ctx, e.hatItem, e.x, sit, hatPx, flip, t)
  } else {
    const sit = bodyTop + 2 * px
    const hatLeft = Math.round(e.x - (ELF_COLS * hatPx) / 2)
    hatTop = sit - ELF_HAT.length * hatPx
    drawSprite(ctx, ELF_HAT, palette, hatLeft, hatTop, hatPx, flip)
  }

  let top = hatTop - 2
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
  const pulse = 0.75 + 0.25 * Math.sin(t * 4)
  const g = ctx.createLinearGradient(0, bottom, 0, bottom - height)
  g.addColorStop(0, withAlpha(color, 0.42 * pulse))
  g.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(Math.round(cx - width / 2), bottom - height, Math.round(width), height)
  ctx.fillStyle = withAlpha('#ffffff', 0.3 * pulse)
  ctx.fillRect(Math.round(cx - 1), bottom - height * 0.8, 2, height * 0.8)
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

/** Tiers in tree space: u runs 0 (tip) → 1 (base of the foliage), half is relative to the widest tier. */
const TIERS = [
  { top: 0, bottom: 0.4, half: 0.58 },
  { top: 0.22, bottom: 0.7, half: 0.8 },
  { top: 0.45, bottom: 1, half: 1 },
]

function halfWidthAt(u: number): number {
  let half = 0
  for (const tier of TIERS) {
    if (u < tier.top || u > tier.bottom) continue
    half = Math.max(half, (tier.half * (u - tier.top)) / (tier.bottom - tier.top))
  }
  return half
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
const LIGHT_SLOTS = seededSlots(4242, 22, 0.1, 0.07)

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
  const trunkH = Math.max(3, Math.round(height * 0.11))
  const trunkW = Math.max(4, Math.round(height * 0.13))
  const base = groundY - trunkH + 1
  const top = groundY - height
  const fh = base - top
  const maxHalf = height * 0.42

  ctx.fillStyle = '#6b4226'
  ctx.fillRect(Math.round(cx - trunkW / 2), base - 1, trunkW, trunkH)

  for (const tier of TIERS) {
    const tTop = top + fh * tier.top
    const tBottom = top + fh * tier.bottom
    const half = maxHalf * tier.half
    ctx.fillStyle = dark ? '#1f7a4a' : '#2a8a57'
    ctx.beginPath()
    ctx.moveTo(cx, tTop)
    ctx.lineTo(cx - half, tBottom)
    ctx.lineTo(cx + half, tBottom)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = dark ? '#175f39' : '#1f6f45'
    ctx.beginPath()
    ctx.moveTo(cx, tTop)
    ctx.lineTo(cx + half, tBottom)
    ctx.lineTo(cx, tBottom)
    ctx.closePath()
    ctx.fill()
    if (height >= 48) {
      ctx.fillStyle = 'rgba(247, 250, 255, 0.92)'
      const r = Math.max(1.5, height / 40)
      for (let x = cx - half * 0.86; x <= cx + half * 0.86; x += r * 2.2) {
        ctx.beginPath()
        ctx.arc(x, tBottom - 0.5, r, Math.PI, 0)
        ctx.fill()
      }
    }
  }

  const ornamentR = Math.max(1.3, height / 40)
  const shown = Math.min(tree.ornaments, ORNAMENT_SLOTS.length)
  for (let i = 0; i < shown; i++) {
    const slot = ORNAMENT_SLOTS[i]
    const x = cx + slot.v * maxHalf
    const y = top + slot.u * fh
    ctx.fillStyle = ORNAMENT_COLORS[i % ORNAMENT_COLORS.length]
    ctx.beginPath()
    ctx.arc(x, y, ornamentR, 0, Math.PI * 2)
    ctx.fill()
    if (ornamentR >= 1.8) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.fillRect(x - ornamentR * 0.5, y - ornamentR * 0.5, 1, 1)
    }
  }

  if (stage >= 2) {
    const lightR = Math.max(1.1, height / 55)
    for (let i = 0; i < LIGHT_SLOTS.length; i++) {
      const slot = LIGHT_SLOTS[i]
      const x = cx + slot.v * maxHalf
      const y = top + slot.u * fh
      const color = LIGHT_COLORS[(i + Math.floor(t * 2.5)) % LIGHT_COLORS.length]
      const glow = 0.55 + 0.45 * Math.sin(t * 5 + i * 1.7)
      ctx.globalAlpha = 0.28 * glow
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, lightR * 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.65 + 0.35 * glow
      ctx.beginPath()
      ctx.arc(x, y, lightR, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  const starR = Math.max(3.5, height * 0.09)
  const starY = top - starR * 0.15
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
    ctx.fillStyle = '#f5c542'
    starPath(ctx, cx, starY, starR * pulse)
    ctx.fill()
  } else {
    ctx.strokeStyle = dark ? 'rgba(245, 197, 66, 0.4)' : 'rgba(180, 130, 20, 0.45)'
    ctx.lineWidth = 1
    starPath(ctx, cx, starY, starR)
    ctx.stroke()
  }
}

export function drawTrain(ctx: CanvasRenderingContext2D, cx: number, groundY: number, span: number, t: number) {
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

export function drawGround(ctx: CanvasRenderingContext2D, width: number, height: number, groundY: number, dark: boolean) {
  const traceTop = () => {
    ctx.moveTo(0, groundY + 1)
    for (let x = 0; x < width; x += 18) {
      const bump = (x / 18) % 3 === 0 ? 2.5 : 1.2
      ctx.quadraticCurveTo(x + 9, groundY - bump, x + 18, groundY + 1)
    }
  }
  const bank = ctx.createLinearGradient(0, groundY - 4, 0, height)
  if (dark) {
    bank.addColorStop(0, 'rgba(232, 242, 252, 0.96)')
    bank.addColorStop(0.55, 'rgba(196, 214, 232, 0.95)')
    bank.addColorStop(1, 'rgba(148, 174, 198, 0.98)')
  } else {
    bank.addColorStop(0, '#ffffff')
    bank.addColorStop(0.55, '#eef6fc')
    bank.addColorStop(1, '#d7e7f4')
  }
  ctx.fillStyle = bank
  ctx.beginPath()
  traceTop()
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(140, 170, 198, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  traceTop()
  ctx.stroke()

  // Soft sparkle on the snow bank
  ctx.fillStyle = dark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.85)'
  for (let i = 0; i < 18; i++) {
    const x = ((i * 97) % Math.max(8, width - 8)) + 4
    const y = groundY + 4 + ((i * 13) % Math.max(4, height - groundY - 6))
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, 1)
  }
}

const SKY_STARS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453
  const b = Math.sin(i * 78.233) * 12345.6789
  return { x: a - Math.floor(a), y: b - Math.floor(b), phase: i * 0.9 }
})

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

const HILL_TREES = Array.from({ length: 14 }, (_, i) => ({
  x: 0.04 + (i / 13) * 0.78 + (i % 2 === 0 ? 0.01 : -0.01),
  h: 10 + (i % 5) * 3,
  w: 5 + (i % 3),
}))

/** Fills the floor canvas with a winter workshop sky so the world never feels blank. */
export function drawSky(ctx: CanvasRenderingContext2D, width: number, groundY: number, t: number, dark: boolean) {
  const sky = ctx.createLinearGradient(0, 0, 0, groundY)
  if (dark) {
    sky.addColorStop(0, '#050d18')
    sky.addColorStop(0.4, '#0a1f35')
    sky.addColorStop(0.78, '#12324f')
    sky.addColorStop(1, '#1a4660')
  } else {
    sky.addColorStop(0, '#7eb6e8')
    sky.addColorStop(0.35, '#b7d8f5')
    sky.addColorStop(0.72, '#e4f1fb')
    sky.addColorStop(1, '#f7fbfe')
  }
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, groundY)

  if (dark) {
    // Soft aurora ribbons
    for (let band = 0; band < 3; band++) {
      const y0 = 18 + band * 16
      const g = ctx.createLinearGradient(0, y0, width, y0 + 28)
      g.addColorStop(0, 'rgba(34, 197, 94, 0)')
      g.addColorStop(0.35, `rgba(${band === 1 ? '56, 189, 248' : '52, 211, 153'}, ${0.08 + band * 0.03})`)
      g.addColorStop(0.7, `rgba(${band === 2 ? '167, 139, 250' : '74, 222, 128'}, ${0.06 + band * 0.02})`)
      g.addColorStop(1, 'rgba(34, 197, 94, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(0, y0 + 10)
      for (let x = 0; x <= width; x += 24) {
        const wave = Math.sin(t * 0.4 + x * 0.02 + band) * 7 + Math.sin(t * 0.7 + x * 0.05) * 3
        ctx.lineTo(x, y0 + wave)
      }
      ctx.lineTo(width, y0 + 34)
      ctx.lineTo(0, y0 + 34)
      ctx.closePath()
      ctx.fill()
    }
    // Moon
    const mx = width * 0.82
    const my = groundY * 0.22
    const moon = ctx.createRadialGradient(mx, my, 2, mx, my, 18)
    moon.addColorStop(0, 'rgba(248, 250, 252, 0.95)')
    moon.addColorStop(0.45, 'rgba(226, 232, 240, 0.55)')
    moon.addColorStop(1, 'rgba(226, 232, 240, 0)')
    ctx.fillStyle = moon
    ctx.beginPath()
    ctx.arc(mx, my, 18, 0, Math.PI * 2)
    ctx.fill()
    for (const s of SKY_STARS) {
      const y = 4 + s.y * (groundY * 0.62)
      ctx.globalAlpha = 0.28 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.5 + s.phase))
      ctx.fillStyle = '#e9f2ff'
      ctx.fillRect(Math.round(s.x * width), Math.round(y), s.phase % 3 === 0 ? 2 : 1, 1)
    }
    ctx.globalAlpha = 1
  } else {
    // Soft winter sun
    const sx = width * 0.78
    const sy = groundY * 0.28
    const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 36)
    sun.addColorStop(0, 'rgba(255, 248, 220, 0.95)')
    sun.addColorStop(0.35, 'rgba(255, 214, 153, 0.45)')
    sun.addColorStop(1, 'rgba(255, 214, 153, 0)')
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(sx, sy, 36, 0, Math.PI * 2)
    ctx.fill()
    // Cloud puffs
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    for (let i = 0; i < 5; i++) {
      const cx = ((t * 8 + i * 140) % (width + 120)) - 40
      const cy = 18 + (i % 3) * 14
      ctx.beginPath()
      ctx.ellipse(cx, cy, 28, 9, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + 16, cy + 2, 18, 7, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - 14, cy + 3, 16, 6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Distant snow hills
  ctx.fillStyle = dark ? 'rgba(120, 150, 175, 0.35)' : 'rgba(210, 228, 242, 0.85)'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  for (let x = 0; x <= width; x += 20) {
    const h = 16 + Math.sin(x * 0.02) * 8 + Math.sin(x * 0.05 + 1) * 5
    ctx.lineTo(x, groundY - h)
  }
  ctx.lineTo(width, groundY)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = dark ? 'rgba(160, 185, 205, 0.4)' : 'rgba(232, 243, 250, 0.95)'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  for (let x = 0; x <= width; x += 16) {
    const h = 8 + Math.sin(x * 0.03 + 2) * 5
    ctx.lineTo(x, groundY - h)
  }
  ctx.lineTo(width, groundY)
  ctx.closePath()
  ctx.fill()

  // Tiny fir silhouettes on the ridge
  for (const tree of HILL_TREES) {
    const tx = tree.x * width
    if (tx < 8 || tx > width - 70) continue
    const base = groundY - 10 - Math.sin(tree.x * 20) * 4
    ctx.fillStyle = dark ? 'rgba(30, 58, 48, 0.75)' : 'rgba(47, 99, 72, 0.55)'
    ctx.beginPath()
    ctx.moveTo(tx, base - tree.h)
    ctx.lineTo(tx + tree.w, base)
    ctx.lineTo(tx - tree.w, base)
    ctx.closePath()
    ctx.fill()
    if (!dark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.fillRect(Math.round(tx) - 1, Math.round(base - tree.h), 2, 2)
    } else if (Math.floor(t * 2 + tree.x * 40) % 5 === 0) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.7)'
      ctx.fillRect(Math.round(tx), Math.round(base - tree.h * 0.45), 1, 1)
    }
  }

  // Falling snow
  for (const f of SKY_FLAKES) {
    const x = ((f.x * width + t * f.drift * 40) % width + width) % width
    const y = ((f.y * groundY + t * f.speed * 28) % groundY + groundY) % groundY
    ctx.globalAlpha = dark ? 0.35 + f.size * 0.1 : 0.55 + f.size * 0.15
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(Math.round(x), Math.round(y), f.size, f.size)
  }
  ctx.globalAlpha = 1
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
