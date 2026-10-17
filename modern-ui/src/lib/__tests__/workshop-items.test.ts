import { describe, expect, it } from 'vitest'
import {
  ITEMS,
  RARITIES,
  isConsumable,
  isWearable,
  luckForTagCount,
  rarityAt,
  rarityIndex,
  rollItem,
  rollRarity,
  wearableOrNull,
} from '../workshop-items'
import { isWorkshopItemId } from '../workshop-protocol'

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('workshop item catalog', () => {
  it('has unique wire-safe ids and well-formed sprites', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
    for (const item of ITEMS) {
      expect(isWorkshopItemId(item.id), item.id).toBe(true)
      const width = item.sprite[0].length
      for (const row of item.sprite) {
        expect(row.length, `${item.id} row width`).toBe(width)
        for (const ch of row) if (ch !== '.') expect(item.palette[ch], `${item.id} colour for ${ch}`).toBeDefined()
      }
      if (item.blink) expect(item.sprite.some((row) => row.includes(item.blink!.char))).toBe(true)
    }
  })

  it('has loot at every rarity and every wearable kind', () => {
    for (const r of RARITIES) expect(ITEMS.some((i) => i.rarity === r), r).toBe(true)
    for (const kind of ['hat', 'pet', 'trail', 'shirt', 'wings', 'mount', 'title', 'consumable'] as const) {
      expect(ITEMS.some((i) => i.kind === kind), kind).toBe(true)
    }
    expect(ITEMS.every((i) => isWearable(i) === (i.kind !== 'collectible' && i.kind !== 'consumable'))).toBe(true)
    expect(ITEMS.filter((i) => i.kind === 'consumable').every((i) => isConsumable(i))).toBe(true)
  })

  it('maps rarity indexes both ways and clamps', () => {
    RARITIES.forEach((r, i) => {
      expect(rarityIndex(r)).toBe(i)
      expect(rarityAt(i)).toBe(r)
    })
    expect(rarityAt(-3)).toBe('common')
    expect(rarityAt(99)).toBe('legendary')
  })

  it('only accepts known wearables of the right kind', () => {
    expect(wearableOrNull('santa-hat', 'hat')).toBe('santa-hat')
    expect(wearableOrNull('santa-hat', 'pet')).toBeNull()
    expect(wearableOrNull('from-the-future', 'hat')).toBeNull()
    expect(wearableOrNull('', 'trail')).toBeNull()
  })
})

describe('loot rolls', () => {
  it('scales luck with the tag count and caps it', () => {
    expect(luckForTagCount(1)).toBe(0)
    expect(luckForTagCount(10)).toBeGreaterThan(0)
    expect(luckForTagCount(100)).toBeGreaterThan(luckForTagCount(10))
    expect(luckForTagCount(1e9)).toBe(0.35)
    expect(luckForTagCount(Number.NaN)).toBe(0)
  })

  it('respects the minimum rarity', () => {
    const rand = seeded(1)
    for (let i = 0; i < 500; i++) expect(rarityIndex(rollRarity(rand, 0, 'rare'))).toBeGreaterThanOrEqual(2)
  })

  it('makes better rarities more likely with luck', () => {
    const tally = (luck: number) => {
      const rand = seeded(42)
      let good = 0
      for (let i = 0; i < 20_000; i++) if (rarityIndex(rollRarity(rand, luck)) >= 2) good++
      return good
    }
    const base = tally(0)
    expect(base / 20_000).toBeGreaterThan(0.1)
    expect(base / 20_000).toBeLessThan(0.18)
    expect(tally(0.35)).toBeGreaterThan(base * 1.4)
  })

  it('rolls items of the requested rarity', () => {
    const rand = seeded(7)
    for (const r of RARITIES) for (let i = 0; i < 50; i++) expect(rollItem(rand, r).rarity).toBe(r)
    expect(rollItem(() => 0.999999, 'legendary').rarity).toBe('legendary')
  })
})
