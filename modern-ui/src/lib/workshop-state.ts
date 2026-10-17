import type { WorkshopScore } from './workshop-protocol'

/** Ornament counts that unlock the star, the lights, and the train. */
export const TREE_MILESTONES = [10, 25, 50] as const
export type TreeStage = 0 | 1 | 2 | 3

const DAY_KEY_PREFIX = 'workshop-day:'

export function treeTotal(counts: Record<string, number>): number {
  let total = 0
  for (const n of Object.values(counts)) total += n
  return total
}

export function treeStage(total: number): TreeStage {
  if (total >= TREE_MILESTONES[2]) return 3
  if (total >= TREE_MILESTONES[1]) return 2
  if (total >= TREE_MILESTONES[0]) return 1
  return 0
}

export function nextTreeMilestone(total: number): number | null {
  return TREE_MILESTONES.find((m) => total < m) ?? null
}

/**
 * Each key is only ever incremented by its owner, so taking the max per key converges
 * no matter the order or duplication of gossip. Returns true when `into` changed.
 */
export function mergeTreeCounts(into: Record<string, number>, from: Record<string, number>): boolean {
  let changed = false
  for (const [id, n] of Object.entries(from)) {
    if (n > (into[id] ?? 0)) {
      into[id] = n
      changed = true
    }
  }
  return changed
}

/** Largest contributors first, so gossip stays within the packet's entry cap. */
export function topTreeEntries(counts: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  )
}

export function scoreTotal(score: WorkshopScore): number {
  return score[0] + score[1] + score[2]
}

/** Id of the player strictly ahead of everyone else, once at least two are on the floor. */
export function pickLeader(players: ReadonlyArray<{ id: string; score: WorkshopScore }>): string | null {
  if (players.length < 2) return null
  let leader: string | null = null
  let best = 0
  let tied = false
  for (const p of players) {
    const total = scoreTotal(p.score)
    if (total > best) {
      leader = p.id
      best = total
      tied = false
    } else if (total === best && total > 0) {
      tied = true
    }
  }
  return tied ? null : leader
}

export type WorkshopDay = { tree: Record<string, number>; me: WorkshopScore }

export function localDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function workshopDayKey(room: string, date = new Date()): string {
  const shared = ['anexya-general','vsbl','edge','support','cnct','qa','ui'].includes(room)
  return `${DAY_KEY_PREFIX}${room}:${shared ? date.toISOString().slice(0,10) : localDate(date)}`
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

export function loadWorkshopDay(key: string): WorkshopDay {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return { tree: {}, me: [0, 0, 0] }
    const { tree, me } = raw as { tree?: unknown; me?: unknown }
    const outTree: Record<string, number> = {}
    if (typeof tree === 'object' && tree !== null) {
      for (const [id, n] of Object.entries(tree)) if (isCount(n)) outTree[id] = n
    }
    const outMe: WorkshopScore =
      Array.isArray(me) && me.length === 3 && me.every(isCount) ? [me[0], me[1], me[2]] : [0, 0, 0]
    return { tree: outTree, me: outMe }
  } catch {
    return { tree: {}, me: [0, 0, 0] }
  }
}

export function saveWorkshopDay(key: string, day: WorkshopDay): void {
  try {
    localStorage.setItem(key, JSON.stringify(day))
  } catch {
    // storage full or unavailable; the tree still works for this session
  }
}

/** Drops saved trees from previous days so old rooms don't pile up in storage. */
export function pruneWorkshopDays(date = new Date()): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DAY_KEY_PREFIX)) {
        const room = key.slice(DAY_KEY_PREFIX.length, -11)
        if (key !== workshopDayKey(room, date)) stale.push(key)
      }
    }
    stale.forEach((key) => localStorage.removeItem(key))
  } catch {
    // ignore
  }
}

export function randomWorkshopToken(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}
