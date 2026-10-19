/**
 * Simulation, networking, and rendering for the workshop floor. Positions are fractions of
 * the floor width so players with different window sizes agree; physics runs in canvas
 * pixels of the expanded panel, whether or not it is currently visible.
 */
import type { WorkshopActivity } from '@/lib/workshop-activity'
import { DEFAULT_APPEARANCE, isElfAppearance, parseElfAppearance, type ElfAppearance } from '@/lib/workshop-appearance'
import {
  ITEM_BY_ID,
  RARITY_INFO,
  luckForTagCount,
  rarityAt,
  rarityIndex,
  rollItem,
  rollRarity,
  wearableOrNull,
  type ItemDef,
  type Rarity,
  type WearableKind,
} from '@/lib/workshop-items'
import {
  ACHIEVEMENT_BY_ID,
  addToBag,
  claimDaily,
  consumeFromBag,
  dailyMinRarity,
  equipItem,
  prestige,
  returnToBag,
  saveProfile,
  setTitle,
  takeFromBag,
  unlockAchievements,
  type ItemOrigin,
  type WorkshopProfile,
} from '@/lib/workshop-profile'
import {
  WORKSHOP_MAX_TREE_ENTRIES,
  WORKSHOP_PRESENT_COLORS,
  sanitizeWorkshopChat,
  sanitizeWorkshopLetter,
  type WorkshopMessage,
  type WorkshopPayload,
  type WorkshopScore,
} from '@/lib/workshop-protocol'
import {
  loadWorkshopDay,
  mergeTreeCounts,
  randomWorkshopToken,
  scoreTotal,
  topTreeEntries,
  treeStage,
  treeTotal,
  workshopDayKey,
  type TreeStage,
} from '@/lib/workshop-state'
import {
  acceptTrade,
  cancelTrade,
  lockIn,
  offerItems,
  openTrade,
  partnerLeft,
  receiveTrade,
  tickTrade,
  type TradeCloseReason,
  type TradePhase,
  type TradeResult,
  type TradeSession,
} from '@/lib/workshop-trade'
import {
  ELF_ROWS,
  EMOTES,
  PRESENT_ROWS,
  drawBeam,
  drawDizzy,
  drawElf,
  drawFloaters,
  drawGlow,
  drawGround,
  drawItem,
  drawParticles,
  drawPresent,
  drawSky,
  drawSnowball,
  drawTrain,
  drawTree,
  itemHeight,
  itemWidth,
  type ElfPose,
  type Floater,
  type Particle,
} from './workshop-draw'
import { chatBubble, crispScale, drawHexText, drawPixelSprite, hexTextWidth, iconBubble, pixelBanner } from './workshop-pixel'
import { CHARACTER_STRIDE_PX } from './workshop-character-art'
import { playBell, playBlip, playChime, playFanfare, playLoot, playSplat, playThrow, playUnlock } from './workshop-sound'

export const PANEL_H = 164
export const MINI_W = 112
export const MINI_H = 30
export const PEER_TIMEOUT_MS = 5000
export const JOIN_QUIET_MS = 3000
/** Others besides yourself. The server refuses a 49th person, so nobody in the room is hidden. */
export const MAX_PEERS = 47
export const ROOM_CAP = 48
const TRADE_HOLD_MS = 20_000

const GROUND_INSET = 7
const WALK_PX_PER_S = 125
const GRAVITY = 1400
const PRESENT_GRAVITY = 900
const HEARTBEAT_MS = 900
const MOVE_SEND_MS = 60
const PRESENT_COOLDOWN_MS = 4000
const PRESENT_TTL_MS = 10 * 60_000
const MAX_PRESENTS = 24
const MAX_PERSONAL = 6
const MAX_FLOOR_ITEMS = 32
const BELL_MS = 1500
const CHAT_GAP_MS = 900
const CHAT_BURST = 5
const CHAT_WINDOW_MS = 20_000
const CHAT_LOG_MAX = 40
const EMOTE_MS = 2600
const EMOTE_GAP_MS = 500
const SNOW_GAP_MS = 900
const SNOW_SPEED = 300
const SNOW_LIFT = 170
const SNOW_GRAVITY = 600
const DIZZY_MS = 1400
const ESCROW_MS = 3 * 60_000
const CLAIM_RETRY_MS = 700
const GRANT_RESENDS = 3
const OWN_DROP_GRACE_MS = 1500
const JINGLE_CHANCE = 0.2
const MAX_BANNERS = 2
const CLOSED_TRADE_MS = 10_000

const GOLD = '#e0a526'
const BLUE = '#3b82f6'
const RED = '#dc2626'
const GREEN = '#22c55e'

const MILESTONES: Record<TreeStage, { text: string; gift: Rarity }> = {
  0: { text: '', gift: 'common' },
  1: { text: 'The tree got its star!', gift: 'uncommon' },
  2: { text: 'Lights on!', gift: 'rare' },
  3: { text: 'All aboard the tree train!', gift: 'epic' },
}

export type Equip = Record<WearableKind, string | null>

type ElfBase = {
  /** Supplied by the authenticated cloud directory, never by gameplay packets. */
  cloudKing?: boolean
  cloudTitle?: string
  signedIn?: boolean
  id: string
  name: string
  hat: number
  appearance: ElfAppearance
  x: number
  lift: number
  dir: 1 | -1
  moving: boolean
  walk: number
  score: WorkshopScore
  bellUntil: number
  equip: Equip
  /** Achievement id shown as the player's title. */
  title: string
  prestige: number
  chat: { text: string; at: number; until: number } | null
  emote: { e: number; at: number } | null
  dizzyUntil: number
  /** Pet position in canvas pixels; lags behind the elf. */
  petX: number | null
  trailAcc: number
}

export type SelfElf = ElfBase & {
  jumpV: number
  wingJumped: boolean
  walkTo: number | null
  manual: boolean
  nextWander: number
  chatTimes: number[]
  lastEmote: number
  lastSnow: number
  /** Until this time, walk/jump multipliers from a drink or snack apply. */
  buffUntil: number
  buffSpeed: number
  buffJump: number
}

export type PeerElf = ElfBase & { targetX: number; targetLift: number; mv: boolean; seen: number }
export type Elf = SelfElf | PeerElf

type Present = {
  pid: string
  x: number
  /** Pixels above the ground. */
  height: number
  vy: number
  color: number
  tier: number
  epc: string | null
  /** Set for presents only this device can see and open (daily, milestone, jingle gifts). */
  origin: ItemOrigin | null
  landedAt: number | null
  born: number
  phase: number
}

type FloorItem = {
  did: string
  item: string
  owner: string
  ownerName: string
  x: number
  height: number
  vy: number
  landedAt: number | null
  born: number
  claimAt: number
  phase: number
  note?: string
}

type Snowball = { x: number; h: number; vx: number; vy: number; from: string; alive: boolean }
type Banner = { text: string; color: string; age: number; ttl: number }
export type ChatLine = { key: number; id: string; name: string; text: string; self: boolean }

export type Layout = {
  px: number
  elfH: number
  presentH: number
  groundY: number
  treeH: number
  treeCx: number
  maxJump: number
}

export type GameEvent =
  | { kind: 'found'; item: string; rarity: number; by: string; self: boolean }
  | { kind: 'gift'; item: string; from: string; note?: string }
  | { kind: 'achievement'; id: string }
  | { kind: 'trade'; tid: string; phase: TradePhase; partnerName: string; reason: TradeCloseReason | null }
  | { kind: 'chat'; name: string; self: boolean }
  | { kind: 'daily'; streak: number }

export type Game = {
  room: string
  self: SelfElf
  peers: Map<string, PeerElf>
  seqs: Map<string, number>
  presents: Map<string, Present>
  opened: Set<string>
  floorItems: Map<string, FloorItem>
  /** Floor drops that were granted or removed, so late duplicates don't resurrect them. */
  settled: Set<string>
  /** Our own floor drops already handed out: did → recipient. */
  granted: Map<string, string>
  grantQueue: { did: string; to: string; left: number; next: number }[]
  snowballs: Snowball[]
  particles: Particle[]
  floaters: Floater[]
  banners: Banner[]
  chatLog: ChatLine[]
  chatKey: number
  tree: Record<string, number>
  stage: TreeStage
  celebrateUntil: number
  quietUntil: number
  keys: { left: boolean; right: boolean }
  jumpQueued: boolean
  seq: number
  lastSent: number
  lastFull: number
  wasActive: boolean
  lastDrop: number
  dayKey: string
  dirty: boolean
  leader: string | null
  width: number
  height: number
  layout: Layout
  profile: WorkshopProfile
  profileDirty: boolean
  trade: TradeSession | null
  /** Epoch ms until which a missing partner does not cancel the trade. */
  tradeHeld: number | null
  events: GameEvent[]
  /** Bumped whenever something the React UI shows (bag, trade, roster extras) changes. */
  version: number
}

export type Net = { send: (payload: WorkshopPayload) => void; sound: boolean }

export type RosterEntry = {
  id: string
  name: string
  score: WorkshopScore
  self: boolean
  leader: boolean
  title: string | null
  prestige: number
  equip: Equip
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round4 = (v: number) => Math.round(v * 10_000) / 10_000
const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
const rarityColor = (tier: number) => RARITY_INFO[rarityAt(tier)].color

export function layoutFor(width: number, height: number): Layout {
  const groundY = height - GROUND_INSET
  const px = height >= 90 ? 3 : 2
  const elfH = ELF_ROWS * px
  return {
    px,
    elfH,
    presentH: PRESENT_ROWS * px,
    groundY,
    treeH: clamp(height - 34, 24, 100),
    treeCx: width - 56,
    maxJump: clamp(groundY - elfH - 22, 6, 46),
  }
}

function poseFor(elf: ElfBase): ElfPose {
  if (!elf.moving) return 'idle'
  return Math.floor(elf.walk / (CHARACTER_STRIDE_PX / 2)) % 2 === 0 ? 'stepA' : 'stepB'
}

function elfBase(id: string, name: string, hat: number, x: number, dir: 1 | -1, score: WorkshopScore): ElfBase {
  return {
    id,
    name,
    hat,
    appearance: { ...DEFAULT_APPEARANCE, outfit: hat },
    x,
    lift: 0,
    dir,
    moving: false,
    walk: 0,
    score,
    bellUntil: 0,
    equip: { hat: null, pet: null, trail: null, shirt: null, wings: null, mount: null, title: null },
    title: '',
    prestige: 0,
    chat: null,
    emote: null,
    dizzyUntil: 0,
    petX: null,
    trailAcc: 0,
  }
}

export function createGame(room: string, name: string, hat: number, profile: WorkshopProfile): Game {
  const dayKey = workshopDayKey(room)
  const day = loadWorkshopDay(dayKey)
  const now = performance.now()
  const game: Game = {
    room,
    self: {
      ...elfBase(randomWorkshopToken(12), name, hat, 0.1 + Math.random() * 0.4, 1, day.me),
      jumpV: 0,
      wingJumped: false,
      walkTo: null,
      manual: false,
      nextWander: now + 6000 + Math.random() * 6000,
      chatTimes: [],
      lastEmote: -Infinity,
      lastSnow: -Infinity,
      buffUntil: 0,
      buffSpeed: 1,
      buffJump: 1,
    },
    peers: new Map(),
    seqs: new Map(),
    presents: new Map(),
    opened: new Set(),
    floorItems: new Map(),
    settled: new Set(),
    granted: new Map(),
    grantQueue: [],
    snowballs: [],
    particles: [],
    floaters: [],
    banners: [],
    chatLog: [],
    chatKey: 0,
    tree: day.tree,
    stage: treeStage(treeTotal(day.tree)),
    celebrateUntil: 0,
    quietUntil: now + JOIN_QUIET_MS,
    keys: { left: false, right: false },
    jumpQueued: false,
    seq: 0,
    lastSent: 0,
    lastFull: 0,
    wasActive: false,
    lastDrop: -Infinity,
    dayKey,
    dirty: false,
    leader: null,
    width: 0,
    height: PANEL_H,
    layout: layoutFor(800, PANEL_H),
    profile,
    profileDirty: false,
    trade: null,
    tradeHeld: null,
    events: [],
    version: 0,
  }
  syncSelf(game)
  return game
}

/** Copies what other players see of our profile onto our elf and re-announces it. */
export function syncSelf(game: Game) {
  const p = game.profile
  game.self.appearance = parseElfAppearance(p.appearance)
  game.self.hat = game.self.appearance.outfit
  game.self.equip = { ...p.equipped }
  game.self.title = p.title ?? ''
  game.self.prestige = prestige(p)
  game.lastFull = 0
  game.version += 1
}

/** Free base cosmetics are separate from owned, tradeable wardrobe equipment. */
export function customizeElf(game: Game, appearance: ElfAppearance): boolean {
  if (!isElfAppearance(appearance)) return false
  game.profile.appearance = parseElfAppearance(appearance)
  game.profile.appearanceAt = Date.now()
  syncSelf(game)
  markProfile(game, true)
  return true
}

function markProfile(game: Game, immediate: boolean) {
  game.version += 1
  if (immediate) {
    saveProfile(game.profile)
    game.profileDirty = false
  } else {
    game.profileDirty = true
  }
}

export function flushProfile(game: Game) {
  if (!game.profileDirty) return
  saveProfile(game.profile)
  game.profileDirty = false
}

function sprinkle(game: Game, x: number, y: number, colors: readonly string[], count: number, speed: number, gravity: number) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * (0.1 + 0.8 * Math.random())
    const v = speed + Math.random() * 60
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      age: 0,
      ttl: 0.55 + Math.random() * 0.6,
      size: Math.random() < 0.4 ? 2 : 1,
      color: colors[i % colors.length],
      gravity,
    })
  }
  if (game.particles.length > 500) game.particles.splice(0, game.particles.length - 500)
}

function burst(game: Game, x: number, y: number, kind: 'snow' | 'gold' | 'confetti') {
  if (kind === 'snow') sprinkle(game, x, y, ['#ffffff', '#e8f1fa', '#cfe2f3'], 16, 40, 90)
  else if (kind === 'gold') sprinkle(game, x, y, ['#ffe28a', '#f5c542', '#ffffff'], 16, 40, 220)
  else sprinkle(game, x, y, ['#e63946', '#f4c542', '#4ea8ff', '#9dff8a', '#ff7eb6'], 36, 70, 220)
}

function float(game: Game, text: string, x: number, y: number, color: string) {
  game.floaters.push({ text, x: clamp(x, 70, Math.max(70, game.width - 70)), y, age: 0, ttl: 1.8, color })
}

function banner(game: Game, text: string, color: string) {
  game.banners.push({ text, color, age: 0, ttl: 3.4 })
  if (game.banners.length > MAX_BANNERS) game.banners.shift()
}

function headY(game: Game, e: ElfBase) {
  return game.layout.groundY - e.lift - game.layout.elfH - 12
}

function checkAchievements(game: Game, net: Net) {
  const fresh = unlockAchievements(game.profile)
  if (fresh.length === 0) return
  for (const id of fresh) {
    const a = ACHIEVEMENT_BY_ID.get(id)
    if (!a) continue
    banner(game, `Achievement: ${a.name}`, '#fbbf24')
    game.events.push({ kind: 'achievement', id })
  }
  if (net.sound) playUnlock()
  markProfile(game, true)
}

function treeChanged(game: Game, net: Net) {
  game.dirty = true
  const stage = treeStage(treeTotal(game.tree))
  const now = performance.now()
  if (stage > game.stage && now > game.quietUntil) {
    const L = game.layout
    game.celebrateUntil = now + 1200
    burst(game, L.treeCx, L.groundY - L.treeH, 'confetti')
    banner(game, MILESTONES[stage].text, GOLD)
    if (net.sound) playFanfare()
    spawnPersonal(game, rollRarity(Math.random, 0.15, MILESTONES[stage].gift), 'milestone', null, net, now)
  }
  game.stage = stage
}

type PresentSpec = { pid: string; x: number; color: number; tier: number; epc: string | null; origin: ItemOrigin | null }

function addPresent(game: Game, spec: PresentSpec, now: number) {
  if (game.opened.has(spec.pid) || game.presents.has(spec.pid)) return
  let shared = 0
  let personal = 0
  for (const p of game.presents.values()) {
    if (p.origin) personal++
    else shared++
  }
  if (spec.origin ? personal >= MAX_PERSONAL : shared >= MAX_PRESENTS) return
  game.presents.set(spec.pid, {
    ...spec,
    height: game.layout.groundY + 4,
    vy: 0,
    landedAt: null,
    born: now,
    phase: Math.random() * 6,
  })
}

/** A present only this device sees, landing near the player. */
function spawnPersonal(game: Game, rarity: Rarity, origin: ItemOrigin, label: string | null, net: Net, now: number) {
  const s = game.self
  const x = round4(clamp(s.x + (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.06), 0.04, 0.8))
  addPresent(game, { pid: `g${randomWorkshopToken(9)}`, x, color: Math.floor(Math.random() * WORKSHOP_PRESENT_COLORS), tier: rarityIndex(rarity), epc: null, origin }, now)
  if (label) banner(game, label, rarityColor(rarityIndex(rarity)))
  if (net.sound) playChime()
}

function openPresent(game: Game, pid: string, mine: boolean, net: Net) {
  if (game.opened.has(pid)) return
  if (game.opened.size > 2000) game.opened.clear()
  game.opened.add(pid)
  const L = game.layout
  const present = game.presents.get(pid)
  if (present) {
    game.presents.delete(pid)
    burst(game, present.x * game.width, L.groundY - 8, 'gold')
  }
  if (!mine || !present) return

  const s = game.self
  const p = game.profile
  const rarity = rarityAt(present.tier)
  const def = rollItem(Math.random, rarity)
  const entry = addToBag(p, def.id, present.origin ?? 'present', { now: Date.now() })
  p.stats.opened += 1
  s.score[2] += 1
  game.tree[s.id] = (game.tree[s.id] ?? 0) + 1
  if (!present.origin) net.send({ t: 'open', pid })

  const x = present.x * game.width
  const color = RARITY_INFO[rarity].color
  if (entry) {
    float(game, def.name, x, L.groundY - L.elfH - 14, color)
    if (present.epc) float(game, `READ …${present.epc}`, x, L.groundY - L.elfH - 30, '#10b981')
    if (present.tier >= 2) banner(game, `${RARITY_INFO[rarity].label}! ${def.name}`, color)
    if (present.tier >= 3) burst(game, x, L.groundY - 10, 'confetti')
    if (net.sound) playLoot(present.tier)
    net.send({ t: 'found', item: def.id, r: present.tier })
    game.events.push({ kind: 'found', item: def.id, rarity: present.tier, by: s.name, self: true })
  } else {
    float(game, 'Bag full!', x, L.groundY - L.elfH - 14, RED)
  }
  game.lastFull = 0
  syncSelf(game)
  markProfile(game, true)
  treeChanged(game, net)
  checkAchievements(game, net)
}

function showChat(game: Game, elf: ElfBase, text: string, now: number, self: boolean) {
  const len = Array.from(text).length
  elf.chat = { text, at: now, until: now + clamp(3500 + len * 70, 3500, 9000) }
  game.chatKey += 1
  game.chatLog.push({ key: game.chatKey, id: elf.id, name: elf.name, text, self })
  if (game.chatLog.length > CHAT_LOG_MAX) game.chatLog.splice(0, game.chatLog.length - CHAT_LOG_MAX)
  game.events.push({ kind: 'chat', name: elf.name, self })
  game.version += 1
}

function spawnSnowball(game: Game, from: ElfBase, x: number, dir: 1 | -1) {
  const L = game.layout
  game.snowballs.push({
    x: x * game.width + dir * L.px * 4,
    h: from.lift + L.elfH * 0.55,
    vx: dir * SNOW_SPEED,
    vy: SNOW_LIFT,
    from: from.id,
    alive: true,
  })
}

function removePeer(game: Game, id: string, now: number) {
  const peer = game.peers.get(id)
  if (!peer) return
  game.peers.delete(id)
  burst(game, peer.x * game.width, game.layout.groundY - 12, 'snow')
  for (const [did, item] of game.floorItems) {
    if (item.owner === id) {
      game.floorItems.delete(did)
      game.settled.add(did)
    }
  }
  if (game.trade?.partner === id && (game.trade.phase === 'open' || game.trade.phase === 'outgoing' || game.trade.phase === 'incoming')) {
    game.tradeHeld = now + TRADE_HOLD_MS
    game.version += 1
  }
  game.version += 1
}

function applyTrade(game: Game, r: TradeResult, net: Net) {
  r.out.forEach((m) => net.send(m))
  const before = game.trade
  if (r.commit && r.session) {
    const p = game.profile
    for (const uid of r.commit.uids) takeFromBag(p, uid)
    for (const item of r.commit.items) addToBag(p, item, 'trade', { by: r.session.partnerName, force: true })
    p.stats.trades += 1
    p.stats.given += r.commit.uids.length
    p.stats.received += r.commit.items.length
    syncSelf(game)
    markProfile(game, true)
    banner(game, `Trade with ${r.session.partnerName} complete!`, GREEN)
    burst(game, game.self.x * game.width, headY(game, game.self), 'confetti')
    if (net.sound) playChime()
    checkAchievements(game, net)
  }
  game.trade = r.session
  if (r.session && (before?.tid !== r.session.tid || before.phase !== r.session.phase)) {
    game.events.push({ kind: 'trade', tid: r.session.tid, phase: r.session.phase, partnerName: r.session.partnerName, reason: r.session.reason })
  }
  if (before !== r.session) game.version += 1
}

/** Hands one of our floor drops to `to` (ourselves for a reclaim) and tells everyone. */
function grant(game: Game, did: string, to: string, net: Net, now: number) {
  const p = game.profile
  const index = p.escrow.findIndex((e) => e.did === did)
  if (index < 0) return
  const [held] = p.escrow.splice(index, 1)
  const self = to === game.self.id
  if (self) returnToBag(p, held.entry)
  else p.stats.given += 1
  game.granted.set(did, to)
  if (game.granted.size > 200) game.granted.delete(game.granted.keys().next().value as string)
  game.settled.add(did)
  const item = game.floorItems.get(did)
  game.floorItems.delete(did)
  if (item) burst(game, item.x * game.width, game.layout.groundY - 8, self ? 'snow' : 'gold')
  net.send({ t: 'grant', did, to })
  game.grantQueue.push({ did, to, left: GRANT_RESENDS, next: now + 250 })
  if (self) syncSelf(game)
  markProfile(game, true)
  if (!self) checkAchievements(game, net)
}

export function receive(game: Game, msg: WorkshopMessage, net: Net) {
  if (msg.id === game.self.id) return
  // Multi-adapter machines can hear the same datagram more than once.
  const last = game.seqs.get(msg.id)
  if (last !== undefined && msg.seq <= last) return
  if (game.seqs.size > 256) game.seqs.clear()
  game.seqs.set(msg.id, msg.seq)

  const now = performance.now()
  const L = game.layout
  let peer = game.peers.get(msg.id)
  if (peer) peer.seen = now

  switch (msg.t) {
    case 'state': {
      if (!peer) {
        if (game.peers.size >= MAX_PEERS) return
        peer = {
          ...elfBase(msg.id, msg.name, msg.hat, msg.x, msg.dir, msg.s ?? [0, 0, 0]),
          targetX: msg.x,
          targetLift: 0,
          mv: false,
          seen: now,
        }
        game.peers.set(msg.id, peer)
        burst(game, msg.x * game.width, L.groundY - 12, 'snow')
        float(game, `${msg.name} joined`, msg.x * game.width, L.groundY - L.elfH - 12, BLUE)
        game.version += 1
      }
      peer.name = msg.name
      peer.hat = msg.hat
      peer.appearance = msg.av ? parseElfAppearance(msg.av) : { ...peer.appearance, outfit: msg.hat }
      peer.targetX = msg.x
      peer.targetLift = msg.y
      peer.dir = msg.dir
      peer.mv = msg.mv
      if (msg.s) peer.score = msg.s
      if (msg.eq) {
        peer.equip = {
          hat: wearableOrNull(msg.eq[0], 'hat'),
          pet: wearableOrNull(msg.eq[1], 'pet'),
          trail: wearableOrNull(msg.eq[2], 'trail'),
          shirt: peer.equip.shirt,
          wings: peer.equip.wings,
          mount: peer.equip.mount,
          title: peer.equip.title,
        }
      }
      if (msg.sh !== undefined) peer.equip.shirt = wearableOrNull(msg.sh, 'shirt')
      if (msg.wg !== undefined) peer.equip.wings = wearableOrNull(msg.wg, 'wings')
      if (msg.ti !== undefined) peer.title = ACHIEVEMENT_BY_ID.has(msg.ti) ? msg.ti : ''
      if (msg.pf !== undefined) peer.prestige = msg.pf
      if (msg.tree && mergeTreeCounts(game.tree, msg.tree)) treeChanged(game, net)
      return
    }
    case 'drop':
      addPresent(game, { pid: msg.pid, x: msg.x, color: msg.c, tier: msg.r ?? 0, epc: msg.epc ?? null, origin: null }, now)
      return
    case 'open':
      openPresent(game, msg.pid, false, net)
      return
    case 'bell':
      if (peer) peer.bellUntil = now + BELL_MS
      if (net.sound) playBell()
      return
    case 'bye':
      removePeer(game, msg.id, now)
      return
    case 'chat':
      if (!peer || (peer.chat && now - peer.chat.at < 500)) return
      showChat(game, peer, msg.text, now, false)
      if (net.sound) playBlip()
      return
    case 'emote':
      if (peer && (!peer.emote || now - peer.emote.at > 300)) peer.emote = { e: msg.e, at: now }
      return
    case 'snow':
      if (peer) spawnSnowball(game, peer, msg.x, msg.dir)
      return
    case 'found': {
      if (!peer) return
      const def = ITEM_BY_ID.get(msg.item)
      const color = rarityColor(msg.r)
      const label = def?.name ?? 'a mystery item'
      float(game, label, peer.x * game.width, headY(game, peer) - 6, color)
      if (msg.r >= 3) {
        banner(game, `${peer.name} found ${label}!`, color)
        burst(game, peer.x * game.width, headY(game, peer), 'confetti')
      }
      game.events.push({ kind: 'found', item: msg.item, rarity: msg.r, by: peer.name, self: false })
      return
    }
    case 'idrop': {
      if (!peer || !ITEM_BY_ID.has(msg.item) || game.settled.has(msg.did) || game.floorItems.has(msg.did)) return
      if (game.floorItems.size >= MAX_FLOOR_ITEMS) return
      game.floorItems.set(msg.did, {
        did: msg.did,
        item: msg.item,
        owner: msg.id,
        ownerName: peer.name,
        x: msg.x,
        height: L.elfH * 0.6,
        vy: -170,
        landedAt: null,
        born: now,
        claimAt: 0,
        phase: Math.random() * 6,
        ...(msg.note ? { note: msg.note } : {}),
      })
      return
    }
    case 'claim': {
      if (msg.owner !== game.self.id) return
      const held = game.profile.escrow.find((e) => e.did === msg.did)
      // Placeable décor is owner-only — peers never receive a grant for it.
      if (held && ITEM_BY_ID.get(held.entry.item)?.placeable) return
      if (held) grant(game, msg.did, msg.id, net, now)
      else {
        // Already handed out: repeat the answer so a claimer that missed it stops asking.
        const to = game.granted.get(msg.did)
        if (to) net.send({ t: 'grant', did: msg.did, to })
      }
      return
    }
    case 'grant': {
      const item = game.floorItems.get(msg.did)
      if (game.settled.has(msg.did) || !item || item.owner !== msg.id) return
      game.floorItems.delete(msg.did)
      game.settled.add(msg.did)
      if (game.settled.size > 500) game.settled.clear()
      const x = item.x * game.width
      const def = ITEM_BY_ID.get(item.item)
      if (msg.to === game.self.id && def) {
        addToBag(game.profile, def.id, 'floor', { by: item.ownerName, force: true, note: item.note })
        game.profile.stats.received += 1
        float(game, item.note ? '+ Letter' : `+ ${def.name}`, x, L.groundY - L.elfH - 14, RARITY_INFO[def.rarity].color)
        burst(game, x, L.groundY - 8, 'gold')
        if (net.sound) playLoot(rarityIndex(def.rarity))
        game.events.push({ kind: 'gift', item: def.id, from: item.ownerName, ...(item.note ? { note: item.note } : {}) })
        syncSelf(game)
        markProfile(game, true)
        checkAchievements(game, net)
      } else {
        burst(game, x, L.groundY - 8, 'snow')
        if (msg.to !== item.owner) float(game, `${game.peers.get(msg.to)?.name ?? 'Someone'} grabbed it`, x, L.groundY - L.elfH - 14, BLUE)
      }
      return
    }
    case 'trade':
      applyTrade(game, receiveTrade(game.trade, msg, game.self.id, peer?.name ?? 'Elf', now, (id) => ITEM_BY_ID.has(id)), net)
      return
  }
}

const TRAILS: Record<string, { spacing: number; emit: (game: Game, x: number, y: number) => void }> = {
  'frost-steps': {
    spacing: 9,
    emit: (game, x, y) => {
      for (const dx of [-2, 2]) {
        game.particles.push({ x: x + dx, y: y - 1, vx: 0, vy: 0, age: 0, ttl: 1.6, size: 2, color: dx < 0 ? '#ffffff' : '#bae6fd', gravity: 0 })
      }
    },
  },
  'gold-sparkle': {
    spacing: 7,
    emit: (game, x, y) => {
      for (let i = 0; i < 2; i++) {
        game.particles.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y - Math.random() * 10,
          vx: (Math.random() - 0.5) * 12,
          vy: -18 - Math.random() * 22,
          age: 0,
          ttl: 0.7 + Math.random() * 0.3,
          size: Math.random() < 0.5 ? 2 : 1,
          color: ['#fde68a', '#f5c542', '#ffffff'][i % 3],
          gravity: -8,
        })
      }
    },
  },
  'rf-waves': {
    spacing: 24,
    emit: (game, x, y) => {
      game.particles.push({ x, y: y - game.layout.elfH * 0.75, vx: 0, vy: 0, age: 0, ttl: 0.9, size: 4, color: '#c084fc', gravity: 0, shape: 'ring' })
    },
  },
  'hex-rain': {
    spacing: 12,
    emit: (game, x, y) => {
      game.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y - 6 - Math.random() * 10,
        vx: 0,
        vy: -16 - Math.random() * 12,
        age: 0,
        ttl: 1.1,
        size: 1,
        color: '#4ade80',
        gravity: -4,
        shape: 'glyph',
        glyph: '0123456789ABCDEF'[Math.floor(Math.random() * 16)],
      })
    },
  },
  'barcode-trail': {
    spacing: 18,
    emit: (game, x, y) => {
      const bars = [1, 2, 1, 1, 3, 1, 2, 1]
      let cursor = x - 8
      const top = y - 8
      for (const width of bars) {
        game.particles.push({ x: cursor, y: top, vx: 0, vy: 0, age: 0, ttl: 2.4, size: 1, w: width, h: 8, color: '#111827', gravity: 0 })
        cursor += width + 1
      }
    },
  },
  'dust-trail': {
    spacing: 10,
    emit: (game, x, y) => {
      for (let i = 0; i < 3; i++) {
        game.particles.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y - 1 - Math.random() * 4,
          vx: (Math.random() - 0.5) * 8,
          vy: -6 - Math.random() * 8,
          age: 0,
          ttl: 0.8,
          size: 2,
          color: '#d6d3d1',
          gravity: 12,
        })
      }
    },
  },
  'neon-trail': {
    spacing: 8,
    emit: (game, x, y) => {
      game.particles.push({
        x,
        y: y - 2,
        vx: 0,
        vy: 0,
        age: 0,
        ttl: 1.4,
        size: 3,
        color: Math.random() < 0.5 ? '#f472b6' : '#22d3ee',
        gravity: 0,
      })
    },
  },
  'comet-trail': {
    spacing: 6,
    emit: (game, x, y) => {
      game.particles.push({
        x,
        y: y - 4 - Math.random() * 8,
        vx: (Math.random() - 0.5) * 10,
        vy: -10 - Math.random() * 16,
        age: 0,
        ttl: 0.6,
        size: Math.random() < 0.4 ? 2 : 1,
        color: Math.random() < 0.5 ? '#ffffff' : '#fbbf24',
        gravity: 20,
      })
    },
  },
}

function updateCosmetics(game: Game, e: ElfBase, moved: number, dt: number) {
  const L = game.layout
  const pet = e.equip.pet ? ITEM_BY_ID.get(e.equip.pet) : undefined
  if (pet) {
    const beside = e.x * game.width - e.dir * (L.px * 6 + itemWidth(pet, L.px) / 2)
    const target = pet.mount ? e.x * game.width : beside
    const follow = pet.mount ? 14 : 5
    e.petX = e.petX === null ? target : e.petX + (target - e.petX) * Math.min(1, dt * follow)
  } else {
    e.petX = null
  }
  const trail = e.equip.trail ? TRAILS[e.equip.trail] : undefined
  if (!trail || moved <= 0 || e.lift > 2) return
  e.trailAcc += moved
  while (e.trailAcc >= trail.spacing) {
    e.trailAcc -= trail.spacing
    trail.emit(game, e.x * game.width - e.dir * L.px * 2, L.groundY)
  }
}

export function step(game: Game, dt: number, now: number, focused: boolean, net: Net) {
  const L = game.layout
  const width = game.width
  const s = game.self

  const input = (game.keys.right ? 1 : 0) - (game.keys.left ? 1 : 0)
  if (input !== 0 || game.jumpQueued) {
    s.manual = true
    s.nextWander = now + 8000 + Math.random() * 8000
  }
  let dir = 0
  if (input !== 0) {
    s.walkTo = null
    dir = input
  } else if (s.walkTo !== null) {
    const dx = (s.walkTo - s.x) * width
    if (Math.abs(dx) < 2) s.walkTo = null
    else dir = Math.sign(dx)
  }
  const dizzy = now < s.dizzyUntil
  const buffed = now < s.buffUntil
  const speedMul = (dizzy ? 0.35 : 1) * (buffed ? s.buffSpeed : 1)
  const jumpMul = buffed ? s.buffJump : 1
  let selfMoved = 0
  if (dir !== 0) {
    const nx = clamp(s.x + (dir * WALK_PX_PER_S * speedMul * dt) / width, 0.02, 0.98)
    selfMoved = Math.abs(nx - s.x) * width
    s.walk += selfMoved
    s.x = nx
    s.dir = dir > 0 ? 1 : -1
    s.moving = true
  } else {
    s.moving = false
  }

  if (s.lift === 0) s.wingJumped = false
  if (game.jumpQueued && !dizzy) {
    if (s.lift === 0) s.jumpV = Math.sqrt(2 * GRAVITY * L.maxJump * jumpMul)
    else if (s.equip.wings && !s.wingJumped) {
      s.jumpV = Math.sqrt(2 * GRAVITY * L.maxJump * 0.75 * jumpMul)
      s.wingJumped = true
      burst(game, s.x * width, L.groundY - s.lift - L.elfH * 0.4, 'gold')
    }
  }
  game.jumpQueued = false
  if (s.lift > 0 || s.jumpV > 0) {
    s.lift = Math.max(0, s.lift + s.jumpV * dt)
    s.jumpV -= GRAVITY * dt
    if (s.lift === 0 && s.jumpV < 0) s.jumpV = 0
  }

  // Idle elves potter about, but only the player's own moves open presents or grab items.
  if (!focused && s.walkTo === null && !s.moving && now > s.nextWander) {
    s.walkTo = 0.05 + Math.random() * 0.7
    s.manual = false
    s.nextWander = now + 9000 + Math.random() * 9000
  }

  for (const p of game.presents.values()) {
    if (now - p.born > PRESENT_TTL_MS) {
      game.presents.delete(p.pid)
      continue
    }
    if (p.landedAt !== null) continue
    p.vy += PRESENT_GRAVITY * dt
    p.height -= p.vy * dt
    if (p.height <= 0) {
      p.height = 0
      if (p.vy > 90) {
        p.vy = -p.vy * 0.3
      } else {
        p.vy = 0
        p.landedAt = now
        burst(game, p.x * width, L.groundY - 2, 'snow')
      }
    }
  }

  for (const item of game.floorItems.values()) {
    if (item.landedAt !== null) continue
    item.vy += PRESENT_GRAVITY * dt
    item.height -= item.vy * dt
    if (item.height <= 0) {
      item.height = 0
      if (item.vy > 120) {
        item.vy = -item.vy * 0.35
      } else {
        item.vy = 0
        item.landedAt = now
      }
    }
  }

  if (s.manual) {
    for (const p of game.presents.values()) {
      const near = Math.abs(p.x - s.x) * width < L.px * 6.5
      const reachable = p.height <= s.lift + L.elfH && p.height + L.presentH >= s.lift
      if (near && reachable) openPresent(game, p.pid, true, net)
    }
    for (const item of game.floorItems.values()) {
      if (item.landedAt === null || Math.abs(item.x - s.x) * width > L.px * 6 || s.lift > L.elfH * 0.6) continue
      // Planted décor stays put. The owner clicks it to take it back; peers cannot claim it.
      if (ITEM_BY_ID.get(item.item)?.placeable) continue
      if (item.owner === s.id) {
        if (now - item.born > OWN_DROP_GRACE_MS) grant(game, item.did, s.id, net, now)
      } else if (now - item.claimAt > CLAIM_RETRY_MS) {
        item.claimAt = now
        net.send({ t: 'claim', did: item.did, owner: item.owner })
      }
    }
  }

  updateCosmetics(game, s, selfMoved, dt)
  if (game.tradeHeld != null && game.trade && (game.peers.has(game.trade.partner) || now > game.tradeHeld)) {
    if (!game.peers.has(game.trade.partner) && (game.trade.phase === 'open' || game.trade.phase === 'outgoing' || game.trade.phase === 'incoming')) {
      const next = partnerLeft(game.trade, now)
      game.trade = next
      if (next) game.events.push({ kind: 'trade', tid: next.tid, phase: next.phase, partnerName: next.partnerName, reason: next.reason })
    }
    game.tradeHeld = null
    game.version += 1
  }
  for (const [id, p] of game.peers) {
    if (now - p.seen > PEER_TIMEOUT_MS) {
      removePeer(game, id, now)
      continue
    }
    const prev = p.x
    p.x += (p.targetX - p.x) * Math.min(1, dt * 10)
    const moved = Math.abs(p.x - prev) * width
    p.walk += moved
    p.moving = p.mv || moved > 0.35
    p.lift += (p.targetLift * L.maxJump - p.lift) * Math.min(1, dt * 16)
    updateCosmetics(game, p, moved, dt)
  }

  for (const b of game.snowballs) {
    b.x += b.vx * dt
    b.h += b.vy * dt
    b.vy -= SNOW_GRAVITY * dt
    if (b.h <= 0 || b.x < -10 || b.x > width + 10) {
      if (b.h <= 0) sprinkle(game, b.x, L.groundY - 1, ['#ffffff', '#dbeafe'], 8, 25, 120)
      b.alive = false
      continue
    }
    const targets: ElfBase[] = [s, ...game.peers.values()]
    for (const e of targets) {
      if (e.id === b.from) continue
      if (Math.abs(e.x * width - b.x) > L.px * 4 || b.h < e.lift || b.h > e.lift + L.elfH) continue
      b.alive = false
      sprinkle(game, b.x, L.groundY - b.h, ['#ffffff', '#e0f2fe', '#bae6fd'], 18, 50, 160)
      if (net.sound) playSplat()
      if (e === s) {
        s.dizzyUntil = now + DIZZY_MS
        s.walkTo = null
        float(game, 'Bonk!', s.x * width, headY(game, s), '#0ea5e9')
      } else {
        e.dizzyUntil = now + DIZZY_MS
        if (b.from === s.id) {
          game.profile.stats.hits += 1
          markProfile(game, false)
          checkAchievements(game, net)
        }
      }
      break
    }
  }
  game.snowballs = game.snowballs.filter((b) => b.alive)

  if (game.trade) applyTrade(game, tickTrade(game.trade, now), net)
  if (game.trade?.phase === 'closed' && now - game.trade.updatedAt > CLOSED_TRADE_MS) {
    game.trade = null
    game.version += 1
  }

  const wall = Date.now()
  for (const held of [...game.profile.escrow]) {
    if (wall - held.at > ESCROW_MS) {
      const item = game.floorItems.get(held.did)
      grant(game, held.did, s.id, net, now)
      if (item) float(game, 'Back in your bag', item.x * width, L.groundY - L.elfH, BLUE)
    }
  }
  for (const g of game.grantQueue) {
    if (now < g.next) continue
    net.send({ t: 'grant', did: g.did, to: g.to })
    g.left -= 1
    g.next = now + 400
  }
  game.grantQueue = game.grantQueue.filter((g) => g.left > 0)

  for (const p of game.particles) {
    p.age += dt
    p.vy += p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  game.particles = game.particles.filter((p) => p.age < p.ttl)
  for (const f of game.floaters) f.age += dt
  game.floaters = game.floaters.filter((f) => f.age < f.ttl)
  for (const b of game.banners) b.age += dt
  game.banners = game.banners.filter((b) => b.age < b.ttl)
}

export function netTick(game: Game, now: number, send: Net['send']) {
  const s = game.self
  const active = s.moving || s.lift > 0
  const full = now - game.lastFull >= HEARTBEAT_MS
  const due = full || (active && now - game.lastSent >= MOVE_SEND_MS) || (game.wasActive && !active)
  game.wasActive = active
  if (!due) return
  game.lastSent = now
  const payload: Extract<WorkshopPayload, { t: 'state' }> = {
    t: 'state',
    name: s.name,
    hat: s.hat,
    x: round4(s.x),
    y: round4(clamp(s.lift / game.layout.maxJump, 0, 1)),
    dir: s.dir,
    mv: s.moving,
  }
  if (full) {
    game.lastFull = now
    payload.s = [s.score[0], s.score[1], s.score[2]]
    payload.tree = topTreeEntries(game.tree, WORKSHOP_MAX_TREE_ENTRIES)
    payload.eq = [s.equip.hat ?? '', s.equip.pet ?? '', s.equip.trail ?? '']
    payload.ti = s.title
    payload.pf = s.prestige
    payload.sh = s.equip.shirt ?? ''
    payload.wg = s.equip.wings ?? ''
    payload.av = { ...s.appearance }
  }
  send(payload)
}

function epcStub(epc: string | undefined): string | null {
  if (!epc) return null
  const hex = epc.replace(/[^0-9a-f]/gi, '').toUpperCase()
  return hex.length >= 4 ? hex.slice(-4) : null
}

export function handleActivity(game: Game, activity: WorkshopActivity, net: Net, now: number) {
  const s = game.self
  const p = game.profile
  if (activity.kind === 'tags-sent') {
    s.score[0] += 1
    p.stats.sends += 1
    p.stats.tags += Math.max(0,Math.floor(activity.count))
    if (activity.source === 'handheld') p.stats.handheld += 1
    else if (activity.source === 'fixed') p.stats.fixed += 1
    let shared = 0
    for (const present of game.presents.values()) if (!present.origin) shared++
    if (now - game.lastDrop >= PRESENT_COOLDOWN_MS && shared < MAX_PRESENTS) {
      game.lastDrop = now
      const tier = rarityIndex(rollRarity(Math.random, luckForTagCount(activity.count)))
      const pid = randomWorkshopToken(10)
      const x = round4(0.05 + Math.random() * 0.7)
      const c =
        activity.source === 'fixed' ? 0 : activity.source === 'handheld' ? 2 : Math.floor(Math.random() * WORKSHOP_PRESENT_COLORS)
      const epc = epcStub(activity.epc)
      addPresent(game, { pid, x, color: c, tier, epc, origin: null }, now)
      const drop: Extract<WorkshopPayload, { t: 'drop' }> = { t: 'drop', pid, x, c, r: tier }
      if (epc) drop.epc = epc
      net.send(drop)
    }
  } else {
    if (activity.started) s.score[1] += 1
    p.stats.bells += 1
    s.bellUntil = now + BELL_MS
    if (net.sound) playBell()
    net.send({ t: 'bell', started: activity.started })
    if (Math.random() < JINGLE_CHANCE) spawnPersonal(game, rollRarity(Math.random, 0.1), 'jingle', 'Jingle gift!', net, now)
  }
  game.dirty = true
  game.lastFull = 0
  markProfile(game, false)
  checkAchievements(game, net)
}

/** Once per day per device: a present near the player, better on a streak. */
export function claimDailyGift(game: Game, net: Net, now: number) {
  const { granted, streak } = claimDaily(game.profile)
  if (!granted) return
  const label = streak > 1 ? `Daily gift! Day ${streak} streak` : 'Daily gift!'
  spawnPersonal(game, rollRarity(Math.random, 0.2, dailyMinRarity(streak)), 'daily', label, net, now)
  game.events.push({ kind: 'daily', streak })
  markProfile(game, true)
  checkAchievements(game, net)
}

export type ChatResult = 'sent' | 'empty' | 'slow'

export function sendChat(game: Game, raw: string, net: Net, now: number): ChatResult {
  const text = sanitizeWorkshopChat(raw)
  if (!text) return 'empty'
  const s = game.self
  s.chatTimes = s.chatTimes.filter((t) => now - t < CHAT_WINDOW_MS)
  const lastAt = s.chatTimes[s.chatTimes.length - 1]
  if (s.chatTimes.length >= CHAT_BURST || (lastAt !== undefined && now - lastAt < CHAT_GAP_MS)) return 'slow'
  s.chatTimes.push(now)
  showChat(game, s, text, now, true)
  net.send({ t: 'chat', text })
  game.profile.stats.chats += 1
  markProfile(game, false)
  checkAchievements(game, net)
  return 'sent'
}

export function sendEmote(game: Game, e: number, net: Net, now: number) {
  const s = game.self
  if (e < 0 || e >= EMOTES.length || now - s.lastEmote < EMOTE_GAP_MS) return
  s.lastEmote = now
  s.emote = { e, at: now }
  net.send({ t: 'emote', e })
}

export function throwSnowball(game: Game, net: Net, now: number) {
  const s = game.self
  if (now - s.lastSnow < SNOW_GAP_MS || now < s.dizzyUntil) return
  s.lastSnow = now
  s.manual = true
  spawnSnowball(game, s, s.x, s.dir)
  net.send({ t: 'snow', x: round4(s.x), dir: s.dir })
  if (net.sound) playThrow()
}

/** Bag uids currently offered in a trade; they can't be dropped or re-offered elsewhere. */
export function lockedUids(game: Game): ReadonlySet<string> {
  const t = game.trade
  return new Set(t && (t.phase === 'open' || t.phase === 'outgoing' || t.phase === 'incoming') ? t.mine : [])
}

export function dropFromBag(game: Game, uid: string, net: Net, now: number, atX?: number): boolean {
  if (lockedUids(game).has(uid)) return false
  const s = game.self
  const entry = takeFromBag(game.profile, uid)
  if (!entry) return false
  const did = randomWorkshopToken(10)
  game.profile.escrow.push({ did, entry, at: Date.now() })
  const x = round4(clamp(atX ?? s.x + s.dir * 0.035, 0.03, 0.9))
  game.floorItems.set(did, {
    did,
    item: entry.item,
    owner: s.id,
    ownerName: s.name,
    x,
    height: game.layout.elfH * 0.6,
    vy: -170,
    landedAt: null,
    born: now,
    claimAt: 0,
    phase: Math.random() * 6,
    ...(entry.note ? { note: entry.note } : {}),
  })
  net.send({ t: 'idrop', did, item: entry.item, x, ...(entry.note ? { note: entry.note } : {}) })
  if (net.sound) playThrow()
  syncSelf(game)
  markProfile(game, true)
  return true
}

/** Write a letter into the bag (keep it, or drop/gift later). */
export function writeLetter(game: Game, text: string): boolean {
  const note = sanitizeWorkshopLetter(text)
  if (!note) return false
  if (!addToBag(game.profile, 'handwritten-letter', 'letter', { note, force: true })) return false
  markProfile(game, true)
  return true
}

/** Compose a letter and drop it near a peer (or yourself) as a floor gift. */
export function giftLetter(game: Game, text: string, net: Net, now: number, atX?: number): boolean {
  if (!writeLetter(game, text)) return false
  const entry = [...game.profile.bag].reverse().find((e) => e.item === 'handwritten-letter' && e.note)
  if (!entry) return false
  return dropFromBag(game, entry.uid, net, now, atX)
}

export function useFromBag(game: Game, uid: string, net: Net, now: number): boolean {
  if (lockedUids(game).has(uid)) return false
  const entry = consumeFromBag(game.profile, uid)
  if (!entry) return false
  const def = ITEM_BY_ID.get(entry.item)
  const fx = def?.consume
  if (!fx) return false
  const s = game.self
  if (fx.sober) s.dizzyUntil = 0
  if (fx.durationMs && (fx.speed || fx.jump)) {
    s.buffUntil = now + fx.durationMs
    s.buffSpeed = fx.speed ?? 1
    s.buffJump = fx.jump ?? 1
  }
  const x = s.x * game.width
  const y = headY(game, s)
  float(game, fx.verb === 'Eat' ? 'Nom!' : 'Ahh!', x, y, def?.rarity ? RARITY_INFO[def.rarity].color : '#f8fafc')
  sprinkle(game, x, game.layout.groundY - s.lift - 8, fx.colors ?? ['#f8fafc'], 14, 40, 80)
  const text = sanitizeWorkshopChat(fx.chat)
  if (text) {
    showChat(game, s, text, now, true)
    net.send({ t: 'chat', text })
  }
  if (net.sound) playBlip()
  markProfile(game, true)
  return true
}

export function equipFromBag(game: Game, slot: WearableKind, itemId: string | null) {
  if (!equipItem(game.profile, slot, itemId)) return
  syncSelf(game)
  markProfile(game, true)
}

export function chooseTitle(game: Game, achievementId: string | null) {
  if (!setTitle(game.profile, achievementId)) return
  syncSelf(game)
  markProfile(game, true)
}

export function tradeRequest(game: Game, peerId: string, net: Net, now: number): boolean {
  const t = game.trade
  if (t && (t.phase === 'outgoing' || t.phase === 'incoming' || t.phase === 'open')) return false
  const peer = game.peers.get(peerId)
  if (!peer) return false
  applyTrade(game, openTrade(randomWorkshopToken(10), peerId, peer.name, now), net)
  return true
}

export function tradeAccept(game: Game, net: Net, now: number) {
  if (game.trade) applyTrade(game, acceptTrade(game.trade, now), net)
}

export function tradeCancel(game: Game, net: Net, now: number) {
  if (game.trade) applyTrade(game, cancelTrade(game.trade, now), net)
}

export function tradeOffer(game: Game, uids: readonly string[], net: Net, now: number) {
  if (!game.trade) return
  const items = uids.map((uid) => game.profile.bag.find((e) => e.uid === uid)?.item)
  if (items.some((id) => id === undefined)) return
  applyTrade(game, offerItems(game.trade, uids, items as string[], now), net)
}

export function tradeLockIn(game: Game, net: Net, now: number) {
  if (game.trade) applyTrade(game, lockIn(game.trade, now), net)
}

/**
 * Forgets a finished trade. One we cancelled while locked in lingers (out of sight) until it
 * expires, so a commit that crossed our cancel can still complete on this side too.
 */
export function tradeDismiss(game: Game) {
  const t = game.trade
  if (t && (t.phase === 'done' || (t.phase === 'closed' && !t.myReady))) {
    game.trade = null
    game.version += 1
  }
}

/** Landed placeable under a point, or null. Used so a planted banner is clicked, not walked through. */
export function placeableAt(game: Game, x: number, y: number): string | null {
  const L = game.layout
  let hit: string | null = null
  for (const item of game.floorItems.values()) {
    if (item.landedAt === null) continue
    const def = ITEM_BY_ID.get(item.item)
    if (!def?.placeable) continue
    const scale = 3
    const w = def.sprite[0].length * scale
    const h = def.sprite.length * scale
    const bottom = L.groundY - item.height
    const cx = item.x * game.width
    if (Math.abs(x - cx) <= w / 2 + 6 && y >= bottom - h - 8 && y <= bottom + 8) hit = item.did
  }
  return hit
}

/** Owner clicks a planted item to put it back in the bag. */
export function takePlaceable(game: Game, did: string, net: Net, now: number): boolean {
  const item = game.floorItems.get(did)
  if (!item || item.landedAt === null || item.owner !== game.self.id) return false
  if (!ITEM_BY_ID.get(item.item)?.placeable) return false
  grant(game, did, game.self.id, net, now)
  return !game.floorItems.has(did)
}

/** Topmost elf under a point in panel pixels; our own elf wins ties so clicking it always jumps. */
export function elfAt(game: Game, x: number, y: number): Elf | null {
  const L = game.layout
  const hit = (e: ElfBase) => {
    const feet = L.groundY - e.lift
    return Math.abs(x - e.x * game.width) < L.px * 6 && y > feet - L.elfH - 6 && y < feet + 3
  }
  if (hit(game.self)) return game.self
  for (const p of game.peers.values()) if (hit(p)) return p
  return null
}

export function roster(game: Game): RosterEntry[] {
  const players: Elf[] = [game.self, ...game.peers.values()]
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: [p.score[0], p.score[1], p.score[2]] as WorkshopScore,
      self: p === game.self,
      leader: p.cloudKing === true,
      title: p.cloudTitle || ACHIEVEMENT_BY_ID.get(p.title)?.title || null,
      prestige: p.prestige,
      equip: { ...p.equip },
    }))
    .sort((a, b) => scoreTotal(b.score) - scoreTotal(a.score))
}

export function arrive(game: Game) {
  burst(game, game.self.x * game.width, game.layout.groundY - 12, 'snow')
}

function drawEpcLabel(ctx: CanvasRenderingContext2D, epc: string, cx: number, bottom: number) {
  const w = hexTextWidth(epc, 1) + 4
  const x = Math.round(cx - w / 2)
  const y = Math.round(bottom - 9)
  ctx.fillStyle = 'rgba(6, 24, 20, 0.78)'
  ctx.fillRect(x, y, w, 9)
  ctx.fillStyle = '#6ee7b7'
  drawHexText(ctx, epc, x + 2, y + 2, 1)
}

function mountRide(e: ElfBase, px: number): number {
  const pet = e.equip.pet ? ITEM_BY_ID.get(e.equip.pet) : undefined
  return pet?.mount ? Math.round(itemHeight(pet, px) * 0.42) : 0
}

function drawPet(ctx: CanvasRenderingContext2D, e: ElfBase, px: number, groundY: number, t: number, scaleX: (petX: number) => number) {
  const pet = e.equip.pet ? ITEM_BY_ID.get(e.equip.pet) : undefined
  if (!pet || e.petX === null) return
  const hop = !pet.mount && e.moving ? Math.round(Math.abs(Math.sin(t * 11 + e.x * 40)) * px * 1.5) : 0
  drawItem(ctx, pet, scaleX(e.petX), groundY - hop, px, e.dir === -1, t)
}

export function renderPanel(ctx: CanvasRenderingContext2D, game: Game, now: number, dpr: number) {
  const { width, height, layout: L } = game
  const t = now / 1000
  const dark = isDark()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  drawSky(ctx, width, L.groundY, t, dark, game.room)
  drawTree(
    ctx,
    {
      cx: L.treeCx,
      groundY: L.groundY,
      height: L.treeH,
      ornaments: treeTotal(game.tree),
      stage: game.stage,
      celebrate: Math.max(0, (game.celebrateUntil - now) / 1200),
    },
    t,
    dark,
  )
  drawGround(ctx, width, height, L.groundY, dark, game.room, t)
  if (game.stage >= 3) drawTrain(ctx, L.treeCx, L.groundY, Math.max(70, L.treeH * 1.5), t)

  const signs: { x: number; top: number; text: string }[] = []
  for (const item of game.floorItems.values()) {
    const def = ITEM_BY_ID.get(item.item)
    if (!def) continue
    const x = item.x * width
    const tier = rarityIndex(def.rarity)
    const color = RARITY_INFO[def.rarity].color
    const landed = item.landedAt !== null
    const planted = def.placeable === true
    if (!planted) {
      drawGlow(ctx, x, L.groundY, 12 + tier * 3, color, 0.55 + 0.25 * Math.sin(t * 3 + item.phase))
      if (tier >= 3 && landed) drawBeam(ctx, x, L.groundY, 10, L.groundY - 8, color, t + item.phase)
    } else if (landed) {
      drawGlow(ctx, x, L.groundY, 16, color, 0.35 + 0.15 * Math.sin(t * 1.8 + item.phase))
    }
    const bob = planted ? (landed ? Math.round(Math.sin(t * 1.2 + item.phase) * 0.5) : 0) : landed ? 3 + Math.round(Math.sin(t * 3 + item.phase) * 1.5) : 0
    const scale = planted ? 3 : 2
    drawItem(ctx, def, x, L.groundY - item.height - bob, scale, false, t)
    if (planted && landed && def.sign) {
      const reach = (def.sprite[0].length * scale) / 2 + L.px * 8
      const near = [game.self, ...game.peers.values()].some((e) => Math.abs(e.x * width - x) < reach && e.lift < L.elfH)
      if (near) signs.push({ x, top: L.groundY - item.height - bob - def.sprite.length * scale, text: def.sign })
    }
  }

  for (const p of game.presents.values()) {
    const x = p.x * width
    const bottom = L.groundY + 1 - p.height
    const color = rarityColor(p.tier)
    if (p.tier >= 1) drawGlow(ctx, x, L.groundY, 14 + p.tier * 4, color, 0.75)
    if (p.tier >= 3 && p.landedAt !== null) drawBeam(ctx, x, L.groundY, 14, L.groundY - 6, color, t + p.phase)
    const sparkle = p.landedAt === null ? 0 : Math.max(0, Math.sin(t * 2.2 + p.phase)) ** 6
    drawPresent(ctx, x, bottom, p.color, sparkle, L.px)
    if (p.epc && p.landedAt !== null) drawEpcLabel(ctx, p.epc, x, bottom - L.presentH - 3)
  }

  const elves: Elf[] = [...game.peers.values(), game.self]
  for (const e of elves) drawPet(ctx, e, L.px, L.groundY + 1, t, (x) => x)

  const art = crispScale(2, dpr)
  const overlays: (() => void)[] = []
  for (const e of elves) {
    const self = e === game.self
    const x = e.x * width
    const top = drawElf(
      ctx,
      {
        px: L.px,
        x,
        groundY: L.groundY + 1,
        lift: e.lift,
        dir: e.dir,
        outfit: e.hat,
        appearance: e.appearance,
        pose: poseFor(e),
        walkPhase: (e.walk / CHARACTER_STRIDE_PX) % 1,
        bigHat: e.cloudKing === true,
        hatItem: e.equip.hat ? ITEM_BY_ID.get(e.equip.hat) ?? null : null,
        shirtItem: e.equip.shirt ? ITEM_BY_ID.get(e.equip.shirt) ?? null : null,
        wingsItem: e.equip.wings ? ITEM_BY_ID.get(e.equip.wings) ?? null : null,
        ride: mountRide(e, L.px),
        label: `${e.name}${e.signedIn ? ' ✓' : ''}${e.cloudTitle ? ' · ' + e.cloudTitle : ''}`,
        trim: e.prestige >= 1 ? rarityColor(e.prestige) : null,
        self,
        bell: Math.max(0, (e.bellUntil - now) / BELL_MS),
      },
      t,
      dark,
    )
    if (now < e.dizzyUntil) drawDizzy(ctx, x, L.groundY - e.lift - L.elfH + L.px * 3, t, L.px)
    overlays.push(() => {
      let bottom = top
      if (e.chat && now < e.chat.until) {
        const bubble = chatBubble(e.chat.text, self)
        if (bubble) {
          const w = bubble.w * art
          const h = bubble.h * art
          const cx = clamp(x, w / 2 + 2, width - w / 2 - 2)
          const b = Math.max(bottom, h + 2)
          const born = Math.min(1, (now - e.chat.at) / 120)
          drawPixelSprite(ctx, bubble, cx, b + (1 - born) * 4, art, dpr, Math.min(1, (e.chat.until - now) / 400) * born)
          bottom = b - h - 2
        }
      }
      if (e.emote && now - e.emote.at < EMOTE_MS) {
        const k = (now - e.emote.at) / EMOTE_MS
        const emote = EMOTES[e.emote.e]
        const icon = iconBubble(`emote-${e.emote.e}`, emote.rows, emote.palette)
        if (icon) {
          const pop = k < 0.05 ? 0.55 + (k / 0.05) * 0.45 : 1
          const scale = k < 0.05 ? art * pop : art
          drawPixelSprite(ctx, icon, x, Math.max(bottom, icon.h * scale + 2) - k * 8, scale, dpr, k > 0.8 ? (1 - k) / 0.2 : 1)
        }
      }
    })
  }

  for (const b of game.snowballs) drawSnowball(ctx, b.x, L.groundY - b.h, L.groundY)
  drawParticles(ctx, game.particles)
  drawFloaters(ctx, game.floaters, dark)
  overlays.forEach((draw) => draw())
  for (const sign of signs) {
    const bubble = chatBubble(sign.text, false)
    if (!bubble) continue
    const w = bubble.w * art
    const h = bubble.h * art
    const cx = clamp(sign.x, w / 2 + 2, width - w / 2 - 2)
    drawPixelSprite(ctx, bubble, cx, Math.max(sign.top - 2, h + 2), art, dpr, 1)
  }

  let y = 36
  for (const b of game.banners) {
    const sprite = pixelBanner(b.text, b.color)
    if (!sprite) continue
    const k = b.age / b.ttl
    const alpha = k < 0.06 ? k / 0.06 : k > 0.85 ? (1 - k) / 0.15 : 1
    const h = sprite.h * art
    drawPixelSprite(ctx, sprite, width / 2, y + h - (k < 0.06 ? (1 - k / 0.06) * 6 : 0), art, dpr, alpha)
    y += h + 4
  }
}

/** The snow-globe view inside the collapsed chip. */
export function renderMini(ctx: CanvasRenderingContext2D, game: Game, now: number, dpr: number, w: number, h: number) {
  const t = now / 1000
  const dark = isDark()
  const L = game.layout
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const groundY = h - 4
  const sx = (x: number) => 5 + x * (w - 10)
  const sy = groundY / Math.max(1, L.groundY)

  drawSky(ctx, w, groundY, t, dark, game.room)
  drawTree(ctx, { cx: w - 11, groundY, height: h - 7, ornaments: treeTotal(game.tree), stage: game.stage, celebrate: 0 }, t, dark)
  drawGround(ctx, w, h, groundY, dark, game.room, t)

  for (const item of game.floorItems.values()) {
    const def = ITEM_BY_ID.get(item.item)
    if (!def) continue
    ctx.fillStyle = RARITY_INFO[def.rarity].color
    ctx.fillRect(Math.round(sx(item.x)) - 1, groundY - 3 - Math.round(item.height * sy), 3, 3)
  }
  for (const p of game.presents.values()) {
    const x = sx(p.x)
    if (p.tier >= 3) drawGlow(ctx, x, groundY, 7, rarityColor(p.tier), 0.9)
    drawPresent(ctx, x, groundY + 1 - p.height * sy, p.color, 0, 1)
  }

  const elves: Elf[] = [...game.peers.values(), game.self]
  for (const e of elves) drawPet(ctx, e, 1, groundY + 1, t, (petX) => sx(petX / Math.max(1, game.width)))
  for (const e of elves) {
    const x = sx(e.x)
    const top = drawElf(
      ctx,
      {
        px: 1,
        x,
        groundY: groundY + 1,
        lift: e.lift * sy * 0.5,
        dir: e.dir,
        outfit: e.hat,
        appearance: e.appearance,
        pose: poseFor(e),
        walkPhase: (e.walk / CHARACTER_STRIDE_PX) % 1,
        bigHat: e.cloudKing === true,
        hatItem: e.equip.hat ? ITEM_BY_ID.get(e.equip.hat) ?? null : null,
        shirtItem: e.equip.shirt ? ITEM_BY_ID.get(e.equip.shirt) ?? null : null,
        wingsItem: e.equip.wings ? ITEM_BY_ID.get(e.equip.wings) ?? null : null,
        ride: mountRide(e, 1),
        label: null,
        trim: null,
        self: e === game.self,
        bell: Math.max(0, (e.bellUntil - now) / BELL_MS),
      },
      t,
      dark,
    )
    if (e.chat && now < e.chat.until) {
      const bx = Math.round(x) - 4
      const by = Math.max(0, Math.round(top) - 5)
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(bx, by, 9, 5)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(bx + 1, by + 1, 7, 3)
      ctx.fillStyle = '#1e293b'
      for (let i = 0; i < 3; i++) if (Math.floor(t * 3) % 3 >= i) ctx.fillRect(bx + 2 + i * 2, by + 2, 1, 1)
    }
  }
  for (const b of game.snowballs) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(Math.round(sx(b.x / Math.max(1, game.width))), Math.round(groundY - b.h * sy * 0.5) - 1, 2, 2)
  }
}

export function itemDef(id: string | null | undefined): ItemDef | undefined {
  return id ? ITEM_BY_ID.get(id) : undefined
}
