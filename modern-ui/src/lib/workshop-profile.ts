/**
 * Zeus has no user accounts, so workshop progress belongs to the install: one profile per
 * device, kept in localStorage. Items move between devices only through floor drops and trades.
 */
import {
  ITEM_BY_ID,
  ITEMS,
  RARITIES,
  rarityIndex,
  wearableOrNull,
  type ItemDef,
  type Rarity,
  type WearableKind,
} from './workshop-items'
import { localDate, randomWorkshopToken } from './workshop-state'

export const PROFILE_KEY = 'workshop-profile-v1'
export const BAG_CAPACITY = 240
export const WEARABLE_SLOTS: readonly WearableKind[] = ['hat', 'pet', 'trail']

const UID_RE = /^[a-z0-9]{6,20}$/
const DEVICE_RE = /^[A-Z0-9]{8}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ORIGINS = ['present', 'daily', 'milestone', 'jingle', 'trade', 'floor'] as const
const LOOT_ORIGINS: ReadonlySet<ItemOrigin> = new Set(['present', 'daily', 'milestone', 'jingle'])

export type ItemOrigin = (typeof ORIGINS)[number]
export type BagEntry = { uid: string; item: string; at: number; from: ItemOrigin; by?: string }
/** An item lying on the floor: out of the bag, but still ours until someone is granted it. */
export type EscrowEntry = { did: string; entry: BagEntry; at: number }

export type WorkshopStats = {
  opened: number
  sends: number
  bells: number
  given: number
  received: number
  trades: number
  chats: number
  hits: number
  found: Record<Rarity, number>
}

export type WorkshopProfile = {
  device: string
  bag: BagEntry[]
  discovered: string[]
  equipped: Record<WearableKind, string | null>
  title: string | null
  achievements: string[]
  stats: WorkshopStats
  daily: { last: string | null; streak: number }
  escrow: EscrowEntry[]
}

export type Achievement = {
  id: string
  name: string
  description: string
  title: string
  progress: (p: WorkshopProfile) => [have: number, need: number]
}

const foundAtLeast = (p: WorkshopProfile, min: Rarity) =>
  RARITIES.slice(rarityIndex(min)).reduce((sum, r) => sum + p.stats.found[r], 0)

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-find', name: 'First Find', description: 'Open your first present.', title: 'Apprentice Elf', progress: (p) => [p.stats.opened, 1] },
  { id: 'tag-collector', name: 'Tag Collector', description: 'Discover 10 different items.', title: 'Tag Collector', progress: (p) => [p.discovered.length, 10] },
  { id: 'rare-hunter', name: 'Rare Hunter', description: 'Find a rare item or better in a present.', title: 'Rare Hunter', progress: (p) => [foundAtLeast(p, 'rare'), 1] },
  { id: 'epic-elf', name: 'Epic Elf', description: 'Find an epic item or better in a present.', title: 'Epic Elf', progress: (p) => [foundAtLeast(p, 'epic'), 1] },
  { id: 'legend', name: 'Legend of the North', description: 'Find a legendary item in a present.', title: 'Legend of the North', progress: (p) => [p.stats.found.legendary, 1] },
  { id: 'keeper', name: 'Keeper of Tags', description: 'Discover every item in the collection.', title: 'Keeper of Tags', progress: (p) => [p.discovered.length, ITEMS.length] },
  { id: 'secret-santa', name: 'Secret Santa', description: 'Give away 3 items by trade or floor drop.', title: 'Secret Santa', progress: (p) => [p.stats.given, 3] },
  { id: 'tag-trader', name: 'Tag Trader', description: 'Complete 3 trades.', title: 'Tag Trader', progress: (p) => [p.stats.trades, 3] },
  { id: 'emulation-elf', name: 'Emulation Elf', description: 'Complete 100 tag sends.', title: 'Emulation Elf', progress: (p) => [p.stats.sends, 100] },
  { id: 'bell-ringer', name: 'Bell Ringer', description: 'Start or stop Edge processes 10 times.', title: 'Bell Ringer', progress: (p) => [p.stats.bells, 10] },
  { id: 'regular', name: 'Workshop Regular', description: 'Claim the daily gift 3 days in a row.', title: 'Workshop Regular', progress: (p) => [p.daily.streak, 3] },
  { id: 'chatterbox', name: 'Chatterbox', description: 'Send 25 chat messages.', title: 'Chatterbox', progress: (p) => [p.stats.chats, 25] },
  { id: 'snowball-ace', name: 'Snowball Ace', description: 'Hit other elves with 10 snowballs.', title: 'Snowball Ace', progress: (p) => [p.stats.hits, 10] },
]

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

function emptyFound(): Record<Rarity, number> {
  return { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
}

export function newProfile(): WorkshopProfile {
  return {
    device: randomWorkshopToken(8).toUpperCase(),
    bag: [],
    discovered: [],
    equipped: { hat: null, pet: null, trail: null },
    title: null,
    achievements: [],
    stats: { opened: 0, sends: 0, bells: 0, given: 0, received: 0, trades: 0, chats: 0, hits: 0, found: emptyFound() },
    daily: { last: null, streak: 0 },
    escrow: [],
  }
}

export function deviceLabel(p: WorkshopProfile): string {
  return `${p.device.slice(0, 4)}-${p.device.slice(4)}`
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}

function parseEntry(v: unknown): BagEntry | null {
  if (!isRecord(v)) return null
  const { uid, item, at, from, by } = v
  if (typeof uid !== 'string' || !UID_RE.test(uid)) return null
  if (typeof item !== 'string' || !ITEM_BY_ID.has(item)) return null
  const entry: BagEntry = {
    uid,
    item,
    at: typeof at === 'number' && Number.isFinite(at) ? at : 0,
    from: ORIGINS.includes(from as ItemOrigin) ? (from as ItemOrigin) : 'present',
  }
  if (typeof by === 'string' && by) entry.by = by.slice(0, 32)
  return entry
}

export function loadProfile(storage: Storage = localStorage): WorkshopProfile {
  const p = newProfile()
  let raw: unknown = null
  try {
    raw = JSON.parse(storage.getItem(PROFILE_KEY) ?? 'null')
  } catch {
    raw = null
  }
  if (!isRecord(raw)) return p

  if (typeof raw.device === 'string' && DEVICE_RE.test(raw.device)) p.device = raw.device
  const uids = new Set<string>()
  const keep = (entry: BagEntry | null) => {
    if (!entry || uids.has(entry.uid)) return
    uids.add(entry.uid)
    p.bag.push(entry)
  }
  if (Array.isArray(raw.bag)) raw.bag.forEach((v) => keep(parseEntry(v)))
  // Anything still on the floor when the app closed was never granted to anyone.
  if (Array.isArray(raw.escrow)) raw.escrow.forEach((v) => keep(isRecord(v) ? parseEntry(v.entry) : null))

  const discovered = new Set<string>()
  if (Array.isArray(raw.discovered)) {
    for (const id of raw.discovered) if (typeof id === 'string' && ITEM_BY_ID.has(id)) discovered.add(id)
  }
  p.bag.forEach((e) => discovered.add(e.item))
  p.discovered = [...discovered]

  if (Array.isArray(raw.achievements)) {
    p.achievements = [...new Set(raw.achievements.filter((id): id is string => typeof id === 'string' && ACHIEVEMENT_BY_ID.has(id)))]
  }
  if (typeof raw.title === 'string' && p.achievements.includes(raw.title)) p.title = raw.title

  const stats = isRecord(raw.stats) ? raw.stats : {}
  const found = isRecord(stats.found) ? stats.found : {}
  p.stats = {
    opened: count(stats.opened),
    sends: count(stats.sends),
    bells: count(stats.bells),
    given: count(stats.given),
    received: count(stats.received),
    trades: count(stats.trades),
    chats: count(stats.chats),
    hits: count(stats.hits),
    found: { common: count(found.common), uncommon: count(found.uncommon), rare: count(found.rare), epic: count(found.epic), legendary: count(found.legendary) },
  }

  const daily = isRecord(raw.daily) ? raw.daily : {}
  p.daily = {
    last: typeof daily.last === 'string' && DATE_RE.test(daily.last) ? daily.last : null,
    streak: count(daily.streak),
  }

  const equipped = isRecord(raw.equipped) ? raw.equipped : {}
  for (const slot of WEARABLE_SLOTS) {
    const id = wearableOrNull(typeof equipped[slot] === 'string' ? (equipped[slot] as string) : null, slot)
    p.equipped[slot] = id && p.bag.some((e) => e.item === id) ? id : null
  }
  return p
}

export function saveProfile(p: WorkshopProfile, storage: Storage = localStorage): void {
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    // storage full or unavailable; progress lasts for this session
  }
}

/** Adds a new copy of an item. Returns null for unknown items or a full bag (unless forced). */
export function addToBag(
  p: WorkshopProfile,
  itemId: string,
  from: ItemOrigin,
  options: { by?: string; now?: number; force?: boolean } = {},
): BagEntry | null {
  const def = ITEM_BY_ID.get(itemId)
  if (!def) return null
  if (!options.force && p.bag.length >= BAG_CAPACITY) return null
  const entry: BagEntry = { uid: randomWorkshopToken(10), item: itemId, at: options.now ?? Date.now(), from }
  if (options.by) entry.by = options.by.slice(0, 32)
  p.bag.push(entry)
  if (!p.discovered.includes(itemId)) p.discovered.push(itemId)
  if (LOOT_ORIGINS.has(from)) p.stats.found[def.rarity] += 1
  return entry
}

/** Puts a previously removed entry back (floor reclaims, escrow returns). Ignores capacity: it was ours. */
export function returnToBag(p: WorkshopProfile, entry: BagEntry): void {
  if (!p.bag.some((e) => e.uid === entry.uid)) p.bag.push(entry)
}

export function takeFromBag(p: WorkshopProfile, uid: string): BagEntry | null {
  const index = p.bag.findIndex((e) => e.uid === uid)
  if (index < 0) return null
  const [entry] = p.bag.splice(index, 1)
  for (const slot of WEARABLE_SLOTS) {
    if (p.equipped[slot] === entry.item && !p.bag.some((e) => e.item === entry.item)) p.equipped[slot] = null
  }
  return entry
}

/** Moves every floor item back into the bag, e.g. when leaving the floor. */
export function returnEscrow(p: WorkshopProfile): number {
  const n = p.escrow.length
  p.escrow.forEach((e) => returnToBag(p, e.entry))
  p.escrow = []
  return n
}

export type BagStack = { item: ItemDef; entries: BagEntry[] }

/** One stack per item, rarest first. */
export function bagStacks(p: WorkshopProfile): BagStack[] {
  const groups = new Map<string, BagEntry[]>()
  for (const entry of p.bag) {
    const list = groups.get(entry.item)
    if (list) list.push(entry)
    else groups.set(entry.item, [entry])
  }
  const stacks: BagStack[] = []
  for (const [id, entries] of groups) {
    const item = ITEM_BY_ID.get(id)
    if (item) stacks.push({ item, entries })
  }
  return stacks.sort(
    (a, b) => rarityIndex(b.item.rarity) - rarityIndex(a.item.rarity) || a.item.name.localeCompare(b.item.name),
  )
}

export function equipItem(p: WorkshopProfile, slot: WearableKind, itemId: string | null): boolean {
  if (itemId === null) {
    p.equipped[slot] = null
    return true
  }
  if (wearableOrNull(itemId, slot) === null || !p.bag.some((e) => e.item === itemId)) return false
  p.equipped[slot] = itemId
  return true
}

export function setTitle(p: WorkshopProfile, achievementId: string | null): boolean {
  if (achievementId !== null && !p.achievements.includes(achievementId)) return false
  p.title = achievementId
  return true
}

/** Highest rarity ever discovered, 0 (common) to 4 (legendary); shown as a nameplate trim. */
export function prestige(p: WorkshopProfile): number {
  let best = 0
  for (const id of p.discovered) {
    const def = ITEM_BY_ID.get(id)
    if (def) best = Math.max(best, rarityIndex(def.rarity))
  }
  return best
}

/** Claims today's gift once per day. Consecutive days build a streak. */
export function claimDaily(p: WorkshopProfile, now = new Date()): { granted: boolean; streak: number } {
  const today = localDate(now)
  if (p.daily.last === today) return { granted: false, streak: p.daily.streak }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  p.daily.streak = p.daily.last === localDate(yesterday) ? p.daily.streak + 1 : 1
  p.daily.last = today
  return { granted: true, streak: p.daily.streak }
}

export function dailyMinRarity(streak: number): Rarity {
  if (streak >= 7) return 'epic'
  if (streak >= 3) return 'rare'
  return 'uncommon'
}

/** Records newly met achievements and returns their ids. */
export function unlockAchievements(p: WorkshopProfile): string[] {
  const fresh: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue
    const [have, need] = a.progress(p)
    if (have >= need) {
      p.achievements.push(a.id)
      fresh.push(a.id)
    }
  }
  return fresh
}
