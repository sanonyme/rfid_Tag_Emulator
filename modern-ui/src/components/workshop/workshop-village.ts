import type { WorldArt } from './workshop-world'

// Drawn once into the bounded 1x scene cache. All scenery remains behind gameplay.
const INK = '#173b42'
const SNOW = '#edf7ef'
const noise = (i: number) => { const n = Math.sin(i * 127.1 + 31.7) * 43758.5453; return n - Math.floor(n) }

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dark: boolean) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, r)
  light.addColorStop(0, dark ? 'rgba(255, 202, 116, .25)' : 'rgba(255, 225, 158, .13)')
  light.addColorStop(1, 'rgba(255, 202, 116, 0)')
  ctx.fillStyle = light; ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function pine(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, color: string, snow: boolean) {
  x = Math.round(x); base = Math.round(base)
  ctx.fillStyle = color
  for (let row = 0; row < h; row += 2) {
    const half = Math.round((row / h) * h * .26 + (Math.floor(row / 8) % 2 ? 1 : -1))
    ctx.fillRect(x - Math.max(1, half), base - h + row, Math.max(2, half * 2 + 1), 2)
    if (snow && row > h * .45 && row % 10 === 0) {
      ctx.fillStyle = '#bcd8d8'; ctx.fillRect(x - half, base - h + row, Math.max(2, half * .7), 1); ctx.fillStyle = color
    }
  }
}

function windowLight(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark: boolean, mint = false) {
  glow(ctx, x + w / 2, y + h / 2, w * 2, dark)
  ctx.fillStyle = '#213b3c'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4)
  ctx.fillStyle = mint ? '#a6d8c4' : '#eebd76'; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = mint ? '#d4f3df' : '#ffe2a1'; ctx.fillRect(x + 1, y + 1, w - 2, Math.max(2, h / 2 - 1))
  ctx.fillStyle = '#89714d'; ctx.fillRect(x + Math.floor(w / 2), y, 1, h); ctx.fillRect(x, y + Math.floor(h / 2), w, 1)
  ctx.fillStyle = SNOW; ctx.fillRect(x - 3, y + h + 2, w + 6, 2)
}

function snowRoof(ctx: CanvasRenderingContext2D, half: number, wallH: number, rise: number) {
  ctx.fillStyle = SNOW
  for (let x = -half - 6; x <= half + 5; x += 3) {
    const y = Math.round(-wallH - rise + Math.abs(x) / (half + 6) * rise)
    ctx.fillRect(x, y - 2, 4, 4)
    if (Math.abs(x) > half * .75 && x % 2) ctx.fillRect(x, y + 2, 2, 2)
  }
}

function house(ctx: CanvasRenderingContext2D, cx: number, base: number, art: WorldArt, dark: boolean, main: boolean, scale = 1) {
  const half = main ? 83 : 40
  const wallH = main ? 48 : 29
  const rise = main ? (art.key === 'home' ? 33 : art.key === 'edge' || art.key === 'cnct' ? 17 : 27) : 19
  ctx.save(); ctx.translate(Math.round(cx), Math.round(base)); ctx.scale(scale, scale)
  ctx.fillStyle = INK; ctx.fillRect(-half - 2, -wallH, half * 2 + 4, wallH + 3)
  ctx.fillStyle = art.wall; ctx.fillRect(-half, -wallH, half * 2, wallH)
  ctx.fillStyle = 'rgba(255, 230, 182, .11)'
  for (let y = -wallH + 7; y < 0; y += 7) ctx.fillRect(-half + 3, y, half * 2 - 6, 1)
  ctx.fillStyle = 'rgba(9, 37, 40, .24)'; ctx.fillRect(half - 25, -wallH, 25, wallH)
  ctx.fillStyle = '#354741'
  for (const x of [-half + 4, -24, 23, half - 7]) ctx.fillRect(x, -wallH + 3, 3, wallH - 3)
  ctx.fillStyle = '#624c40'; ctx.fillRect(-half - 5, -2, half * 2 + 10, 4)

  // Oversized eaves and a stepped snowy ridge make the village silhouette deliberate.
  ctx.fillStyle = INK
  ctx.beginPath(); ctx.moveTo(-half - 9, -wallH + 4); ctx.lineTo(0, -wallH - rise - 3); ctx.lineTo(half + 10, -wallH + 4); ctx.closePath(); ctx.fill()
  ctx.fillStyle = art.roof
  ctx.beginPath(); ctx.moveTo(-half - 6, -wallH + 1); ctx.lineTo(0, -wallH - rise); ctx.lineTo(half + 6, -wallH + 1); ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(14, 36, 39, .24)'
  ctx.beginPath(); ctx.moveTo(0, -wallH - rise); ctx.lineTo(half + 6, -wallH + 1); ctx.lineTo(0, -wallH + 1); ctx.fill()
  snowRoof(ctx, half, wallH, rise)
  ctx.fillStyle = '#bb7359'; ctx.fillRect(-half + 24, -wallH - rise + 3, 9, 13)
  ctx.fillStyle = SNOW; ctx.fillRect(-half + 22, -wallH - rise + 2, 13, 3)

  if (!main) {
    windowLight(ctx, -24, -20, 13, 13, dark)
    windowLight(ctx, 10, -20, 13, 13, dark)
    ctx.restore(); return
  }

  if (art.key === 'general') {
    ctx.fillStyle = INK; ctx.fillRect(-15, -wallH - rise - 19, 30, 26)
    ctx.fillStyle = art.wall; ctx.fillRect(-12, -wallH - rise - 17, 24, 23)
    ctx.fillStyle = '#f4edcd'; ctx.fillRect(-8, -wallH - rise - 13, 16, 16)
    ctx.fillStyle = '#355a55'; ctx.fillRect(-1, -wallH - rise - 11, 2, 8); ctx.fillRect(-1, -wallH - rise - 5, 6, 2)
    ctx.fillStyle = art.roof; ctx.fillRect(-16, -wallH - rise - 22, 32, 4)
    ctx.fillStyle = SNOW; ctx.fillRect(-18, -wallH - rise - 23, 36, 3)
  }
  if (art.key === 'qa') {
    ctx.fillStyle = '#a2cfc5'
    ctx.beginPath(); ctx.moveTo(-62, -wallH - 1); ctx.lineTo(0, -wallH - rise + 5); ctx.lineTo(62, -wallH - 1); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#e1f1df'; ctx.lineWidth = 2
    for (const x of [-40, -20, 0, 20, 40]) { ctx.beginPath(); ctx.moveTo(x * .3, -wallH - rise + 7); ctx.lineTo(x, -wallH - 2); ctx.stroke() }
  }
  if (art.key === 'cnct') {
    ctx.fillStyle = INK; ctx.fillRect(-46, -wallH - rise - 11, 4, 19); ctx.fillRect(42, -wallH - rise - 11, 4, 19)
    ctx.strokeStyle = '#b9c4a4'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(-44, -wallH - rise - 8); ctx.quadraticCurveTo(0, -wallH + 3, 44, -wallH - rise - 8); ctx.stroke()
    ctx.fillStyle = art.accent; ctx.fillRect(-48, -wallH - rise - 13, 8, 3); ctx.fillRect(40, -wallH - rise - 13, 8, 3)
  }
  if (art.key === 'ui') {
    ctx.fillStyle = INK; ctx.fillRect(-16, -wallH - rise + 9, 32, 17)
    ctx.fillStyle = art.wall; ctx.fillRect(-13, -wallH - rise + 11, 26, 15)
    ctx.fillStyle = '#e5d095'; ctx.fillRect(-8, -wallH - rise + 14, 16, 9)
    ctx.fillStyle = art.accent; ctx.fillRect(-18, -wallH - rise + 7, 36, 3)
    ctx.fillStyle = SNOW; ctx.fillRect(-20, -wallH - rise + 6, 40, 2)
  }

  if (art.key === 'vsbl') {
    ctx.fillStyle = '#263f39'; ctx.fillRect(-26, -34, 52, 34)
    ctx.fillStyle = '#81957b'; ctx.fillRect(-23, -31, 22, 31); ctx.fillRect(2, -31, 21, 31)
    ctx.fillStyle = '#c4cfae'; ctx.fillRect(-20, -28, 16, 2); ctx.fillRect(5, -28, 15, 2)
    ctx.fillStyle = '#425b50'; ctx.fillRect(-5, -17, 2, 7); ctx.fillRect(5, -17, 2, 7)
  } else {
    ctx.fillStyle = '#263f3c'; ctx.fillRect(-12, -30, 24, 30)
    ctx.fillStyle = art.key === 'home' ? '#9d5b46' : '#795240'; ctx.fillRect(-9, -27, 18, 27)
    ctx.fillStyle = '#deb879'; ctx.fillRect(4, -14, 2, 2)
    ctx.fillStyle = '#295b44'; ctx.fillRect(-5, -23, 10, 10)
    ctx.fillStyle = '#72a67a'; ctx.fillRect(-3, -22, 6, 2); ctx.fillRect(-4, -20, 2, 5)
    ctx.fillStyle = '#d86c61'; ctx.fillRect(-2, -15, 4, 3)
  }
  const mint = art.key === 'qa'
  const bigWindow = art.key === 'ui' || art.key === 'qa'
  windowLight(ctx, -65, -31, bigWindow ? 30 : 19, 21, dark, mint)
  windowLight(ctx, bigWindow ? 35 : 46, -31, bigWindow ? 30 : 19, 21, dark, mint)
  ctx.fillStyle = '#263f3c'; ctx.fillRect(-45, -wallH + 5, 90, 10)
  ctx.fillStyle = '#f1dfaf'; ctx.font = 'bold 6px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(art.label, 0, -wallH + 12)

  if (art.key === 'home' || art.key === 'support') {
    ctx.fillStyle = '#69513c'; ctx.fillRect(-half - 9, 1, half * 2 + 18, 4)
    for (const side of [-1, 1]) {
      ctx.fillRect(side * (half - 4) - 2, -31, 4, 32)
      ctx.fillRect(side < 0 ? -half + 1 : 28, -13, half - 29, 3)
      for (let n = 0; n < 3; n++) ctx.fillRect(side * (36 + n * 14), -11, 2, 12)
    }
  }
  // Holly dotted under the eaves, rather than extra foreground visual clutter.
  ctx.fillStyle = '#244b3c'
  for (let x = -half + 6; x < half; x += 8) ctx.fillRect(x, -wallH + 1 + Math.floor(Math.abs(x) / 32), 8, 3)
  ctx.fillStyle = '#e5b45f'
  for (const x of [-67, -34, 34, 67]) ctx.fillRect(x, -wallH + 6, 2, 2)
  ctx.restore()
}

function lamp(ctx: CanvasRenderingContext2D, x: number, base: number, dark: boolean) {
  x = Math.round(x)
  glow(ctx, x, base - 34, 23, dark)
  ctx.fillStyle = '#27464a'; ctx.fillRect(x - 1, base - 35, 3, 35); ctx.fillRect(x - 4, base - 2, 9, 3)
  ctx.fillRect(x - 5, base - 42, 11, 12)
  ctx.fillStyle = '#f2c77f'; ctx.fillRect(x - 3, base - 39, 7, 7)
  ctx.fillStyle = '#ffe5a5'; ctx.fillRect(x - 2, base - 38, 3, 5)
  ctx.fillStyle = SNOW; ctx.fillRect(x - 6, base - 44, 13, 3)
  ctx.fillStyle = '#295b43'; ctx.fillRect(x - 4, base - 23, 9, 4)
  ctx.fillStyle = '#be5c50'; ctx.fillRect(x - 2, base - 22, 5, 3)
}

function crate(ctx: CanvasRenderingContext2D, x: number, base: number) {
  ctx.fillStyle = '#62513f'; ctx.fillRect(x, base - 15, 23, 15)
  ctx.fillStyle = '#9f7c53'; ctx.fillRect(x + 2, base - 13, 19, 11)
  ctx.fillStyle = '#d7d5b3'; ctx.fillRect(x + 7, base - 11, 10, 6)
  ctx.fillStyle = '#66898b'; ctx.fillRect(x + 9, base - 10, 6, 1); ctx.fillRect(x + 9, base - 8, 6, 1)
  ctx.fillStyle = SNOW; ctx.fillRect(x - 1, base - 16, 25, 2)
}

function stall(ctx: CanvasRenderingContext2D, x: number, base: number, art: WorldArt, dark: boolean) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(base))
  ctx.fillStyle = '#60483b'; ctx.fillRect(-43, -42, 3, 42); ctx.fillRect(40, -42, 3, 42)
  ctx.fillStyle = '#96714c'; ctx.fillRect(-42, -19, 84, 19)
  ctx.fillStyle = '#bd9364'; ctx.fillRect(-44, -21, 88, 3)
  ctx.fillStyle = '#5b4237'; ctx.fillRect(-36, -15, 72, 11)
  glow(ctx, 0, -26, 32, dark)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#e8dfbf' : art.roof
    ctx.fillRect(-48 + i * 12, -44, 12, 12)
    ctx.fillRect(-48 + i * 12, -33, 11, 3)
  }
  ctx.fillStyle = SNOW; ctx.fillRect(-49, -46, 98, 3)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#e6cfa0'; ctx.fillRect(-27 + i * 17, -28, 9, 7)
    ctx.fillStyle = '#7c5741'; ctx.fillRect(-26 + i * 17, -29, 7, 2)
  }
  ctx.restore()
}

function roomLandmarks(ctx: CanvasRenderingContext2D, width: number, base: number, art: WorldArt, dark: boolean) {
  const left = Math.round(width * .2)
  const right = Math.round(width * .72)
  ctx.save()
  if (width >= 620) {
    if (art.key === 'general' || art.key === 'support') stall(ctx, left, base, art, dark)
    else if (art.key !== 'home') house(ctx, width * .15, base - 8, art, dark, false, .95)
    if (art.key === 'home') {
      for (let i = 0; i < 5; i++) { pine(ctx, width * .12 + i * 17, base - 2, 39 + (i % 3) * 12, '#29544b', true) }
      ctx.fillStyle = '#624937'; ctx.fillRect(right - 21, base - 18, 42, 18)
      for (let i = 0; i < 6; i++) { ctx.fillStyle = '#ac865c'; ctx.fillRect(right - 18 + i * 6, base - 15, 5, 5); ctx.fillRect(right - 15 + i * 6, base - 8, 5, 5) }
      ctx.fillStyle = SNOW; ctx.fillRect(right - 24, base - 20, 48, 3)
    }
    if (art.key === 'general') {
      ctx.fillStyle = '#72573f'; ctx.fillRect(right - 21, base - 34, 3, 35); ctx.fillRect(right + 18, base - 34, 3, 35)
      ctx.fillStyle = '#416052'; ctx.fillRect(right - 24, base - 42, 48, 29)
      ctx.fillStyle = '#ead9ac'; ctx.fillRect(right - 18, base - 36, 13, 16)
      ctx.fillStyle = '#b8d6c8'; ctx.fillRect(right + 2, base - 34, 15, 14)
      ctx.fillStyle = art.roof; ctx.fillRect(right - 13, base - 37, 3, 3); ctx.fillRect(right + 7, base - 35, 3, 3)
      ctx.fillStyle = SNOW; ctx.fillRect(right - 27, base - 44, 54, 3)
    }
    if (art.key === 'vsbl') { crate(ctx, left + 31, base); crate(ctx, right - 24, base); crate(ctx, right + 2, base); crate(ctx, right - 11, base - 15) }
    if (art.key === 'qa' || art.key === 'edge' || art.key === 'cnct') {
      ctx.fillStyle = '#527071'; ctx.fillRect(right - 27, base - 17, 54, 4); ctx.fillRect(right - 23, base - 13, 3, 13); ctx.fillRect(right + 20, base - 13, 3, 13)
      windowLight(ctx, right - 17, base - 34, 18, 12, dark, true)
      ctx.fillStyle = art.accent; ctx.fillRect(right + 8, base - 27, 11, 10)
      if (art.key === 'qa') for (let i = 0; i < 3; i++) { ctx.fillStyle = '#bedfc4'; ctx.fillRect(right - 18 + i * 11, base - 47, 6, 8) }
      if (art.key === 'cnct') { ctx.fillStyle = '#bd986a'; ctx.fillRect(left + 38, base - 20, 21, 20); ctx.fillStyle = INK; ctx.fillRect(left + 36, base - 18, 25, 3); ctx.fillRect(left + 36, base - 5, 25, 3) }
    }
    if (art.key === 'ui') {
      ctx.strokeStyle = '#8c7154'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(right - 21, base); ctx.lineTo(right, base - 48); ctx.lineTo(right + 21, base); ctx.stroke()
      ctx.fillStyle = '#efe7cd'; ctx.fillRect(right - 19, base - 42, 38, 29)
      for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#d6816e', '#d9b65f', '#7eab8e', '#75a5bb', '#b8cbc0', '#e4d9b7'][i]; ctx.fillRect(right - 13 + (i % 3) * 10, base - 37 + Math.floor(i / 3) * 10, 8, 8) }
    }
  }
  const mainX = width * (art.key === 'home' ? .44 : .48)
  if (width < 620) {
    const x = Math.round(mainX - 99)
    if (art.key === 'general' || art.key === 'support') {
      ctx.save(); ctx.translate(x, base); ctx.scale(.48, .62); stall(ctx, 0, 0, art, dark); ctx.restore()
    }
    if (art.key === 'home') {
      ctx.fillStyle = '#6e523b'; ctx.fillRect(x - 11, base - 13, 28, 13)
      ctx.fillStyle = '#b79463'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 9 + i * 6, base - 11, 4, 8)
      ctx.fillStyle = SNOW; ctx.fillRect(x - 13, base - 15, 31, 2)
    }
    if (art.key === 'qa') {
      ctx.fillStyle = '#567b76'; ctx.fillRect(x - 17, base - 19, 34, 3); ctx.fillRect(x - 14, base - 16, 2, 16); ctx.fillRect(x + 11, base - 16, 2, 16)
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#b9dbbd'; ctx.fillRect(x - 12 + i * 9, base - 30, 5, 10); ctx.fillStyle = '#7b9995'; ctx.fillRect(x - 12 + i * 9, base - 31, 5, 2) }
    }
    if (art.key === 'ui') {
      ctx.fillStyle = '#7d6449'; ctx.fillRect(x - 14, base - 30, 28, 21); ctx.fillRect(x - 10, base - 9, 2, 9); ctx.fillRect(x + 8, base - 9, 2, 9)
      for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#d6816e', '#d9b65f', '#7eab8e', '#75a5bb', '#b8cbc0', '#e4d9b7'][i]; ctx.fillRect(x - 10 + i % 3 * 7, base - 26 + Math.floor(i / 3) * 8, 5, 6) }
    }
    if (art.key === 'cnct') {
      ctx.fillStyle = '#ba9363'; ctx.fillRect(x - 12, base - 20, 24, 20)
      ctx.fillStyle = INK; ctx.fillRect(x - 14, base - 18, 28, 3); ctx.fillRect(x - 14, base - 5, 28, 3)
    }
  }
  if (art.key === 'edge') {
    const x = Math.round(mainX + (width < 620 ? 42 : 63))
    ctx.fillStyle = INK; ctx.fillRect(x - 2, base - 83, 4, 43)
    ctx.fillStyle = '#b6d3ca'; ctx.fillRect(x - 14, base - 84, 28, 4); ctx.fillRect(x - 8, base - 88, 16, 4)
    ctx.fillStyle = art.accent; ctx.fillRect(x - 2, base - 91, 4, 4)
  }
  if (art.key === 'vsbl') {
    const x = Math.round(mainX - (width < 620 ? 91 : 107))
    ctx.fillStyle = '#7c9985'; ctx.fillRect(x - 14, base - 40, 4, 40); ctx.fillRect(x + 11, base - 40, 4, 40); ctx.fillRect(x - 14, base - 42, 29, 6)
    ctx.fillStyle = '#b4e5b9'; ctx.fillRect(x - 8, base - 35, 17, 2)
  }
  ctx.restore()
}

function layout(width: number, groundY: number, art: WorldArt) {
  return { x: width * (art.key === 'home' ? .44 : .48), base: groundY - 8, scale: width < 620 ? .8 : 1 }
}

export function paintVillageBackdrop(ctx: CanvasRenderingContext2D, width: number, groundY: number, dark: boolean, art: WorldArt) {
  ctx.save()
  const sky = ctx.createLinearGradient(0, 0, 0, groundY)
  sky.addColorStop(0, dark ? '#0b2531' : art.light === 'day' ? '#8bb9cb' : '#91b4bf')
  sky.addColorStop(.6, dark ? '#20464f' : art.light === 'dusk' ? '#d9c6ad' : '#c8d7ce')
  sky.addColorStop(1, dark ? '#708b89' : '#f0e2bd')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, groundY + 1)
  if (groundY < 50) {
    ctx.fillStyle = dark ? '#5b7d7e' : '#a6c7ca'
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(0, 18); ctx.lineTo(20, 12); ctx.lineTo(41, 20); ctx.lineTo(67, 14); ctx.lineTo(width, 23); ctx.lineTo(width, groundY); ctx.fill()
    for (let i = 0; i < 4; i++) pine(ctx, 5 + i * 21, groundY - 2, 8 + i % 3, dark ? '#315b52' : '#71998b', false)
    ctx.fillStyle = art.wall; ctx.fillRect(55, groundY - 7, 12, 7)
    ctx.fillStyle = art.roof; ctx.fillRect(53, groundY - 9, 16, 3)
    ctx.fillStyle = '#f2cd8e'; ctx.fillRect(59, groundY - 5, 3, 3)
    ctx.restore(); return
  }
  // Fine stars/grain and a visible moon, all below the toolbar's visual weight.
  if (dark) {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 5 ? 'rgba(222, 239, 220, .34)' : 'rgba(245, 237, 184, .65)'
      ctx.fillRect(Math.round(noise(i) * width), Math.round(12 + noise(i + 81) * 80), 1, 1)
    }
    const mx = Math.round(width * .78), my = 48
    glow(ctx, mx, my, 27, dark)
    ctx.fillStyle = '#e4eac9'; ctx.fillRect(mx - 4, my - 7, 9, 14); ctx.fillRect(mx - 7, my - 4, 15, 8)
    ctx.fillStyle = '#36565a'; ctx.fillRect(mx + 1, my - 8, 8, 12)
  }
  // Three depth planes: jagged alpine ridge, soft snow slopes, then dense little firs.
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = dark ? (layer ? '#5c7d7f' : '#3e666e') : (layer ? '#c0d4d1' : '#a4bdc0')
    ctx.beginPath(); ctx.moveTo(0, groundY)
    for (let x = -50; x <= width + 100; x += 60) {
      const peak = 25 + noise(x + layer * 53) * (layer ? 12 : 29)
      ctx.lineTo(x, groundY - 21 + layer * 10); ctx.lineTo(x + 29, groundY - peak - 13 + layer * 12)
    }
    ctx.lineTo(width, groundY); ctx.closePath(); ctx.fill()
  }
  for (let i = 0; i < Math.ceil(width / 22); i++) {
    const x = i * 24 + noise(i + 9) * 12
    pine(ctx, x, groundY - 9, 13 + Math.floor(noise(i + 5) * 21), dark ? '#426a61' : '#84aaa0', false)
  }
  ctx.fillStyle = dark ? '#afc9c8' : '#e0e9df'
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(0, groundY - 10)
  for (let x = 0; x <= width + 16; x += 16) ctx.lineTo(x, groundY - 11 - Math.round(Math.sin(x * .019) * 3))
  ctx.lineTo(width, groundY); ctx.closePath(); ctx.fill()

  if (width >= 300) {
    const L = layout(width, groundY, art)
    roomLandmarks(ctx, width, L.base, art, dark)
    if (width >= 620 && art.key !== 'home') {
      // Connected wings give the central workshop a village-scale mass instead of a lone box.
      house(ctx, L.x + 105, L.base, art, dark, false, .82)
    }
    house(ctx, L.x, L.base, art, dark, true, L.scale)
    // Landmark antenna and scanner silhouettes sit in front of the roof too.
    if (art.key === 'edge') {
      const x = Math.round(L.x + (width < 620 ? 42 : 63))
      ctx.fillStyle = '#33575d'; ctx.fillRect(x - 1, L.base - 76, 3, 28)
      ctx.fillStyle = '#a7c5bd'; ctx.fillRect(x - 13, L.base - 80, 27, 3)
    }
    if (width >= 620) {
      lamp(ctx, width * .065, groundY - 2, dark)
      lamp(ctx, width * .825, groundY - 2, dark)
      // A quiet bench connects the square to the tree plaza.
      ctx.fillStyle = '#765c43'; ctx.fillRect(width * .635, groundY - 17, 34, 3); ctx.fillRect(width * .635, groundY - 11, 34, 3)
      ctx.fillStyle = '#34565a'; ctx.fillRect(width * .635 + 3, groundY - 14, 2, 13); ctx.fillRect(width * .635 + 28, groundY - 14, 2, 13)
    }
    // Snow settles around the architecture, separating the walk lane from the village.
    ctx.fillStyle = dark ? '#d9e8e0' : '#f3f8ed'
    for (let x = 0; x < width; x += 37) {
      const y = groundY - 4 - Math.floor(noise(x) * 3)
      ctx.fillRect(x, y, 29, 3); ctx.fillRect(x + 7, y - 2, 15, 2)
    }
  }
  ctx.restore()
}

export function drawVillageAtmosphere(ctx: CanvasRenderingContext2D, width: number, groundY: number, t: number, dark: boolean, art: WorldArt) {
  if (width < 300 || groundY < 100) return
  const L = layout(width, groundY, art)
  const left = 9, end = width - 102
  const bulbCount = Math.min(26, Math.floor((end - left) / 29))
  const cableY = (p: number) => 43 + Math.sin(p * Math.PI * 2) * 5 + p * 4
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = dark ? '#749184' : '#6b8272'
  ctx.beginPath(); ctx.moveTo(left, cableY(0))
  for (let i = 1; i <= 48; i++) { const p = i / 48; ctx.lineTo(left + p * (end - left), cableY(p)) }
  ctx.stroke()
  const colors = ['#f3d18c', '#d67c68', '#bdd1a1', '#f3d18c', '#9dbfc3']
  for (let i = 0; i < bulbCount; i++) {
    const p = (i + .5) / bulbCount, x = Math.round(left + p * (end - left)), y = Math.round(cableY(p))
    ctx.fillStyle = colors[i % colors.length]
    ctx.globalAlpha = dark ? .13 : .06; ctx.fillRect(x - 3, y, 8, 7)
    ctx.globalAlpha = .8 + Math.sin(t * 1.5 + i) * .16; ctx.fillRect(x, y + 2, 2, 3)
    ctx.fillStyle = '#ededd1'; ctx.fillRect(x, y + 2, 1, 1)
  }
  ctx.globalAlpha = 1
  const chimneyX = L.x - 55 * L.scale
  const roofRise = art.key === 'home' ? 33 : art.key === 'edge' || art.key === 'cnct' ? 17 : 27
  for (let i = 0; i < 4; i++) {
    const age = (t * .17 + i / 4) % 1
    ctx.globalAlpha = Math.sin(age * Math.PI) * (dark ? .24 : .32)
    ctx.fillStyle = dark ? '#c9d9cc' : '#faf7df'
    const x = Math.round(chimneyX + age * 20), y = Math.round(L.base - (48 + roofRise) * L.scale - age * 21)
    ctx.fillRect(x, y, 4 + Math.floor(age * 6), 3 + Math.floor(age * 3))
  }
  if (art.key === 'edge') {
    const x = Math.round(L.x + (width < 620 ? 42 : 63)), y = L.base - 91
    ctx.globalAlpha = .3 + Math.sin(t * 2) * .12; ctx.strokeStyle = art.accent
    for (const r of [7, 12]) { ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke() }
  }
  ctx.restore()
}
