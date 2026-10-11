import { describe, it, expect } from 'vitest'
import {
  loadWorkshopDay,
  mergeTreeCounts,
  nextTreeMilestone,
  pickLeader,
  pruneWorkshopDays,
  saveWorkshopDay,
  topTreeEntries,
  treeStage,
  treeTotal,
  workshopDayKey,
} from '../workshop-state'

describe('workshop tree', () => {
  it('unlocks the star, lights, and train at the milestones', () => {
    expect([0, 9, 10, 24, 25, 49, 50, 500].map(treeStage)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(nextTreeMilestone(0)).toBe(10)
    expect(nextTreeMilestone(10)).toBe(25)
    expect(nextTreeMilestone(50)).toBeNull()
  })

  it('merges gossip by taking the max per player, so order and duplicates do not matter', () => {
    const a: Record<string, number> = { alice00000: 3, bob0000000: 1 }
    expect(mergeTreeCounts(a, { bob0000000: 4, carol00000: 2 })).toBe(true)
    expect(a).toEqual({ alice00000: 3, bob0000000: 4, carol00000: 2 })
    expect(mergeTreeCounts(a, { alice00000: 1, bob0000000: 4 })).toBe(false)
    expect(treeTotal(a)).toBe(9)
  })

  it('keeps the largest contributors when trimming gossip', () => {
    expect(topTreeEntries({ a0000000: 1, b0000000: 5, c0000000: 0, d0000000: 3 }, 2)).toEqual({
      b0000000: 5,
      d0000000: 3,
    })
  })
})

describe('pickLeader', () => {
  it('needs a strict lead and at least two players', () => {
    expect(pickLeader([{ id: 'solo', score: [9, 9, 9] }])).toBeNull()
    expect(
      pickLeader([
        { id: 'a', score: [0, 0, 0] },
        { id: 'b', score: [0, 0, 0] },
      ]),
    ).toBeNull()
    expect(
      pickLeader([
        { id: 'a', score: [2, 0, 1] },
        { id: 'b', score: [1, 1, 1] },
      ]),
    ).toBeNull()
    expect(
      pickLeader([
        { id: 'a', score: [2, 0, 1] },
        { id: 'b', score: [1, 1, 1] },
        { id: 'c', score: [4, 0, 0] },
      ]),
    ).toBe('c')
  })
})

describe('workshop day storage', () => {
  it('round-trips and tolerates corrupt data', () => {
    const key = workshopDayKey('192.168.10.36', new Date(2026, 11, 24))
    expect(key).toBe('workshop-day:192.168.10.36:2026-12-24')
    saveWorkshopDay(key, { tree: { abc123def456: 4 }, me: [2, 1, 4] })
    expect(loadWorkshopDay(key)).toEqual({ tree: { abc123def456: 4 }, me: [2, 1, 4] })

    localStorage.setItem(key, '{"tree":{"x":-3,"y":2},"me":[1,"two",3]}')
    expect(loadWorkshopDay(key)).toEqual({ tree: { y: 2 }, me: [0, 0, 0] })
    localStorage.setItem(key, 'not json')
    expect(loadWorkshopDay(key)).toEqual({ tree: {}, me: [0, 0, 0] })
  })

  it('prunes trees from previous days only', () => {
    const today = new Date(2026, 11, 24)
    const keep = workshopDayKey('reader-a', today)
    const old = workshopDayKey('reader-a', new Date(2026, 11, 23))
    localStorage.setItem(keep, '{}')
    localStorage.setItem(old, '{}')
    localStorage.setItem('unrelated', '1')
    pruneWorkshopDays(today)
    expect(localStorage.getItem(keep)).toBe('{}')
    expect(localStorage.getItem(old)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('1')
  })
})
