import { describe, expect, it } from 'vitest'
import {
  BAG_CAPACITY,
  PROFILE_KEY,
  addToBag,
  bagStacks,
  claimDaily,
  consumeFromBag,
  dailyMinRarity,
  deviceLabel,
  equipItem,
  guestAfterAccountImport,
  loadProfile,
  newProfile,
  prestige,
  returnEscrow,
  saveProfile,
  setTitle,
  takeFromBag,
  unlockAchievements,
} from '../workshop-profile'
import { ITEMS } from '../workshop-items'

describe('workshop profile', () => {
  it('starts empty with a device code', () => {
    const p = newProfile()
    expect(p.device).toMatch(/^[A-Z0-9]{8}$/)
    expect(deviceLabel(p)).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(p.bag).toEqual([])
    expect(prestige(p)).toBe(0)
  })

  it('removes only bag UIDs that an account imported from the guest', () => {
    const guest = newProfile()
    const kept = addToBag(guest, ITEMS[0].id, 'present')!
    const moved = addToBag(guest, ITEMS[1].id, 'present')!
    equipItem(guest, 'hat', ITEMS[1].id)
    const account = newProfile()
    account.bag = [moved]
    const next = guestAfterAccountImport(guest, account)
    expect(next.bag.map((e) => e.uid)).toEqual([kept.uid])
    expect(next.equipped.hat).toBeNull()
  })

  it('clears guest UIDs offered on signup even when the account response bag is empty', () => {
    const guest = newProfile()
    const moved = addToBag(guest, ITEMS[0].id, 'present')!
    const account = newProfile()
    const next = guestAfterAccountImport(guest, account, guest)
    expect(next.bag.map((e) => e.uid)).not.toContain(moved.uid)
  })

  it('adds, stacks, and removes items, tracking discoveries and finds', () => {
    const p = newProfile()
    const a = addToBag(p, 'plain-tag', 'present')!
    addToBag(p, 'plain-tag', 'trade', { by: 'Nora' })
    addToBag(p, 'golden-epc', 'daily')
    expect(addToBag(p, 'not-an-item', 'present')).toBeNull()
    expect(p.discovered.sort()).toEqual(['golden-epc', 'plain-tag'])
    expect(p.stats.found.common).toBe(1)
    expect(p.stats.found.legendary).toBe(1)
    expect(prestige(p)).toBe(4)

    const stacks = bagStacks(p)
    expect(stacks.map((s) => [s.item.id, s.entries.length])).toEqual([
      ['golden-epc', 1],
      ['plain-tag', 2],
    ])
    expect(takeFromBag(p, a.uid)?.uid).toBe(a.uid)
    expect(takeFromBag(p, a.uid)).toBeNull()
    expect(p.bag).toHaveLength(2)
  })

  it('respects capacity unless forced', () => {
    const p = newProfile()
    for (let i = 0; i < BAG_CAPACITY; i++) addToBag(p, 'snowball', 'present')
    expect(addToBag(p, 'snowball', 'present')).toBeNull()
    expect(addToBag(p, 'snowball', 'trade', { force: true })).not.toBeNull()
  })

  it('equips owned wearables and unequips when the last copy leaves', () => {
    const p = newProfile()
    expect(equipItem(p, 'hat', 'santa-hat')).toBe(false)
    const one = addToBag(p, 'santa-hat', 'present')!
    const two = addToBag(p, 'santa-hat', 'present')!
    expect(equipItem(p, 'pet', 'santa-hat')).toBe(false)
    expect(equipItem(p, 'hat', 'santa-hat')).toBe(true)
    takeFromBag(p, one.uid)
    expect(p.equipped.hat).toBe('santa-hat')
    takeFromBag(p, two.uid)
    expect(p.equipped.hat).toBeNull()
  })

  it('builds a daily streak and resets it after a missed day', () => {
    const p = newProfile()
    expect(claimDaily(p, new Date(2026, 11, 1, 9))).toEqual({ granted: true, streak: 1 })
    expect(claimDaily(p, new Date(2026, 11, 1, 18))).toEqual({ granted: false, streak: 1 })
    expect(claimDaily(p, new Date(2026, 11, 2, 9))).toEqual({ granted: true, streak: 2 })
    expect(claimDaily(p, new Date(2026, 11, 3, 9)).streak).toBe(3)
    expect(claimDaily(p, new Date(2026, 11, 5, 9)).streak).toBe(1)
    expect(dailyMinRarity(1)).toBe('uncommon')
    expect(dailyMinRarity(3)).toBe('rare')
    expect(dailyMinRarity(7)).toBe('epic')
  })

  it('unlocks achievements once and only allows unlocked titles', () => {
    const p = newProfile()
    expect(setTitle(p, 'first-find')).toBe(false)
    p.stats.opened = 1
    expect(unlockAchievements(p)).toEqual(['first-find'])
    expect(unlockAchievements(p)).toEqual([])
    expect(setTitle(p, 'first-find')).toBe(true)
    expect(p.title).toBe('first-find')
  })

  it('round-trips through storage and returns floor items to the bag', () => {
    const p = newProfile()
    const kept = addToBag(p, 'snowman', 'present')!
    equipItem(p, 'pet', 'snowman')
    const dropped = addToBag(p, 'cocoa-mug', 'present')!
    takeFromBag(p, dropped.uid)
    p.escrow.push({ did: 'drop0001', entry: dropped, at: 1 })
    p.stats.opened = 2
    p.achievements = ['first-find']
    p.title = 'first-find'
    saveProfile(p)

    const loaded = loadProfile()
    expect(loaded.device).toBe(p.device)
    expect(loaded.bag.map((e) => e.uid).sort()).toEqual([kept.uid, dropped.uid].sort())
    expect(loaded.escrow).toEqual([])
    expect(loaded.equipped.pet).toBe('snowman')
    expect(loaded.title).toBe('first-find')
    expect(loaded.stats.opened).toBe(2)
  })

  it('survives corrupt or hostile storage', () => {
    localStorage.setItem(PROFILE_KEY, '{not json')
    expect(loadProfile().bag).toEqual([])
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        device: 'lowercase',
        bag: [{ uid: 'abc123', item: 'plain-tag' }, { uid: 'abc123', item: 'plain-tag' }, { uid: 'x', item: 'plain-tag' }, { uid: 'def456', item: 'nope' }],
        equipped: { hat: 'snowman', pet: 'golden-epc', trail: 'hex-rain' },
        title: 'legend',
        achievements: ['made-up'],
        stats: { opened: -4, found: { rare: 'lots' } },
        daily: { last: 'yesterday', streak: 2.5 },
      }),
    )
    const p = loadProfile()
    expect(p.device).toMatch(/^[A-Z0-9]{8}$/)
    expect(p.bag.map((e) => e.uid)).toEqual(['abc123'])
    expect(p.equipped).toEqual({ hat: null, pet: null, trail: null, shirt: null, wings: null, mount: null, title: null })
    expect(p.title).toBeNull()
    expect(p.achievements).toEqual([])
    expect(p.stats.opened).toBe(0)
    expect(p.stats.found.rare).toBe(0)
    expect(p.daily).toEqual({ last: null, streak: 0 })
  })

  it('consumes a drink from the bag and refuses non-consumables', () => {
    const p = newProfile()
    const mug = addToBag(p, 'cocoa-mug', 'present')!
    const hat = addToBag(p, 'santa-hat', 'present')!
    expect(consumeFromBag(p, mug.uid)?.uid).toBe(mug.uid)
    expect(p.bag.map((e) => e.item)).toEqual(['santa-hat'])
    expect(consumeFromBag(p, hat.uid)).toBeNull()
    expect(p.bag.map((e) => e.item)).toEqual(['santa-hat'])
  })

  it('returns every escrowed item on demand', () => {
    const p = newProfile()
    const e = addToBag(p, 'snowball', 'present')!
    takeFromBag(p, e.uid)
    p.escrow.push({ did: 'drop0002', entry: e, at: 0 })
    expect(returnEscrow(p)).toBe(1)
    expect(p.bag).toHaveLength(1)
    expect(p.escrow).toEqual([])
  })
})
