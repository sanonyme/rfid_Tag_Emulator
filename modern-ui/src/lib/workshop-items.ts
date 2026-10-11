export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_INFO: Record<Rarity, { label: string; color: string; weight: number; boost: number }> = {
  common: { label: 'Common', color: '#cbd5e1', weight: 600, boost: 0 },
  uncommon: { label: 'Uncommon', color: '#4ade80', weight: 260, boost: 1.5 },
  rare: { label: 'Rare', color: '#60a5fa', weight: 105, boost: 3 },
  epic: { label: 'Epic', color: '#c084fc', weight: 30, boost: 5 },
  legendary: { label: 'Legendary', color: '#fbbf24', weight: 5, boost: 8 },
}

export type ItemKind = 'collectible' | 'hat' | 'pet' | 'trail'
export type WearableKind = Exclude<ItemKind, 'collectible'>

export type ItemDef = {
  id: string
  name: string
  rarity: Rarity
  kind: ItemKind
  description: string
  /** Pixel rows; hats are drawn with their last row over the elf's forehead. */
  sprite: readonly string[]
  palette: Readonly<Record<string, string>>
  /** A pixel that alternates between two colours, like a reader LED. */
  blink?: { char: string; on: string; off: string }
}

const TAG = [
  'oooooooooo',
  'owwwwwwwwo',
  'owkkwwkkwo',
  'owkwccwkwo',
  'owkkwwkkwo',
  'owwwwwwwwo',
  'oooooooooo',
]

export const ITEMS: readonly ItemDef[] = [
  // Common
  {
    id: 'plain-tag',
    name: 'Plain Tag',
    rarity: 'common',
    kind: 'collectible',
    description: 'A blank UHF inlay. Every collection starts somewhere.',
    sprite: TAG,
    palette: { o: '#64748b', w: '#f8fafc', k: '#c08a3e', c: '#111827' },
  },
  {
    id: 'paper-label',
    name: 'Paper Label',
    rarity: 'common',
    kind: 'collectible',
    description: 'Barcode on the front, chip on the back.',
    sprite: ['oooooooo', 'owwwwwwo', 'owbwbbwo', 'owbwbbwo', 'owbwbbwo', 'owwwwwwo', 'owggggwo', 'oooooooo'],
    palette: { o: '#6b7280', w: '#fffdf5', b: '#111827', g: '#9ca3af' },
  },
  {
    id: 'sleigh-bell',
    name: 'Sleigh Bell',
    rarity: 'common',
    kind: 'collectible',
    description: 'Rings whenever an Edge process starts. Probably.',
    sprite: ['...dd...', '..yyyy..', '.yWyyyy.', '.yyyyyy.', 'yyyyyyyy', 'oooooooo', '...dd...'],
    palette: { y: '#f2c94c', W: '#fff3b0', o: '#b7862b', d: '#6b4f16' },
  },
  {
    id: 'cocoa-mug',
    name: 'Cocoa Mug',
    rarity: 'common',
    kind: 'collectible',
    description: 'Hot cocoa for long inventory runs.',
    sprite: ['..s.s...', '...s.s..', 'RRRRRR..', 'RccccRRR', 'RrrrrR.R', 'RrrrrRRR', 'RrrrrR..', '.RRRR...'],
    palette: { s: '#e5e7eb', R: '#8f1d24', r: '#d42530', c: '#6b3e26' },
  },
  {
    id: 'red-bauble',
    name: 'Red Bauble',
    rarity: 'common',
    kind: 'collectible',
    description: 'A classic tree ornament. Reads as "festive".',
    sprite: ['...yy...', '..yyyy..', '.rrrrrr.', 'rrWrrrrr', 'rWrrrrrr', 'rrrrrrrd', '.rrrrdd.', '..dddd..'],
    palette: { y: '#f2c94c', r: '#e11d48', W: '#fecdd3', d: '#9f1239' },
  },
  {
    id: 'candy-cane',
    name: 'Candy Cane',
    rarity: 'common',
    kind: 'collectible',
    description: 'Peppermint flavoured. Do not insert into the reader.',
    sprite: ['..wrrw..', '.rw..rw.', '.wr..wr.', '.....rw.', '.....wr.', '.....rw.', '.....wr.', '.....rw.'],
    palette: { r: '#e11d48', w: '#ffffff' },
  },
  {
    id: 'snowball',
    name: 'Snowball',
    rarity: 'common',
    kind: 'collectible',
    description: 'Perfectly packed. Press F on the floor to throw a fresh one.',
    sprite: ['..wwww..', '.wwwwww.', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'bwwwwwwb', '.bbwwbb.', '..bbbb..'],
    palette: { w: '#f8fafc', b: '#bcd3ea' },
  },
  {
    id: 'nfc-mitten',
    name: 'NFC Mitten',
    rarity: 'common',
    kind: 'collectible',
    description: 'Tap to pay, tap to stay warm.',
    sprite: ['..rrrr..', '.rrrrrr.', '.rrrrrr.', 'rr.rrrr.', 'rr.rrrr.', 'rrrrrrr.', '.wwwwww.', '.wwwwww.'],
    palette: { r: '#2f7de1', w: '#f8fafc' },
  },

  // Uncommon
  {
    id: 'snowflake-epc',
    name: 'Snowflake EPC',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'No two EPCs are alike. Neither are snowflakes.',
    sprite: ['oooooooooo', 'owwwwwwwxo', 'owkkwwkkwo', 'owkwccwkwo', 'owkkwwkkwo', 'oxwwwwwwwo', 'oooooooooo'],
    palette: { o: '#2563eb', w: '#dbeafe', k: '#60a5fa', c: '#1e3a8a', x: '#ffffff' },
  },
  {
    id: 'gingerbread-tag',
    name: 'Gingerbread Tag',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Smells like a warehouse at Christmas.',
    sprite: ['..gggg..', '..egge..', '..gwwg..', 'gggggggg', '..gwgg..', '..ggwg..', '.gg..gg.', 'gg....gg'],
    palette: { g: '#b5651d', e: '#3b2412', w: '#ffffff' },
  },
  {
    id: 'holly-inlay',
    name: 'Holly Inlay',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'An antenna grown from holly leaves.',
    sprite: ['g......g', 'gg....gg', 'ggg..ggg', 'gGgg.gGg', '.gggrgg.', '..grrrg.', '...rrr..'],
    palette: { g: '#15803d', G: '#4ade80', r: '#dc2626' },
  },
  {
    id: 'mistletoe-coil',
    name: 'Mistletoe Coil',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Stand under it and get read.',
    sprite: ['..rrrr..', '...rr...', '...g....', '.ggggg..', 'gg.g.gg.', 'g.wgw.g.', '..www...', '...w....'],
    palette: { r: '#dc2626', g: '#16a34a', w: '#f8fafc' },
  },
  {
    id: 'label-roll',
    name: 'Label Roll',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'A fresh roll of encodable labels.',
    sprite: ['..oooo..', '.owwwwo.', 'owwbbwwo', 'owbccbwo', 'owbccbwo', 'owwbbwwo', '.owwwwo.', '..oooo..'],
    palette: { o: '#64748b', w: '#f8fafc', b: '#94a3b8', c: '#1f2937' },
  },
  {
    id: 'santa-hat',
    name: 'Santa Hat',
    rarity: 'uncommon',
    kind: 'hat',
    description: 'The classic. Fluffier than the standard issue.',
    sprite: ['WW........', 'WWrr......', '..rrrr....', '..rrrrrr..', '.rrrrrrrr.', 'WWWWWWWWWW'],
    palette: { W: '#ffffff', r: '#d42530' },
  },
  {
    id: 'penguin',
    name: 'Penguin',
    rarity: 'uncommon',
    kind: 'pet',
    description: 'Waddles behind you. Not a fan of warm heat sinks.',
    sprite: ['..kkkk..', '.kkkkkk.', '.kkwwek.', '.kwwwwo.', '.kwwwwk.', 'kkwwwwkk', '.kwwwwk.', '.oo..oo.'],
    palette: { k: '#1f2937', w: '#f8fafc', e: '#000000', o: '#f59e0b' },
  },
  {
    id: 'frost-steps',
    name: 'Frost Steps',
    rarity: 'uncommon',
    kind: 'trail',
    description: 'Leave little snowflakes wherever you walk.',
    sprite: ['...w...', '.w.w.w.', '..www..', 'wwwcwww', '..www..', '.w.w.w.', '...w...'],
    palette: { w: '#bae6fd', c: '#ffffff' },
  },

  // Rare
  {
    id: 'frosty-tid',
    name: 'Frosty TID',
    rarity: 'rare',
    kind: 'collectible',
    description: 'A tag ID so cold it reads itself.',
    sprite: [...TAG, '.i..i..i..', '.i.....i..'],
    palette: { o: '#0e7490', w: '#ecfeff', k: '#22d3ee', c: '#164e63', i: '#a5f3fc' },
  },
  {
    id: 'gingerbread-reader',
    name: 'Gingerbread Reader',
    rarity: 'rare',
    kind: 'collectible',
    description: 'A fixed reader with a crunchy enclosure. Four antenna ports, all edible.',
    sprite: ['.a......a.', '.a......a.', 'oooooooooo', 'oiiiiiiiio', 'oggggggggo', 'ogwgwgwgLo', 'oggggggggo', 'oooooooooo'],
    palette: { a: '#9ca3af', o: '#5b3a1e', i: '#ffffff', g: '#b5651d', w: '#fde68a', L: '#22c55e' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'elf-handheld',
    name: 'Elf Handheld',
    rarity: 'rare',
    kind: 'collectible',
    description: 'A handheld reader sized for small hands.',
    sprite: ['......a.', '......a.', '.oooooo.', 'oggggggo', 'ogssssgo', 'ogssssgo', 'oggggggo', 'ogkgkggo', 'ogkgkggo', '.oooooo.'],
    palette: { a: '#9ca3af', o: '#14532d', g: '#16a34a', s: '#67e8f9', k: '#bbf7d0' },
  },
  {
    id: 'antlers',
    name: 'Reindeer Antlers',
    rarity: 'rare',
    kind: 'hat',
    description: 'Practically guarantees a spot on the sleigh team.',
    sprite: ['b........b', 'bb.b..b.bb', '.bbb..bbb.', '..bb..bb..', '...b..b...', '.hhhhhhhh.'],
    palette: { b: '#a0662f', h: '#7a4b1c' },
  },
  {
    id: 'antenna-cap',
    name: 'Antenna Cap',
    rarity: 'rare',
    kind: 'hat',
    description: 'Picks up tags from across the floor. The light means it is listening.',
    sprite: ['...L......', '...a......', '..cccc....', '.cccccc...', '.ccccccc..', '.cccccccvv'],
    palette: { L: '#ef4444', a: '#9ca3af', c: '#2f7de1', v: '#1e3a8a' },
    blink: { char: 'L', on: '#ef4444', off: '#7f1d1d' },
  },
  {
    id: 'snowman',
    name: 'Snowman Buddy',
    rarity: 'rare',
    kind: 'pet',
    description: 'Follows you around and never melts on the job.',
    sprite: ['...kk...', '..kkkk..', '.kkkkkk.', '..swws..', '..wewo..', '..swws..', '.rrrrrr.', '.swwwws.', '.swwbws.', '..ssss..'],
    palette: { k: '#111827', w: '#f8fafc', s: '#94a3b8', e: '#111827', o: '#f97316', r: '#dc2626', b: '#111827' },
  },
  {
    id: 'gold-sparkle',
    name: 'Gold Sparkles',
    rarity: 'rare',
    kind: 'trail',
    description: 'Every step glitters.',
    sprite: ['...y...', '...y...', '..yYy..', 'yyYWYyy', '..yYy..', '...y...', '...y...'],
    palette: { y: '#f59e0b', Y: '#fcd34d', W: '#fffbeb' },
  },

  // Epic
  {
    id: 'aurora-chip',
    name: 'Aurora Chip',
    rarity: 'epic',
    kind: 'collectible',
    description: 'Glows green and violet whenever it is near the North Pole.',
    sprite: ['..p.p.p..', '.ooooooo.', 'pogggggop', '.ogvvvgo.', 'pogvcvgop', '.ogvvvgo.', 'pogggggop', '.ooooooo.', '..p.p.p..'],
    palette: { p: '#cbd5e1', o: '#312e81', g: '#34d399', v: '#a78bfa', c: '#f0abfc' },
  },
  {
    id: 'polar-gateway',
    name: 'Polar Gateway',
    rarity: 'epic',
    kind: 'collectible',
    description: 'A portal reader at the edge of the world. Everything that passes gets counted.',
    sprite: ['..oooooo..', '.oppppppo.', 'opvvvvvvpo', 'opvggggvpo', 'opvgccgvpo', 'opvgccgvpo', 'opvggggvpo', 'opvvvvvvpo', 'oppppppppo', 'oooooooooo'],
    palette: { o: '#1e1b4b', p: '#64748b', v: '#a78bfa', g: '#34d399', c: '#ecfeff' },
  },
  {
    id: 'star-topper',
    name: 'Star Topper',
    rarity: 'epic',
    kind: 'hat',
    description: 'Wear the top of the tree. Everyone will look up to you.',
    sprite: ['....Y.....', '...yyy....', 'yyyyyyyyy.', '.yyyyyyy..', '..yyyyy...', '.yy...yy..', '.hhhhhhhh.'],
    palette: { Y: '#fff1a8', y: '#f5c542', h: '#b45309' },
  },
  {
    id: 'reindeer',
    name: 'Little Reindeer',
    rarity: 'epic',
    kind: 'pet',
    description: 'Its nose glows red. You know the one.',
    sprite: ['......a.a.', '.......aa.', '......bbbb', '......bebr', 'bb...bbbb.', '.bbbbbbbb.', '.bbbbbbbb.', '.b.b..b.b.', '.b.b..b.b.'],
    palette: { a: '#d6a76c', b: '#8b5a2b', e: '#111827', r: '#ef4444' },
  },
  {
    id: 'rf-waves',
    name: 'RF Waves',
    rarity: 'epic',
    kind: 'trail',
    description: 'Broadcast your presence at 915 MHz with every step.',
    sprite: ['..vvvv..', '.v....v.', 'v..vv..v', '..v..v..', '...cc...', '...cc...', '...oo...', '..oooo..'],
    palette: { v: '#c084fc', c: '#f0abfc', o: '#6b21a8' },
  },

  // Legendary
  {
    id: 'golden-epc',
    name: 'Golden EPC',
    rarity: 'legendary',
    kind: 'collectible',
    description: 'EPC 3034 0000 0000 0000 0000 0001. The very first tag.',
    sprite: ['oooooooooo', 'owWwwwwwwo', 'oWkkwwkkwo', 'owkwccwkwo', 'owkkwwkkWo', 'owwwwwwWwo', 'oooooooooo'],
    palette: { o: '#92400e', w: '#fcd34d', W: '#fffbeb', k: '#f59e0b', c: '#78350f' },
  },
  {
    id: 'frost-crown',
    name: 'Frost Crown',
    rarity: 'legendary',
    kind: 'hat',
    description: 'For the elf who read them all.',
    sprite: ['.W..WW..W.', '.y..yy..y.', '.yy.yy.yy.', '.yyyyyyyy.', '.yrybbyry.', '.CCCCCCCC.'],
    palette: { W: '#ffffff', y: '#f5c542', r: '#ef4444', b: '#3b82f6', C: '#b7791f' },
  },
  {
    id: 'robo-reader',
    name: 'Robo Reader',
    rarity: 'legendary',
    kind: 'pet',
    description: 'A tiny reader on legs. Beeps lovingly at every tag it sees.',
    sprite: ['...L....', '...a....', '.gggggg.', '.gsssBg.', '.gsBssg.', '.gggggg.', '..g..g..', '.gg..gg.'],
    palette: { L: '#22c55e', a: '#9ca3af', g: '#374151', s: '#22d3ee', B: '#0e7490' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'hex-rain',
    name: 'Hex Rain',
    rarity: 'legendary',
    kind: 'trail',
    description: 'Leaves glowing EPC digits in the snow behind you.',
    sprite: ['kkkkkkkkk', 'kgggkgggk', 'kgkkkkkgk', 'kggkkgggk', 'kgkkkgkkk', 'kgggkgggk', 'kkkkkkkkk'],
    palette: { k: '#052e16', g: '#4ade80' },
  },
]

export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((item) => [item.id, item]))

export function rarityIndex(rarity: Rarity): number {
  return RARITIES.indexOf(rarity)
}

export function rarityAt(index: number): Rarity {
  return RARITIES[Math.min(RARITIES.length - 1, Math.max(0, Math.floor(index)))]
}

export function isWearable(item: ItemDef): item is ItemDef & { kind: WearableKind } {
  return item.kind !== 'collectible'
}

/** Known item of the given wearable kind, or null for anything unknown (e.g. from a newer build). */
export function wearableOrNull(id: string | null | undefined, kind: WearableKind): string | null {
  if (!id) return null
  return ITEM_BY_ID.get(id)?.kind === kind ? id : null
}

/** Bigger sends roll better presents: 0 for a single tag, capped at 0.35 around a thousand. */
export function luckForTagCount(count: number): number {
  if (!Number.isFinite(count) || count <= 1) return 0
  return Math.min(0.35, Math.log10(count) / 8)
}

export function rollRarity(rand: () => number, luck = 0, min: Rarity = 'common'): Rarity {
  const floor = rarityIndex(min)
  const weights = RARITIES.map((r, i) =>
    i < floor ? 0 : RARITY_INFO[r].weight * (1 + Math.max(0, luck) * RARITY_INFO[r].boost),
  )
  const total = weights.reduce((a, b) => a + b, 0)
  let pick = rand() * total
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i]
    if (pick < 0) return RARITIES[i]
  }
  return RARITIES[RARITIES.length - 1]
}

export function rollItem(rand: () => number, rarity: Rarity): ItemDef {
  const pool = ITEMS.filter((item) => item.rarity === rarity)
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
}
