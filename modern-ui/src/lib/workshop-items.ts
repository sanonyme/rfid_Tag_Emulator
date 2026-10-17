export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_INFO: Record<Rarity, { label: string; color: string; weight: number; boost: number }> = {
  common: { label: 'Common', color: '#cbd5e1', weight: 600, boost: 0 },
  uncommon: { label: 'Uncommon', color: '#4ade80', weight: 260, boost: 1.5 },
  rare: { label: 'Rare', color: '#60a5fa', weight: 105, boost: 3 },
  epic: { label: 'Epic', color: '#c084fc', weight: 30, boost: 5 },
  legendary: { label: 'Legendary', color: '#fbbf24', weight: 5, boost: 8 },
}

// 'shirt' is drawn over the elf's body, 'mount' is drawn under the elf
// (the elf sits on top of it), 'title' is a text label shown next to the name.
// 'consumable' is used once from the bag (drink, eat) and then gone.
export type ItemKind = 'collectible' | 'hat' | 'pet' | 'trail' | 'shirt' | 'wings' | 'mount' | 'title' | 'consumable'
export type WearableKind = Exclude<ItemKind, 'collectible' | 'consumable'>

export type ConsumeEffect = {
  verb: 'Drink' | 'Eat'
  /** Bubble shown above the elf when used. */
  chat: string
  /** Walk-speed multiplier while the buff lasts. */
  speed?: number
  /** Jump-height multiplier while the buff lasts. */
  jump?: number
  /** Clears a snowball bonk. */
  sober?: boolean
  durationMs?: number
  colors?: readonly string[]
}

export type ItemDef = {
  id: string
  name: string
  rarity: Rarity
  kind: ItemKind
  description: string
  /** Pixel rows; hats sit by their last opaque row on the forehead. */
  sprite: readonly string[]
  palette: Readonly<Record<string, string>>
  /** A pixel that alternates between two colours, like a reader LED. */
  blink?: { char: string; on: string; off: string }
  /**
   * How many elf-head rows the hat brim overlaps. Default 2 tucks it onto the
   * forehead; 0 sits on the crown; negative floats above (halo).
   */
  hatSit?: number
  /** Text shown next to the elf's name when a 'title' item is equipped. */
  titleText?: string
  /** Only drops when the send had at least this many tags. */
  minTags?: number
  /** Weight inside its rarity pool (default 1). 0.2 = five times rarer than a normal item of that tier. */
  dropWeight?: number
  /** Required on kind 'consumable': what happens when the player uses it. */
  consume?: ConsumeEffect
  /** Optional décor and pet behavior used by the Workshop engine. */
  placeable?: boolean
  sign?: string
  mount?: boolean
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
  {
    id: 'leaf-wings', name: 'Sprout Wings', rarity: 'common', kind: 'wings',
    description: 'Your first pair of wings. Press jump again in the air for a second jump.',
    sprite: ['.....gg', '...ggGg', '..ggGGg', '.ggGGGg', 'ggGGGgg', 'gGGGgg.', 'ggGgg..', '.ggg...', '..gg...', '...g...'],
    palette: { g: '#1f7057', G: '#86efac' },
  },
  {
    id: 'angel-wings', name: 'Cloud Wings', rarity: 'rare', kind: 'wings',
    description: 'Soft ivory feathers and a second jump. A little piece of the sky.',
    sprite: ['.....ww', '...wwWw', '..wwWWw', '.wwWWWw', 'wwWWWww', 'wWWWww.', 'wwWww..', '.www...', '..ww...', '...w...'],
    palette: { w: '#93c5fd', W: '#f0f9ff' },
  },
  {
    id: 'dragon-wings', name: 'Ember Wings', rarity: 'epic', kind: 'wings',
    description: 'Glowing dragon membranes. Equip for a fiery silhouette and a second jump.',
    sprite: ['r......', 'rr.....', 'rRr....', 'rRRr..r', 'rRRRrrr', 'rRRRRrr', 'rrRRrr.', '.rRrr..', '..rr...', '...r...'],
    palette: { r: '#7f1d44', R: '#fb7185' },
  },
  {
    id: 'prism-wings', name: 'Prism Wings', rarity: 'legendary', kind: 'wings',
    description: 'A pair of luminous crystal fans. Flap once more while airborne.',
    sprite: ['.....cc', '...ccCc', '..ccCCc', '.ccCCCc', 'ccCCCcc', 'cCCCcc.', 'ccCcc..', '.ccc...', '..cc...', '...c...'],
    palette: { c: '#7c3aed', C: '#67e8f9' },
    blink: { char: 'C', on: '#67e8f9', off: '#f0abfc' },
  },
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
    kind: 'consumable',
    description: 'Hot cocoa for long inventory runs. Drink it to shake off a snowball.',
    consume: {
      verb: 'Drink',
      chat: 'Ahh...',
      sober: true,
      speed: 1.15,
      durationMs: 10_000,
      colors: ['#6b3e26', '#f8fafc', '#d42530'],
    },
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
    kind: 'consumable',
    description: 'Peppermint flavoured. Eat it for a peppermint bounce. Do not insert into the reader.',
    consume: {
      verb: 'Eat',
      chat: 'Nom!',
      jump: 1.35,
      durationMs: 8_000,
      colors: ['#e11d48', '#ffffff'],
    },
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
    // Halfway: default 2 sat on the eyes; 0 floated above the crown.
    hatSit: 1,
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

  // Warehouse & everyday — not just the holidays
  {
    id: 'barcode-sticker',
    name: 'Barcode Sticker',
    rarity: 'common',
    kind: 'collectible',
    description: 'Black bars, white quiet zone. The chip is the interesting part.',
    sprite: ['wwwwwwww', 'wbwbwbww', 'wwbwbwbw', 'wbwwbwbw', 'wwwwwwww', 'wggggggw'],
    palette: { w: '#f8fafc', b: '#111827', g: '#94a3b8' },
  },
  {
    id: 'cardboard-box',
    name: 'Carton',
    rarity: 'common',
    kind: 'collectible',
    description: 'SSCC on the side, tape on the top, mystery in the middle.',
    sprite: ['..oooo..', '.oCCCCo.', 'oCCttCCo', 'oCCooCCo', 'oCCCCCCo', '.oooooo.'],
    palette: { o: '#92400e', C: '#d97706', t: '#fde68a' },
  },
  {
    id: 'zip-tie',
    name: 'Zip Tie',
    rarity: 'common',
    kind: 'collectible',
    description: 'Holds the antenna cable. Forever.',
    sprite: ['yyyyyyyy', 'y......y', 'y.kkkk.y', 'y.k..k.y', 'yyyyyyyy'],
    palette: { y: '#111827', k: '#e5e7eb' },
  },
  {
    id: 'usb-dongle',
    name: 'USB Dongle',
    rarity: 'common',
    kind: 'collectible',
    description: 'The one that walks off the dock every Friday.',
    sprite: ['..ssss..', '.sbbbbb.', '.sbwwbb.', '.sbbbbb.', '..bbbb..', '..bbbb..'],
    palette: { s: '#e5e7eb', b: '#2563eb', w: '#ffffff' },
  },
  {
    id: 'coffee-cup',
    name: 'Shift Coffee',
    rarity: 'common',
    kind: 'consumable',
    description: 'Fuel for a 4 a.m. cycle count. Drink it and the aisle gets shorter.',
    consume: {
      verb: 'Drink',
      chat: 'Eyes open.',
      sober: true,
      speed: 1.4,
      durationMs: 12_000,
      colors: ['#6b3e26', '#f8fafc', '#e5e7eb'],
    },
    sprite: ['..s.s...', 'WWWWWW..', 'WccccWWW', 'WccccW.W', 'WccccWWW', '.WWWW...'],
    palette: { s: '#e5e7eb', W: '#f8fafc', c: '#6b3e26' },
  },
  {
    id: 'tape-roll',
    name: 'Packing Tape',
    rarity: 'common',
    kind: 'collectible',
    description: 'Clear, loud, and always almost empty.',
    sprite: ['..oooo..', '.oYYYYo.', 'oYYccYYo', 'oYYccYYo', '.oYYYYo.', '..oooo..'],
    palette: { o: '#a16207', Y: '#facc15', c: '#fef9c3' },
  },
  {
    id: 'aa-battery',
    name: 'Spare Battery',
    rarity: 'common',
    kind: 'collectible',
    description: 'For the handheld that dies mid-aisle.',
    sprite: ['...kk...', '..kkkk..', '.gggggg.', '.gggggg.', '.oooooo.', '.oooooo.', '..oooo..'],
    palette: { k: '#9ca3af', g: '#111827', o: '#f97316' },
  },
  {
    id: 'sticky-note',
    name: 'Sticky Note',
    rarity: 'common',
    kind: 'collectible',
    description: '"Recount bay 4" in handwriting nobody claims.',
    sprite: ['yyyyyyyy', 'ybbbbbby', 'ybbybbby', 'ybbbbbby', 'ybbbybby', 'yyyyyyyy'],
    palette: { y: '#fde047', b: '#854d0e' },
  },
  {
    id: 'wrench',
    name: 'Antenna Wrench',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Tightens the mount. Loosens the argument about whose job it was.',
    sprite: ['ss....ss', 'ss....ss', '.ssssss.', '..ssss..', '..ssss..', '..ssss..', '..s..s..'],
    palette: { s: '#94a3b8' },
  },
  {
    id: 'pallet',
    name: 'Wooden Pallet',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Four-way entry. Zero-way patience when it is broken.',
    sprite: ['oooooooooo', 'o..o..o..o', 'oooooooooo', 'o..o..o..o', 'oooooooooo'],
    palette: { o: '#b45309' },
  },
  {
    id: 'dock-light',
    name: 'Dock Light',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Green means the trailer is locked. Red means run.',
    sprite: ['..oooo..', '.oLLLLo.', '.oLLLLo.', '..oooo..', '...aa...', '...aa...'],
    palette: { o: '#1f2937', L: '#22c55e', a: '#4b5563' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'scanner-sled',
    name: 'Scanner Sled',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Clips onto a phone and pretends it was always a handheld.',
    sprite: ['..aaaa..', '.agggga.', '.agssga.', '.agggga.', 'oooooooo', 'o......o'],
    palette: { a: '#111827', g: '#374151', s: '#67e8f9', o: '#9ca3af' },
  },
  {
    id: 'wifi-brick',
    name: 'Wi-Fi Brick',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'The access point taped above the dock door.',
    sprite: ['.ww...ww.', 'w..w.w..w', 'w...w...w', '.ooooooo.', '.oLLoLLo.', '.ooooooo.'],
    palette: { w: '#38bdf8', o: '#e5e7eb', L: '#22c55e' },
    blink: { char: 'L', on: '#22c55e', off: '#166534' },
  },
  {
    id: 'hard-hat',
    name: 'Hard Hat',
    rarity: 'uncommon',
    kind: 'hat',
    description: 'Required on the floor. Optional in the break room.',
    sprite: ['..yyyyyy..', '.yyyyyyyy.', '.yyyyyyyy.', '.yyyyyyyy.', 'yyyyyyyyyy'],
    palette: { y: '#facc15' },
  },
  {
    id: 'dust-trail',
    name: 'Aisle Dust',
    rarity: 'uncommon',
    kind: 'trail',
    description: 'Proof you actually walked the pick path.',
    sprite: ['..c.c...', '.c...c..', '..c.c.c.', '...c....', '..c..c..', '.c....c.'],
    palette: { c: '#d6d3d1' },
  },
  {
    id: 'fixed-reader',
    name: 'Fixed Reader',
    rarity: 'rare',
    kind: 'collectible',
    description: 'Four ports, one heartbeat LED, zero patience for bad cables.',
    sprite: ['oooooooooo', 'oiiiiiiiio', 'oiggggggio', 'oigLgLgLio', 'oiggggggio', 'oooooooooo'],
    palette: { o: '#1f2937', i: '#111827', g: '#4b5563', L: '#22c55e' },
    blink: { char: 'L', on: '#4ade80', off: '#14532d' },
  },
  {
    id: 'portal-frame',
    name: 'Portal Frame',
    rarity: 'rare',
    kind: 'collectible',
    description: 'Walk through it and every tag on you confesses.',
    sprite: ['oo......oo', 'op......po', 'op.cccc.po', 'op.c..c.po', 'op.cccc.po', 'oooooooooo'],
    palette: { o: '#334155', p: '#64748b', c: '#38bdf8' },
  },
  {
    id: 'forklift',
    name: 'Forklift Charm',
    rarity: 'rare',
    kind: 'collectible',
    description: 'Beeps in reverse. Even as a charm.',
    sprite: ['..yy....', '..yyoooo', '..yyyyyo', 'yyyyyyyo', '.kk..kko', '.kk..kk.'],
    palette: { y: '#eab308', o: '#1f2937', k: '#111827' },
  },
  {
    id: 'safety-vest',
    name: 'Hi-Vis Cap',
    rarity: 'rare',
    kind: 'hat',
    description: 'So the forklift sees you before the reader does.',
    sprite: ['..oooooo..', '.oooooooo.', '.oYoYoYoY.', '.oooooooo.', 'oooooooooo'],
    palette: { o: '#f97316', Y: '#fef08a' },
  },
  {
    id: 'barcode-trail',
    name: 'Barcode Steps',
    rarity: 'rare',
    kind: 'trail',
    description: 'You leave a scannable path. Please do not.',
    sprite: ['b.b.bb.b', 'b.b.bb.b', 'wwwwwwww', 'b.bb.b.b', 'b.bb.b.b'],
    palette: { b: '#111827', w: '#f8fafc' },
  },
  {
    id: 'gold-antenna',
    name: 'Gold Antenna',
    rarity: 'epic',
    kind: 'collectible',
    description: 'Reads further than it has any right to. Do not ask how.',
    sprite: ['....yy....', '...yyyy...', '..yyyyyy..', '.yy.yy.yy.', 'yy..yy..yy', '....yy....', '....aa....'],
    palette: { y: '#fbbf24', a: '#92400e' },
  },
  {
    id: 'server-rack',
    name: 'Edge Rack',
    rarity: 'epic',
    kind: 'collectible',
    description: 'A slice of the room where the processes actually live.',
    sprite: ['oooooooo', 'oLLoLLoo', 'oooooooo', 'oLLoLLoo', 'oooooooo', 'oLLoLLoo', 'oooooooo'],
    palette: { o: '#0f172a', L: '#38bdf8' },
    blink: { char: 'L', on: '#38bdf8', off: '#1e3a8a' },
  },
  {
    id: 'signal-crown',
    name: 'Signal Crown',
    rarity: 'epic',
    kind: 'hat',
    description: 'Three bars of coverage, worn like royalty.',
    sprite: ['.c..c..c..', '.c..c..c..', 'cc.cc.cc.c', '.yyyyyyyy.', '.yyyyyyyy.', '.oooooooo.'],
    palette: { c: '#38bdf8', y: '#fbbf24', o: '#92400e' },
  },
  {
    id: 'mini-drone',
    name: 'Count Drone',
    rarity: 'epic',
    kind: 'pet',
    description: 'Hovers the high bays so you do not have to.',
    sprite: ['s......s', '.s....s.', '..oooo..', '..oLLo..', '..oooo..', '...aa...'],
    palette: { s: '#94a3b8', o: '#1e293b', L: '#22d3ee', a: '#64748b' },
    blink: { char: 'L', on: '#22d3ee', off: '#0e7490' },
  },
  {
    id: 'neon-trail',
    name: 'Neon Trail',
    rarity: 'epic',
    kind: 'trail',
    description: 'Night-shift glow. Visible from the mezzanine.',
    sprite: ['...m...', '..mcm..', '.mcccm.', 'mcccccm', '.mcccm.', '..mcm..'],
    palette: { m: '#f472b6', c: '#22d3ee' },
  },
  {
    id: 'null-tag',
    name: 'Null Tag',
    rarity: 'legendary',
    kind: 'collectible',
    description: 'EPC all zeroes. It should not encode. It did anyway.',
    sprite: ['oooooooooo', 'o00000000o', 'o0kk00kk0o', 'o0k0cc0k0o', 'o0kk00kk0o', 'o00000000o', 'oooooooooo'],
    palette: { o: '#020617', '0': '#0f172a', k: '#e2e8f0', c: '#f8fafc' },
  },
  {
    id: 'just-coffee',
    name: 'Just Coffee',
    rarity: 'common',
    kind: 'consumable',
    description: 'Just a cup of coffee. Drink it. That is all.',
    consume: {
      verb: 'Drink',
      chat: 'Just coffee.',
      sober: true,
      speed: 1.3,
      durationMs: 10_000,
      colors: ['#503219', '#eee9df', '#d3bfba'],
    },
    sprite: ['...s..s...', '....s..s..', 'kkkkkkkk..', 'kccccddk..', 'kwwwwwwkkk', 'kwwwwwwk.k', '.kwwwwwkkk', '.kkkkkkk..', 'kssssssssk'],
    palette: { k: '#010101', w: '#eee9df', c: '#503219', d: '#392213', s: '#d3bfba' },
  },
  {
    id: 'master-key',
    name: 'Master Key',
    rarity: 'legendary',
    kind: 'collectible',
    description: 'Opens the cage, the office, and somehow the reader config.',
    sprite: ['..oooo..', '..o..o..', '..oooo..', '....oo..', '....oooo', '....oo..', '....oooo'],
    palette: { o: '#fbbf24' },
  },
  {
    id: 'halo-antenna',
    name: 'Halo Antenna',
    rarity: 'legendary',
    kind: 'hat',
    description: 'A ring of RF floating just above your head. Reads everything.',
    sprite: ['..cccccc..', '.c......c.', 'c...yy...c', '.c......c.', '..cccccc..', '..........'],
    palette: { c: '#fde68a', y: '#ffffff' },
    hatSit: -1,
  },
  {
    id: 'satellite',
    name: 'Pocket Satellite',
    rarity: 'legendary',
    kind: 'pet',
    description: 'Tiny dish, huge range. Follows you between sites.',
    sprite: ['...ss...', '..s..s..', '.s....s.', 'ssssssss', '...oo...', '...oo...', '..oooo..'],
    palette: { s: '#e2e8f0', o: '#334155' },
  },
  {
    id: 'comet-trail',
    name: 'Comet Trail',
    rarity: 'legendary',
    kind: 'trail',
    description: 'A streak of gold and white. You were here, briefly, brightly.',
    sprite: ['......W.', '....WWW.', '..YYYYW.', 'YYYYYY..', '..YYYY..', '....Y...'],
    palette: { W: '#ffffff', Y: '#fbbf24' },
  },

  // ── Desk gear everyone owns ──
  {
    id: 'monitor',
    name: 'Monitor',
    rarity: 'common',
    kind: 'collectible',
    description: 'Shows the log. Mostly the same error, scrolling.',
    sprite: ['oooooooooo', 'osssssssso', 'osgggsssso', 'osssssssso', 'osggssssso', 'oooooooooo', '....oo....', '..oooooo..'],
    palette: { o: '#1f2937', s: '#0f172a', g: '#4ade80' },
  },
  {
    id: 'mouse',
    name: 'Mouse',
    rarity: 'common',
    kind: 'collectible',
    description: 'Click, double-click, wonder why nothing happened.',
    sprite: ['.oooooo.', 'owwkkwwo', 'owwkkwwo', 'owwwwwwo', 'owwwwwwo', 'owwwwwwo', '.owwwwo.', '..oooo..'],
    palette: { o: '#475569', w: '#f1f5f9', k: '#94a3b8' },
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    rarity: 'common',
    kind: 'collectible',
    description: 'Half the keys are worn blank. You know where they are.',
    sprite: ['oooooooooooo', 'okgkgkgkgkgo', 'ogkgkgkgkgko', 'ogkkkkkkkkgo', 'oooooooooooo'],
    palette: { o: '#334155', k: '#e2e8f0', g: '#64748b' },
  },

  // ── Standard industry hardware ──
  {
    id: 'zebra-handheld',
    name: 'Zebra Handheld',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'The warehouse standard. Stripes on top, a dead battery on the floor.',
    sprite: ['.zozozo.', 'oggggggo', 'ogssssgo', 'ogssssgo', 'ogssssgo', 'oggggggo', 'ogkkkkgo', 'ogkkkkgo', '.oooooo.'],
    palette: { o: '#111827', z: '#f8fafc', g: '#374151', s: '#38bdf8', k: '#6b7280' },
  },
  {
    id: 'seuic-handheld',
    name: 'Seuic Handheld',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Scan window lit, keys worn smooth. Gets the job done.',
    sprite: ['..oooo..', '.oLLLLo.', 'oggggggo', 'ogssssgo', 'ogssssgo', 'oggggggo', 'ogkgkgko', 'ogkgkgko', '.oooooo.'],
    palette: { o: '#1e3a8a', g: '#2563eb', s: '#e0f2fe', k: '#93c5fd', L: '#ef4444' },
    blink: { char: 'L', on: '#ef4444', off: '#7f1d1d' },
  },
  {
    id: 'chainway-handheld',
    name: 'Chainway Handheld',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Pistol grip, long read range. Looks like it came to arrest the tags.',
    sprite: ['oooooooo', 'ogssssgo', 'ogssssgo', 'oggggggo', '.oggggo.', '..ogko..', '..ogko..', '..ogko..', '..oooo..'],
    palette: { o: '#7c2d12', g: '#ea580c', s: '#fed7aa', k: '#431407' },
  },
  {
    id: 'rfid-tabletop',
    name: 'RFID Tabletop',
    rarity: 'uncommon',
    kind: 'collectible',
    description: 'Encode here, ship there. Keep coffee away from the panel.',
    sprite: ['oooooooooo', 'oiiiiiiiio', 'oiiicciiio', 'oiiiiiiiLo', 'oooooooooo', '.o......o.'],
    palette: { o: '#334155', i: '#94a3b8', c: '#111827', L: '#22c55e' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'java-king-coffee',
    name: 'Java King Coffee',
    rarity: 'uncommon',
    kind: 'consumable',
    description: 'Brewed strong, crowned in semicolons. Drink it. Long live the build.',
    consume: {
      verb: 'Drink',
      chat: 'Long live the build!',
      sober: true,
      speed: 1.55,
      jump: 1.2,
      durationMs: 16_000,
      colors: ['#6b3e26', '#fbbf24', '#f8fafc'],
    },
    sprite: ['y.yyyy.y', 'yyyyyyyy', 'WWWWWW..', 'WccccWWW', 'WccccW.W', 'WccccWWW', '.WWWW...'],
    palette: { y: '#fbbf24', W: '#f8fafc', c: '#6b3e26' },
  },
  {
    id: 'title-support',
    name: 'Support Title',
    rarity: 'uncommon',
    kind: 'title',
    titleText: 'Support',
    description: 'Picks up on the first ring. Knows which cable it is.',
    sprite: ['oooooooooo', 'oTTcccccTo', 'oTcTTTTTco', 'oTcTTTTTco', 'oTTTTTcTTo', 'oooooooooo'],
    palette: { o: '#166534', T: '#bbf7d0', c: '#14532d' },
  },

  // ── Specialised kit and engineering titles ──
  {
    id: 'c66-handheld',
    name: 'C66 Handheld',
    rarity: 'rare',
    kind: 'collectible',
    description: 'Rugged, physical keys, antenna stub. Survives drops the pallet did not.',
    sprite: ['.....a..', '.oooooo.', 'oggggggo', 'ogssssgo', 'ogssssgo', 'oggggggo', 'okkkkkko', 'okwkkwko', 'okkkkkko', '.oooooo.'],
    palette: { a: '#9ca3af', o: '#111827', g: '#374151', s: '#a7f3d0', k: '#4b5563', w: '#e5e7eb' },
  },
  {
    id: 'utouch2-handheld',
    name: 'UTouch2 Handheld',
    rarity: 'rare',
    kind: 'collectible',
    description: 'All screen, barely any buttons. Please keep your gloves on.',
    sprite: ['.oooooo.', 'oswsssso', 'osssssso', 'osssssso', 'osssssso', 'osssssso', 'oggggggo', 'ogkggkgo', '.oooooo.'],
    palette: { o: '#134e4a', s: '#5eead4', w: '#ccfbf1', g: '#0f766e', k: '#99f6e4' },
  },
  {
    id: 'edge-ubuntu',
    name: 'Edge Ubuntu Device',
    rarity: 'rare',
    kind: 'collectible',
    description: 'A small box running a big job. Uptime: suspiciously long.',
    sprite: ['oooooooooo', 'oggggggggo', 'ogLgguuugo', 'ogLgguwugo', 'ogLgguuugo', 'oggggggggo', 'oooooooooo'],
    palette: { o: '#1f2937', g: '#374151', L: '#22c55e', u: '#e95420', w: '#ffffff' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'title-mobile',
    name: 'Mobile Engineer Title',
    rarity: 'rare',
    kind: 'title',
    titleText: 'Mobile Engineer',
    description: 'Ships to two stores and one very old tablet.',
    sprite: ['oooooooooo', 'oTTppppTTo', 'oTTpsspTTo', 'oTTpsspTTo', 'oTTppppTTo', 'oooooooooo'],
    palette: { o: '#1e3a8a', T: '#bfdbfe', p: '#1e293b', s: '#38bdf8' },
  },
  {
    id: 'title-java',
    name: 'Java Engineer Title',
    rarity: 'rare',
    kind: 'title',
    titleText: 'Java Engineer',
    description: 'Fluent in verbose. Has opinions about the garbage collector.',
    sprite: ['oooooooooo', 'oTTTsTsTTo', 'oTTcccccTo', 'oTTcccccco', 'oTTTcccTTo', 'oooooooooo'],
    palette: { o: '#9a3412', T: '#fed7aa', s: '#e5e7eb', c: '#7c2d12' },
  },

  // ── Big hardware, big hauls, and the ride ──
  {
    id: 'rfid-tunnel',
    name: 'RFID Tunnel',
    rarity: 'epic',
    kind: 'collectible',
    description: 'Cartons go in, a full inventory comes out. Do not stand inside.',
    sprite: ['oooooooooooo', 'opppppLLpppo', 'opoooooooopo', 'op..CCCC..po', 'op..CttC..po', 'op..CCCC..po', 'cccccccccccc', '.oo.oo.oo.oo'],
    palette: { o: '#0f172a', p: '#475569', C: '#d97706', t: '#fde68a', c: '#64748b', L: '#22c55e' },
    blink: { char: 'L', on: '#22c55e', off: '#14532d' },
  },
  {
    id: 'title-qa',
    name: 'QA Engineer Title',
    rarity: 'epic',
    kind: 'title',
    titleText: 'QA Engineer',
    minTags: 500,
    description: 'Earned by sending a big batch. Found the bug before you did.',
    sprite: ['oooooooooo', 'oTTTTTTcTo', 'oTcTTTcTTo', 'oTTcTcTTTo', 'oTTTcTTTTo', 'oooooooooo'],
    palette: { o: '#6b21a8', T: '#f3e8ff', c: '#16a34a' },
  },
  {
    id: 'john-deer-tractor',
    name: 'John Deer Tractor',
    rarity: 'epic',
    kind: 'mount',
    description: 'Ride it to the dock door. Slow, steady, unstoppable.',
    sprite: [
      '..k...gggg....',
      '..k...gssg....',
      'ggggggggsg....',
      'ggggggggggggg.',
      '.kkk..kkkkkk..',
      '.kyk.kkyyykk..',
      '.kkk.kyyyyyyk.',
      '.....kkyyyykk.',
      '......kkkkkk..',
    ],
    palette: { g: '#367c2b', y: '#facc15', k: '#111827', s: '#bae6fd' },
  },

  // ── Super rare ──
  {
    id: 'hail-king-julien-shirt',
    name: 'Hail King Julien Shirt',
    rarity: 'legendary',
    kind: 'shirt',
    dropWeight: 0.2,
    description: 'A big gold J on the chest. Hail to the king, baby.',
    sprite: [
      '.pp.nn.pp.',
      'pppppppppp',
      'pppjjjjppp',
      '.pppppjpp.',
      '.pppppjpp.',
      '.ppjppjpp.',
      '.pppjjjpp.',
      '.pppppppp.',
      '.dddddddd.',
    ],
    palette: { p: '#7e22ce', j: '#fbbf24', n: '#fde68a', d: '#581c87' },
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
  return item.kind !== 'collectible' && item.kind !== 'consumable'
}

export function isConsumable(item: ItemDef): item is ItemDef & { kind: 'consumable'; consume: ConsumeEffect } {
  return item.kind === 'consumable' && item.consume !== undefined
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

/**
 * Picks an item of the given rarity. Items with `minTags` only drop when the
 * send was at least that big, and `dropWeight` makes an item rarer (or more
 * common) inside its tier. Pass the send's tag count as the third argument.
 */
export function rollItem(rand: () => number, rarity: Rarity, tagCount = 0): ItemDef {
  const pool = ITEMS.filter((item) => item.rarity === rarity && (item.minTags ?? 0) <= tagCount)
  const total = pool.reduce((sum, item) => sum + (item.dropWeight ?? 1), 0)
  let pick = rand() * total
  for (const item of pool) {
    pick -= item.dropWeight ?? 1
    if (pick < 0) return item
  }
  return pool[pool.length - 1]
}
