import { describe, expect, it } from 'vitest'
import { ITEMS, ITEM_BY_ID, RARITIES, rollItem } from '../workshop-items'
import { isWorkshopItemId } from '../workshop-protocol'

const tops = ITEMS.filter((item) => item.kind === 'shirt' && item.id !== 'hail-king-julien-shirt')
const newHeadwear = ['tag-runner-beanie', 'epc-winter-earmuffs', 'antenna-crew-headset']
  .map((id) => ITEM_BY_ID.get(id)!)

describe('workshop wardrobe catalogue', () => {
  it('fits new tops to the torso and leaves the neck, hands and boots readable', () => {
    expect(tops.length).toBeGreaterThan(0)
    for (const item of tops) {
      expect(isWorkshopItemId(item.id), item.id).toBe(true)
      expect(ITEMS.filter((candidate) => candidate.id === item.id), item.id).toHaveLength(1)
      expect(item.sprite, item.id).toHaveLength(5)
      for (const row of item.sprite) {
        expect(row, item.id).toHaveLength(10)
        for (const pixel of row) {
          if (pixel !== '.') expect(item.palette[pixel], `${item.id}: ${pixel}`).toMatch(/^#[a-f\d]{6}$/i)
        }
      }
      expect(item.sprite[0].slice(4, 6), `${item.id}: open neck`).toBe('..')
      expect(item.sprite[0][0], `${item.id}: stepped shoulder`).toBe('.')
      expect(item.sprite[0][9], `${item.id}: stepped shoulder`).toBe('.')
      for (const row of item.sprite.slice(2)) {
        expect(row[0], `${item.id}: hand clearance`).toBe('.')
        expect(row[9], `${item.id}: hand clearance`).toBe('.')
      }
    }
  })

  it('offers ungated, positive-weight tops in every rarity and reaches each new wearable through presents', () => {
    for (const rarity of RARITIES) {
      expect(tops.some((item) => item.rarity === rarity && !item.minTags && (item.dropWeight ?? 1) > 0), rarity).toBe(true)
    }
    for (const item of [...tops, ...newHeadwear]) {
      expect(item, 'headwear is in the catalogue').toBeDefined()
      expect(item.minTags, item.id).toBeUndefined()
      expect(item.dropWeight, item.id).toBeGreaterThan(0)
      const pool = ITEMS.filter((candidate) => candidate.rarity === item.rarity && !candidate.minTags && (candidate.dropWeight ?? 1) > 0)
      const totalWeight = pool.reduce((sum, candidate) => sum + (candidate.dropWeight ?? 1), 0)
      const itemIndex = pool.indexOf(item)
      expect(itemIndex, item.id).toBeGreaterThanOrEqual(0)
      const beforeWeight = pool.slice(0, itemIndex).reduce((sum, candidate) => sum + (candidate.dropWeight ?? 1), 0)
      const pick = (beforeWeight + (item.dropWeight ?? 1) / 2) / totalWeight
      expect(rollItem(() => pick, item.rarity).id, item.id).toBe(item.id)
    }
  })

  it('gives every headpiece an explicit fit that stays clear of the enlarged eyes', () => {
    for (const item of ITEMS.filter((candidate) => candidate.kind === 'hat')) {
      expect(['cap', 'band', 'earwear', 'floating'], item.id).toContain(item.hatFit)
      if (item.hatFit === 'cap' || item.hatFit === 'band') {
        expect(item.hatSit, `${item.id}: brim above the eyes`).toBe(1)
      } else if (item.hatFit === 'floating') {
        expect(item.hatSit, `${item.id}: intentional crown clearance`).toBeLessThan(0)
      } else {
        expect(item.hatSit, `${item.id}: cups at the ears`).toBe(3)
        expect(item.sprite[0], `${item.id}: cups outside the head`).toHaveLength(12)
        // The final three rows descend around the head. Only the two outer
        // columns on either side may paint; the entire face remains open.
        for (const row of item.sprite.slice(-3)) {
          expect(row.slice(2, -2), `${item.id}: face clearance`).toBe('........')
        }
      }
    }
    for (const item of newHeadwear) {
      expect(item.kind, item.id).toBe('hat')
      expect(item.hatSit, item.id).toBeGreaterThanOrEqual(0)
      expect(item.hatSit, item.id).toBeLessThanOrEqual(3)
    }
  })

  it('keeps every top on the same native pixel grid without stretching the legacy Julien shirt', () => {
    for (const item of ITEMS.filter((candidate) => candidate.kind === 'shirt')) {
      expect(item.sprite, `${item.id}: native torso rows`).toHaveLength(5)
      for (const row of item.sprite) expect(row, `${item.id}: native torso width`).toHaveLength(10)
      expect(item.sprite[0].slice(4, 6), `${item.id}: open neck`).toBe('..')
    }
    const julien = ITEM_BY_ID.get('hail-king-julien-shirt')!
    expect(julien.kind).toBe('shirt')
    expect(julien.rarity).toBe('legendary')
    expect(julien.dropWeight).toBe(0.2)
  })
})
