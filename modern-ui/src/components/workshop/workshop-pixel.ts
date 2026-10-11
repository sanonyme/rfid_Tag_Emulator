/**
 * Pixel-art text and frames, rendered once at 1x on offscreen canvases and cached. Callers
 * draw them scaled up with image smoothing off, so every art pixel stays a crisp square.
 * Glyphs come from a system font with the antialiasing thresholded away, which keeps any
 * script readable (names and chat arrive from other machines).
 */

export type PixelSprite = { canvas: HTMLCanvasElement; w: number; h: number }

const FONT = 'bold 9px Verdana, Tahoma, "Segoe UI", sans-serif'
const LINE_H = 10
const ALPHA_CUTOFF = 120
const CACHE_MAX = 96
const BUBBLE_TEXT_W = 96
const BUBBLE_LINES = 3

const cache = new Map<string, PixelSprite | null>()

function cached(key: string, build: () => PixelSprite | null): PixelSprite | null {
  if (cache.has(key)) {
    const hit = cache.get(key) ?? null
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const sprite = build()
  cache.set(key, sprite)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
  return sprite
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w))
  canvas.height = Math.max(1, Math.ceil(h))
  return canvas
}

let measureCtx: CanvasRenderingContext2D | null | undefined

function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx = makeCanvas(1, 1)?.getContext('2d') ?? null
    if (measureCtx) measureCtx.font = FONT
  }
  return measureCtx
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function wrapPixelText(text: string, maxWidth: number, maxLines: number): string[] {
  const ctx = measurer()
  if (!ctx) return [text]
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    let chars = Array.from(word)
    while (chars.length > 1 && !fits(chars.join(''))) {
      let n = chars.length - 1
      while (n > 1 && !fits(chars.slice(0, n).join(''))) n--
      lines.push(chars.slice(0, n).join(''))
      chars = chars.slice(n)
    }
    line = chars.join('')
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = Array.from(kept[maxLines - 1])
  while (last.length > 0 && !fits(`${last.join('')}…`)) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.join('').trimEnd()}…`
  return kept
}

function textSprite(lines: readonly string[], color: string): PixelSprite | null {
  const m = measurer()
  if (!m) return null
  const w = Math.ceil(Math.max(1, ...lines.map((l) => m.measureText(l).width))) + 2
  const h = lines.length * LINE_H
  const canvas = makeCanvas(w, h)
  const ctx = canvas?.getContext('2d', { willReadFrequently: true })
  if (!canvas || !ctx) return null
  ctx.font = FONT
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#000'
  lines.forEach((l, i) => ctx.fillText(l, 1, i * LINE_H))
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const [r, g, b] = rgb(color)
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] >= ALPHA_CUTOFF
    img.data[i] = r
    img.data[i + 1] = g
    img.data[i + 2] = b
    img.data[i + 3] = on ? 255 : 0
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, w: canvas.width, h: canvas.height }
}

type FrameColors = { fill: string; edge: string; shadow: string }

/** Box with 1-pixel stepped corners and an optional staircase tail centred underneath. */
function frameShape(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, edge: string, fill: string, tail: boolean) {
  ctx.fillStyle = fill
  ctx.fillRect(ox + 2, oy + 1, w - 4, h - 2)
  ctx.fillRect(ox + 1, oy + 2, w - 2, h - 4)
  ctx.fillStyle = edge
  ctx.fillRect(ox + 2, oy, w - 4, 1)
  ctx.fillRect(ox + 2, oy + h - 1, w - 4, 1)
  ctx.fillRect(ox, oy + 2, 1, h - 4)
  ctx.fillRect(ox + w - 1, oy + 2, 1, h - 4)
  ctx.fillRect(ox + 1, oy + 1, 1, 1)
  ctx.fillRect(ox + w - 2, oy + 1, 1, 1)
  ctx.fillRect(ox + 1, oy + h - 2, 1, 1)
  ctx.fillRect(ox + w - 2, oy + h - 2, 1, 1)
  if (!tail) return
  const tx = ox + Math.floor(w / 2) - 2
  const by = oy + h - 1
  ctx.fillStyle = fill
  ctx.fillRect(tx + 1, by, 3, 1)
  ctx.fillRect(tx + 2, by + 1, 1, 1)
  ctx.fillStyle = edge
  ctx.fillRect(tx + 1, by + 1, 1, 1)
  ctx.fillRect(tx + 3, by + 1, 1, 1)
  ctx.fillRect(tx + 2, by + 2, 1, 1)
}

function framed(innerW: number, innerH: number, pad: number, colors: FrameColors, tail: boolean, paint: (ctx: CanvasRenderingContext2D, x: number, y: number) => void): PixelSprite | null {
  const w = innerW + pad * 2 + 2
  const h = innerH + pad * 2 + 2
  const canvas = makeCanvas(w + 1, h + (tail ? 2 : 0) + 1)
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return null
  frameShape(ctx, 1, 1, w, h, colors.shadow, colors.shadow, tail)
  frameShape(ctx, 0, 0, w, h, colors.edge, colors.fill, tail)
  paint(ctx, 1 + pad, 1 + pad)
  return { canvas, w: canvas.width, h: canvas.height }
}

const BUBBLES = {
  peer: { fill: '#ffffff', edge: '#1e293b', text: '#0f172a', shadow: 'rgba(15, 23, 42, 0.3)' },
  self: { fill: '#fff3df', edge: '#9a3412', text: '#431407', shadow: 'rgba(67, 20, 7, 0.3)' },
} as const

export function chatBubble(text: string, self: boolean): PixelSprite | null {
  const style = self ? 'self' : 'peer'
  return cached(`chat|${style}|${text}`, () => {
    const colors = BUBBLES[style]
    const label = textSprite(wrapPixelText(text, BUBBLE_TEXT_W, BUBBLE_LINES), colors.text)
    if (!label) return null
    return framed(label.w, label.h - 1, 3, colors, true, (ctx, x, y) => ctx.drawImage(label.canvas, x, y))
  })
}

export function iconBubble(key: string, rows: readonly string[], palette: Readonly<Record<string, string>>): PixelSprite | null {
  return cached(`icon|${key}`, () => {
    const w = rows[0]?.length ?? 0
    return framed(w, rows.length, 2, BUBBLES.peer, true, (ctx, x, y) => {
      rows.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          const color = palette[row[c]]
          if (!color) continue
          ctx.fillStyle = color
          ctx.fillRect(x + c, y + r, 1, 1)
        }
      })
    })
  })
}

/** Dark plate with coloured pixel text, for loot and milestone announcements. */
export function pixelBanner(text: string, color: string): PixelSprite | null {
  return cached(`banner|${color}|${text}`, () => {
    const label = textSprite([text], color)
    if (!label) return null
    return framed(label.w, label.h - 1, 3, { fill: 'rgba(8, 13, 26, 0.9)', edge: color, shadow: 'rgba(0, 0, 0, 0.35)' }, false, (ctx, x, y) =>
      ctx.drawImage(label.canvas, x, y),
    )
  })
}

/** Draws a sprite with its bottom-centre at (cx, bottom), snapped to device pixels. */
export function drawPixelSprite(ctx: CanvasRenderingContext2D, sprite: PixelSprite, cx: number, bottom: number, scale: number, dpr: number, alpha = 1) {
  const w = sprite.w * scale
  const h = sprite.h * scale
  const x = Math.round((cx - w / 2) * dpr) / dpr
  const y = Math.round((bottom - h) * dpr) / dpr
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = alpha
  ctx.drawImage(sprite.canvas, x, y, w, h)
  ctx.restore()
}

/** Scale for art pixels that maps each one onto a whole number of device pixels. */
export function crispScale(target: number, dpr: number): number {
  return Math.max(1, Math.round(target * dpr)) / dpr
}

// 3x5 hex digits for EPC stubs: 15 bits per glyph, top row first.
const HEX_GLYPHS: Record<string, number> = {
  '0': 0b111101101101111,
  '1': 0b010110010010111,
  '2': 0b111001111100111,
  '3': 0b111001111001111,
  '4': 0b101101111001001,
  '5': 0b111100111001111,
  '6': 0b111100111101111,
  '7': 0b111001010010010,
  '8': 0b111101111101111,
  '9': 0b111101111001111,
  A: 0b111101111101101,
  B: 0b110101110101110,
  C: 0b111100100100111,
  D: 0b110101101101110,
  E: 0b111100111100111,
  F: 0b111100111100100,
}

export function drawHexGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, px: number) {
  const bits = HEX_GLYPHS[ch]
  if (bits === undefined) return
  for (let i = 0; i < 15; i++) {
    if (bits & (1 << (14 - i))) ctx.fillRect(x + (i % 3) * px, y + Math.floor(i / 3) * px, px, px)
  }
}

export function hexTextWidth(text: string, px: number): number {
  return text.length * 4 * px - px
}

export function drawHexText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  for (let i = 0; i < text.length; i++) drawHexGlyph(ctx, text[i], x + i * 4 * px, y, px)
}
