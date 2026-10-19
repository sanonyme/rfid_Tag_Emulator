import { createGame, layoutFor, receive, renderMini, renderPanel, step, throwSnowball, type Game } from '../components/workshop/workshop-engine'
import { drawElf, drawTree } from '../components/workshop/workshop-draw'
import { WORLD_ART, worldArtFor } from '../components/workshop/workshop-world'
import { addToBag, equipItem, newProfile } from '../lib/workshop-profile'
import { DEFAULT_APPEARANCE } from '../lib/workshop-appearance'
import type { TreeStage } from '../lib/workshop-state'

if (!import.meta.env.DEV) throw new Error('The art preview is available only on the development server.')

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const panel = element<HTMLCanvasElement>('panel')
const mini = element<HTMLCanvasElement>('mini')
const zoom = element<HTMLCanvasElement>('mini-zoom')
const room = element<HTMLSelectElement>('room')
const theme = element<HTMLSelectElement>('theme')
const stage = element<HTMLSelectElement>('stage')
const width = element<HTMLSelectElement>('width')
const dpr = element<HTMLSelectElement>('dpr')
const toolbar = element<HTMLInputElement>('toolbar')
const sheet = element<HTMLElement>('room-sheet')
const showRooms = element<HTMLButtonElement>('show-rooms')
const results = element<HTMLDivElement>('results')
const net = { send: () => {}, sound: false }
const totals = [0, 10, 25, 50]
const roomIdFor = (key: string) => key === 'home' ? 'home.preview' : key === 'general' ? 'anexya-general' : key

/** Visual reference only: none of these sample controls consume pointer events. */
function toolbarOverlay() {
  const overlay = document.createElement('div')
  overlay.className = 'preview-toolbar'
  overlay.setAttribute('aria-hidden', 'true')
  const controls = ['✎ Snow Elf', '●', '♧ My Elf', '♧ 3', '⌁ Missions', '☏', '☺', '❄', 'General', 'Crew rooms ⌄', '⌂ Home', '♧ 3 here', 'Guest · VSBL', '♡ Friends', '♪', '⌖', '×', `♠ ${totals[Number(stage.value)]}`]
  overlay.replaceChildren(...controls.map((text, i) => {
    const control = document.createElement('span')
    control.textContent = text
    if (i === controls.length - 1) control.className = 'toolbar-tree'
    return control
  }))
  return overlay
}

function paintRoomSheet() {
  if (sheet.hidden) return
  sheet.replaceChildren(...Object.values(WORLD_ART).map(art => {
    const card = document.createElement('article')
    card.className = 'room-card'
    const title = document.createElement('h3')
    const name = document.createElement('span')
    name.textContent = Array.from(room.options).find(option => option.value === roomIdFor(art.key))?.textContent ?? art.label
    const size = document.createElement('small')
    size.textContent = '460 × 164'
    title.append(name, size)
    const viewport = document.createElement('div')
    viewport.className = 'stage'
    const shell = document.createElement('div')
    shell.className = 'panel-shell'
    const canvas = document.createElement('canvas')
    canvas.width = 460; canvas.height = 164
    canvas.setAttribute('aria-label', `${name.textContent}: ${art.landmarks.join(', ')}`)
    const sample = example(roomIdFor(art.key), 460, Number(stage.value) as TreeStage)
    renderPanel(canvas.getContext('2d')!, sample, 20_000, 1)
    shell.append(canvas, toolbarOverlay())
    viewport.append(shell)
    const footer = document.createElement('div')
    footer.className = 'room-card-footer'
    const chip = document.createElement('canvas')
    chip.width = 112; chip.height = 30
    chip.setAttribute('aria-label', `${name.textContent} miniature`)
    renderMini(chip.getContext('2d')!, sample, 20_000, 1, 112, 30)
    const caption = document.createElement('p')
    caption.textContent = `${art.label} · ${art.landmarks.join(' · ')}`
    const swatches = document.createElement('span')
    swatches.className = 'room-card-palettes'
    for (const color of [art.wall, art.roof, art.accent]) {
      const swatch = document.createElement('span')
      swatch.className = 'swatch'
      swatch.style.background = color
      swatch.title = color
      swatches.append(swatch)
    }
    caption.append(swatches)
    footer.append(chip, caption)
    card.append(title, viewport, footer)
    return card
  }))
}

function example(roomId: string, w: number, treeStage: TreeStage): Game {
  const profile = newProfile()
  profile.appearance = { ...DEFAULT_APPEARANCE, gender: 'female', hairStyle: 'braids', hairColor: 4, starterHat: false }
  addToBag(profile, 'uhf-field-vest', 'present')
  equipItem(profile, 'shirt', 'uhf-field-vest')
  addToBag(profile, 'angel-wings', 'present')
  equipItem(profile, 'wings', 'angel-wings')
  const game = createGame(roomId, 'Snow Elf', 0, profile)
  game.width = w
  game.height = 164
  game.layout = layoutFor(w, 164)
  game.self.x = 0.19
  game.self.manual = true
  game.self.nextWander = Infinity
  game.tree = { preview: totals[treeStage] }
  game.stage = treeStage
  for (let i = 0; i < 2; i++) receive(game, { id: `artpeer${i}`, seq: 1, t: 'state', name: i ? 'Merry' : 'Jingle', hat: i + 1, x: 0.44 + i * 0.18, y: 0, dir: i ? -1 : 1, mv: false,
    av: { ...DEFAULT_APPEARANCE, outfit: i + 1, skin: i ? 4 : 2, hairStyle: i ? 'bob' : 'swept', hairColor: i ? 3 : 2, starterHat: !i },
    sh: i ? 'qa-lab-coat' : 'epc-workshop-hoodie',
    wg: i ? 'dragon-wings' : 'prism-wings',
  }, net)
  for (let i = 0; i < 3; i++) game.presents.set(`artgift${i}`, { pid: `artgift${i}`, x: 0.32 + i * 0.2, height: 0, vy: 0, color: i, tier: i * 2, epc: null, origin: null, landedAt: 0, born: 0, phase: i * 1.2 })
  game.floaters = []
  game.particles = []
  return game
}

let game: Game
function configure() {
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
  game = example(room.value, Number(width.value), Number(stage.value) as TreeStage)
  const ratio = Number(dpr.value)
  panel.width = game.width * ratio
  panel.height = 164 * ratio
  panel.style.width = `${game.width}px`
  panel.style.height = '164px'
  mini.width = 112; mini.height = 30
  zoom.width = 112; zoom.height = 30
  const art = worldArtFor(game.room)
  const palette = element('palette')
  palette.replaceChildren(...[art.wall, art.roof, art.accent].map(color => {
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.background = color
    swatch.title = color
    return swatch
  }))
  element('landmarks').textContent = `${art.label} · ${art.landmarks.join(' · ')}`
  element('panel-shell').querySelector('.preview-toolbar')?.remove()
  element('panel-shell').append(toolbarOverlay())
  paintRoomSheet()
}
for (const control of [room, theme, stage, width, dpr]) control.addEventListener('change', configure)
toolbar.addEventListener('change', () => { document.body.classList.toggle('toolbar-disabled', !toolbar.checked) })
document.body.classList.toggle('toolbar-disabled', !toolbar.checked)
showRooms.addEventListener('click', () => {
  sheet.hidden = !sheet.hidden
  element('sheet-intro').hidden = sheet.hidden
  showRooms.setAttribute('aria-expanded', String(!sheet.hidden))
  showRooms.textContent = sheet.hidden ? 'Inspect all 8 rooms' : 'Hide room sheet'
  paintRoomSheet()
})
configure()
panel.addEventListener('pointerdown', ev => { game.self.walkTo = (ev.clientX - panel.getBoundingClientRect().left) / game.width; panel.focus() })
panel.addEventListener('keydown', ev => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyF'].includes(ev.code)) ev.preventDefault()
  if (ev.code === 'ArrowLeft') game.keys.left = true
  if (ev.code === 'ArrowRight') game.keys.right = true
  if (ev.code === 'Space') game.jumpQueued = true
  if (ev.code === 'KeyF') throwSnowball(game, net, performance.now())
})
panel.addEventListener('keyup', ev => {
  if (ev.code === 'ArrowLeft') game.keys.left = false
  if (ev.code === 'ArrowRight') game.keys.right = false
})
panel.addEventListener('blur', () => { game.keys.left = false; game.keys.right = false })
let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  step(game, dt, now, true, net)
  renderPanel(panel.getContext('2d')!, game, now, Number(dpr.value))
  renderMini(mini.getContext('2d')!, game, now, 1, 112, 30)
  zoom.getContext('2d')!.drawImage(mini, 0, 0)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

/** Coverage checks use alpha and extents, so palette changes cannot invalidate them. */
function checkSilhouette(label: string, w: number, h: number, minimumPixels: number, minimumHeight: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const pixels = ctx.getImageData(0, 0, w, h).data
  let coverage = 0, top = h, bottom = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (pixels[(y * w + x) * 4 + 3] < 80) continue
    coverage++
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  if (coverage < minimumPixels || bottom - top + 1 < minimumHeight) throw new Error(`${label}: incomplete silhouette (${coverage} pixels, ${Math.max(0, bottom - top + 1)}px tall)`)
}

element('checks').addEventListener('click', () => {
  const originalDark = document.documentElement.classList.contains('dark')
  let cases = 0
  try {
    for (const key of Object.keys(WORLD_ART)) for (const dark of [false, true]) for (const treeStage of [0, 1, 2, 3] as const) for (const w of [920, 360]) {
      const ratio = w === 360 ? 2 : 1
      document.documentElement.classList.toggle('dark', dark)
      const test = example(roomIdFor(key), w, treeStage)
      const canvas = document.createElement('canvas'); canvas.width = w * ratio; canvas.height = 164 * ratio
      const ctx = canvas.getContext('2d')!
      renderPanel(ctx, test, 20_000, ratio)
      if (ctx.getImageData(2, 2, 1, 1).data[3] !== 255 || ctx.getImageData(2, 163 * ratio, 1, 1).data[3] !== 255) throw new Error(`${key}: expanded did not fill sky and snow`)
      const chip = document.createElement('canvas'); chip.width = 112; chip.height = 30
      const chipCtx = chip.getContext('2d')!
      renderMini(chipCtx, test, 20_000, 1, 112, 30)
      if (chipCtx.getImageData(2, 29, 1, 1).data[3] !== 255) throw new Error(`${key}: miniature snow missing`)
      if (test.layout.groundY !== 157 || test.layout.elfH !== 45 || test.layout.treeH !== 100) throw new Error('Gameplay layout changed')
      cases++
    }
    let silhouettes = 0
    for (const dark of [false, true]) for (const treeStage of [0, 1, 2, 3] as const) for (const height of [23, 100]) {
      const small = height === 23
      checkSilhouette(`${small ? 'Mini' : 'Expanded'} tree stage ${treeStage}`, small ? 48 : 180, small ? 36 : 164, small ? 40 : 300, height * 0.65, ctx => {
        drawTree(ctx, { cx: small ? 24 : 90, groundY: small ? 30 : 157, height, ornaments: totals[treeStage], stage: treeStage, celebrate: 0 }, 20, dark)
      })
      silhouettes++
    }
    for (const dark of [false, true]) for (const px of [1, 3]) {
      checkSilhouette(`${px === 1 ? 'Mini' : 'Expanded'} elf`, 70, 80, px === 1 ? 12 : 120, px * 11, ctx => {
        drawElf(ctx, { px, x: 35, groundY: 72, lift: 0, dir: 1, outfit: 0, pose: 'idle', bigHat: false, hatItem: null, label: null, trim: null, self: true, bell: 0 }, 20, dark)
      })
      silhouettes++
    }
    results.textContent = `PASS · ${cases} combinations: 8 rooms × 2 themes × 4 stages × 2 widths.\nExpanded 164px and miniature 112×30 painted; DPR 1/2; ground and gameplay layout intact.\n${silhouettes} tree / elf silhouette checks passed at miniature and expanded scale.\nToolbar reference is pointer-transparent; inspect readability with the overlay and room sheet.`
  } catch (error) { results.textContent = `FAIL · ${String(error)}` }
  finally { document.documentElement.classList.toggle('dark', originalDark) }
})

element('benchmark').addEventListener('click', () => {
  const test = example(room.value, 920, 3)
  const canvas = document.createElement('canvas'); canvas.width = 1840; canvas.height = 328
  const ctx = canvas.getContext('2d')!
  const chip = document.createElement('canvas'); chip.width = 112; chip.height = 30
  const chipCtx = chip.getContext('2d')!
  for (let i = 0; i < 10; i++) { renderPanel(ctx, test, i * 16, 2); renderMini(chipCtx, test, i * 16, 1, 112, 30) }
  const measure = (draw: (now: number) => void) => {
    const samples = Array.from({ length: 180 }, (_, i) => { const start = performance.now(); draw(i * 16); return performance.now() - start }).sort((a, b) => a - b)
    return `mean ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2)}ms · p95 ${samples[Math.floor(samples.length * 0.95)].toFixed(2)}ms`
  }
  results.textContent = `Paint CPU · 180 warm frames · 3 winged elves / 3 gifts / stage 3\nExpanded 920×164 @ DPR2: ${measure(now => renderPanel(ctx, test, now, 2))}\nCollapsed 112×30: ${measure(now => renderMini(chipCtx, test, now, 1, 112, 30))}\nMeasures drawing calls on this machine, not end-to-end FPS or GPU presentation.`
})

