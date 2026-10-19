import { beforeEach, describe, expect, it } from 'vitest'
import { BASE_OUTFITS, DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, isElfAppearance, parseElfAppearance, type ElfAppearance } from '../workshop-appearance'
import { PROFILE_KEY, addToBag, loadProfile, newProfile, saveProfile } from '../workshop-profile'
import { WORKSHOP_MAX_PACKET_BYTES, decodeWorkshopPacket, encodeWorkshopPacket, parseWorkshopMessage, type WorkshopPayload } from '../workshop-protocol'
import { createGame, customizeElf, equipFromBag, netTick, receive } from '../../components/workshop/workshop-engine'

const look: ElfAppearance = { gender: 'female', skin: 4, hairStyle: 'braids', hairColor: 4, outfit: 2, starterHat: false }
const state = { id: 'peer0000', seq: 1, t: 'state' as const, name: 'Snow', hat: 2, x: 0.5, y: 0, dir: 1 as const, mv: false }
const net = { send: () => {}, sound: false }
beforeEach(() => localStorage.clear())

describe('elf appearance saves and compatibility', () => {
  it('gives each new profile its own free default cosmetics, not inventory items', () => {
    const first = newProfile(), second = newProfile()
    expect(first.appearance).toEqual(DEFAULT_APPEARANCE)
    expect(first.appearanceAt).toBe(0)
    first.appearance.hairColor = 3
    expect(second.appearance).toEqual(DEFAULT_APPEARANCE)
    expect(first.bag).toEqual([])
  })

  it('migrates the legacy quick colour without changing equipment or guest items', () => {
    const legacy = newProfile()
    addToBag(legacy, 'santa-hat', 'present')
    legacy.equipped.hat = 'santa-hat'
    const raw = { ...legacy } as Record<string, unknown>
    delete raw.appearance
    delete raw.appearanceAt
    localStorage.setItem(PROFILE_KEY, JSON.stringify(raw))
    localStorage.setItem('workshop-hat', '4')
    const loaded = loadProfile()
    expect(loaded.appearance).toEqual({ ...DEFAULT_APPEARANCE, outfit: 4 })
    expect(loaded.equipped.hat).toBe('santa-hat')
    expect(loaded.bag).toEqual(legacy.bag)
  })

  it('round-trips customized profiles, including clothing, without using the legacy colour', () => {
    const profile = newProfile()
    profile.appearance = { ...look }
    profile.appearanceAt = 1000
    addToBag(profile, 'qa-lab-coat', 'present')
    profile.equipped.shirt = 'qa-lab-coat'
    saveProfile(profile)
    localStorage.setItem('workshop-hat', '5')
    expect(loadProfile()).toEqual(profile)
  })

  it('repairs invalid saved fields and rejects unsafe update timestamps', () => {
    expect(parseElfAppearance({ ...look, skin: 100, hairStyle: 'script', starterHat: 1 })).toEqual({ ...look, skin: DEFAULT_APPEARANCE.skin, hairStyle: DEFAULT_APPEARANCE.hairStyle, starterHat: true })
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ appearance: look, appearanceAt: -1 }))
    expect(loadProfile().appearanceAt).toBe(0)
  })

  it('validates every supported style combination and rejects out-of-range wire input', () => {
    for (const gender of ['male', 'female'] as const) for (const hairStyle of HAIR_STYLES) {
      expect(isElfAppearance({ ...look, gender, hairStyle })).toBe(true)
    }
    for (const patch of [{ gender: 'other' }, { skin: -1 }, { skin: SKIN_TONES.length }, { skin: 1.5 }, { hairColor: HAIR_COLORS.length }, { outfit: BASE_OUTFITS.length }, { starterHat: 'false' }, { hairStyle: 'unknown' }]) {
      expect(parseWorkshopMessage({ ...state, av: { ...look, ...patch } })).toBeNull()
    }
    expect(parseWorkshopMessage({ ...state, av: null })).toBeNull()
    expect(parseWorkshopMessage(state)).toEqual(state)
  })

  it('round-trips optional identity and RFID clothing inside the legacy packet size limit', () => {
    const tree = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`peer${String(i).padStart(12, '0')}`, 100_000]))
    const msg = { ...state, id: 'a'.repeat(16), seq: 2 ** 31 - 1, name: 'W'.repeat(16), av: look, sh: 'antenna-technician-parka', wg: 'w'.repeat(24), eq: ['h'.repeat(24), 'p'.repeat(24), 't'.repeat(24)], ti: 'a'.repeat(24), s: [10_000_000, 10_000_000, 10_000_000], tree }
    const encoded = encodeWorkshopPacket('anexya-general', msg)
    expect(encoded).not.toBeNull()
    expect(new TextEncoder().encode(encoded!).length).toBeLessThanOrEqual(WORKSHOP_MAX_PACKET_BYTES)
    expect(decodeWorkshopPacket(encoded!, 'anexya-general')).toEqual(msg)
    expect(parseWorkshopMessage({ ...state, av: { ...look, injected: 'ignored' } })).toEqual({ ...state, av: look })
  })

  it('saves customization immediately and carries it across room remounts without changing owned gear', () => {
    const profile = newProfile()
    addToBag(profile, 'uhf-field-vest', 'present')
    const game = createGame('home', 'Snow', 0, profile)
    equipFromBag(game, 'shirt', 'uhf-field-vest')
    expect(customizeElf(game, look)).toBe(true)
    expect(game.self.appearance).toEqual(look)
    expect(game.self.hat).toBe(look.outfit)
    expect(game.self.equip.shirt).toBe('uhf-field-vest')
    expect(loadProfile().appearance).toEqual(look)
    expect(profile.appearanceAt).toBeGreaterThan(0)
    for (const room of ['home', 'anexya-general', 'edge']) {
      const restored = createGame(room, 'Snow', 0, loadProfile())
      expect(restored.self.appearance).toEqual(look)
      expect(restored.self.equip.shirt).toBe('uhf-field-vest')
    }
    expect(customizeElf(game, { ...look, skin: 20 })).toBe(false)
    expect(game.self.appearance).toEqual(look)
  })

  it('sends cosmetics on full state and preserves remote styles across lean movement/legacy packets', () => {
    const sender = createGame('anexya-general', 'Snow', 0, newProfile())
    customizeElf(sender, look)
    addToBag(sender.profile, 'epc-workshop-hoodie', 'present')
    equipFromBag(sender, 'shirt', 'epc-workshop-hoodie')
    const sent: WorkshopPayload[] = []
    netTick(sender, 10_000, payload => { sent.push(payload) })
    const full = sent[0]
    expect(full).toMatchObject({ t: 'state', hat: look.outfit, av: look, sh: 'epc-workshop-hoodie' })
    const receiver = createGame('anexya-general', 'Peer', 0, newProfile())
    receive(receiver, { ...state, ...full }, net)
    receive(receiver, { ...state, seq: 2, x: 0.7, mv: true, eq: ['', '', ''] }, net)
    expect(receiver.peers.get(state.id)?.appearance).toEqual(look)
    expect(receiver.peers.get(state.id)?.equip.shirt).toBe('epc-workshop-hoodie')
    sender.self.moving = true
    netTick(sender, 10_200, payload => { sent.push(payload) })
    expect(sent[1]).not.toHaveProperty('av')
  })
})
