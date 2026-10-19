/** Small, validated cosmetic profile shared by saves, the wire and pixel rendering. */
export const HAIR_STYLES = ['short', 'swept', 'bob', 'long', 'braids', 'bald'] as const
export type HairStyle = typeof HAIR_STYLES[number]
export type ElfAppearance = {
  gender: 'male' | 'female'
  skin: number
  hairStyle: HairStyle
  hairColor: number
  outfit: number
  starterHat: boolean
}

export const SKIN_TONES = [
  { name: 'Porcelain', base: '#f4d8c4', shadow: '#d6aa91', blush: '#dd9a91' },
  { name: 'Peach', base: '#efc29b', shadow: '#c98d6e', blush: '#d78379' },
  { name: 'Honey', base: '#d9a06b', shadow: '#af734f', blush: '#c47665' },
  { name: 'Amber', base: '#ba8054', shadow: '#8c533b', blush: '#aa5f50' },
  { name: 'Umber', base: '#8d5b3f', shadow: '#633b2f', blush: '#94574a' },
  { name: 'Espresso', base: '#634233', shadow: '#412b27', blush: '#7d4c42' },
] as const
export const HAIR_COLORS = [
  { name: 'Chestnut', color: '#75472e', shadow: '#4a2d23', highlight: '#a36a40' },
  { name: 'Ink', color: '#292c32', shadow: '#171e24', highlight: '#4a535c' },
  { name: 'Walnut', color: '#4d352b', shadow: '#30251f', highlight: '#77513a' },
  { name: 'Gold', color: '#d5ad58', shadow: '#a37a38', highlight: '#f1d485' },
  { name: 'Copper', color: '#b86639', shadow: '#7f3d2c', highlight: '#d89959' },
  { name: 'Silver', color: '#c7d4ce', shadow: '#869f9e', highlight: '#eef1df' },
  { name: 'Rose', color: '#bf7384', shadow: '#834c64', highlight: '#e6a3ad' },
  { name: 'Pine', color: '#4d8576', shadow: '#32584f', highlight: '#86b49c' },
] as const
export const BASE_OUTFITS = [
  { name: 'Holly', hat: '#c44449', coat: '#33745a' },
  { name: 'Cranberry', hat: '#33845d', coat: '#a83d48' },
  { name: 'Glacier', hat: '#467fa9', coat: '#355872' },
  { name: 'Honey', hat: '#c79b43', coat: '#79583a' },
  { name: 'Heather', hat: '#816b9e', coat: '#5b4d78' },
  { name: 'Rosewood', hat: '#bf6579', coat: '#824454' },
] as const
export const DEFAULT_APPEARANCE: Readonly<ElfAppearance> = { gender: 'male', skin: 1, hairStyle: 'swept', hairColor: 0, outfit: 0, starterHat: true }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const index = (value: unknown, length: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length

/** Wire validation is strict; malformed appearance must not be trusted. */
export function isElfAppearance(value: unknown): value is ElfAppearance {
  return record(value) && (value.gender === 'male' || value.gender === 'female') && index(value.skin, SKIN_TONES.length)
    && typeof value.hairStyle === 'string' && HAIR_STYLES.includes(value.hairStyle as HairStyle) && index(value.hairColor, HAIR_COLORS.length)
    && index(value.outfit, BASE_OUTFITS.length) && typeof value.starterHat === 'boolean'
}

/** Legacy or damaged local profiles receive safe defaults, one field at a time. */
export function parseElfAppearance(value: unknown): ElfAppearance {
  const raw = record(value) ? value : {}
  return {
    gender: raw.gender === 'female' ? 'female' : 'male',
    skin: index(raw.skin, SKIN_TONES.length) ? raw.skin : DEFAULT_APPEARANCE.skin,
    hairStyle: typeof raw.hairStyle === 'string' && HAIR_STYLES.includes(raw.hairStyle as HairStyle) ? raw.hairStyle as HairStyle : DEFAULT_APPEARANCE.hairStyle,
    hairColor: index(raw.hairColor, HAIR_COLORS.length) ? raw.hairColor : DEFAULT_APPEARANCE.hairColor,
    outfit: index(raw.outfit, BASE_OUTFITS.length) ? raw.outfit : DEFAULT_APPEARANCE.outfit,
    starterHat: typeof raw.starterHat === 'boolean' ? raw.starterHat : DEFAULT_APPEARANCE.starterHat,
  }
}
