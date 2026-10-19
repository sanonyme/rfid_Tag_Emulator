import type { HairStyle } from '@/lib/workshop-appearance'

// A full-body 20×30 rig. Art pixels are half a floor unit: the gameplay footprint
// stays 10×15, while the head, hanging arms and trouser legs have their own space.
// All frames face right and share a single origin, including fitted equipment.
export const CHARACTER_COLS = 20
export const CHARACTER_ROWS = 30
/** One complete left/right cycle, measured in the engine's expanded-floor pixels. */
export const CHARACTER_STRIDE_PX = 64
export type CharacterPose = 'idle' | 'stepA' | 'stepB'

export function characterFrame(rows: readonly string[], x = 0, y = 0): readonly string[] {
  return Array.from({ length: CHARACTER_ROWS }, (_, r) => {
    const row = rows[r - y] ?? ''
    return '.'.repeat(x).concat(row).padEnd(CHARACTER_COLS, '.').slice(0, CHARACTER_COLS)
  })
}

export const CHARACTER_HEAD = characterFrame([
  '..oooooo..',
  '.osSSSSSo.',
  'osSSSSSSSo',
  'osSSbbSbb.',
  'osSSWPSWP.',
  'osSSWPSWP.',
  '.osSSSSSSo',
  '..osSSSSo.',
  '...osSSo..',
], 6, 4)

export const CHARACTER_TORSO = {
  male: characterFrame([
    '.oCCCCCCo.',
    'oCHCsSCCco',
    'oCHCCCCCco',
    'oCHCCCCCco',
    'oCHCCGCCco',
    'oCHCCCCCco',
    'oCCCCCCCco',
    '.oCCCpCCco',
    '.oCCCCCCco',
    '..oBBBBGo.',
  ], 6, 12),
  female: characterFrame([
    '.oCCCCCCo.',
    'oCHCsSCCco',
    'oCHCCCCCco',
    'oCHCCCCCco',
    'oCHCCGCCco',
    '.oHCCCCCco',
    '.oCCCCCCo.',
    '.oCCCpCCo.',
    '.oCCCCCCco',
    '..oBBBBGo.',
  ], 6, 12),
}

type Joint = readonly [number, number]
type Leg = { knee: Joint; ankle: Joint }
// A foot follows a shallow loop: six small ground steps, toe-off, then a bent
// recovery. The other leg repeats it half a cycle later. The previous recovery
// jumped five pixels and exchanged the idle hips, making the knees snap sideways.
const FOOT_CYCLE: readonly Leg[] = [
  { knee: [10, 25], ankle: [12, 28] },
  { knee: [10, 25], ankle: [11, 28] },
  { knee: [9, 25], ankle: [10, 28] },
  { knee: [8, 25], ankle: [9, 28] },
  { knee: [8, 25], ankle: [8, 28] },
  { knee: [7, 25], ankle: [7, 28] },
  { knee: [7, 25], ankle: [6, 28] },
  { knee: [8, 25], ankle: [6, 27] },
  { knee: [9, 24], ankle: [7, 26] },
  { knee: [10, 24], ankle: [9, 26] },
  { knee: [11, 24], ankle: [11, 26] },
  { knee: [11, 25], ankle: [12, 27] },
]
const HAND_CYCLE = [4, 4, 5, 5, 6, 7, 8, 8, 7, 7, 6, 5]

function limbFrame(paint: (dot: (x: number, y: number, color: string) => void) => void): readonly string[] {
  const pixels = Array.from({ length: CHARACTER_ROWS }, () => Array<string>(CHARACTER_COLS).fill('.'))
  paint((x, y, color) => { if (pixels[y] && x >= 0 && x < CHARACTER_COLS) pixels[y][x] = color })
  return pixels.map(row => row.join(''))
}

function legFrame(near: Leg, far: Leg): readonly string[] {
  return limbFrame(dot => {
    const segment = (a: Joint, b: Joint, color: string, width: number) => {
      const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
      for (let n = 0; n <= steps; n++) {
        const x = Math.round(a[0] + (b[0] - a[0]) * n / Math.max(1, steps))
        const y = Math.round(a[1] + (b[1] - a[1]) * n / Math.max(1, steps))
        for (let dx = 0; dx < width; dx++) dot(x + dx - (width === 4 ? 1 : 0), y, color)
      }
    }
    const leg = (hip: Joint, joints: Leg, front: boolean) => {
      segment(hip, joints.knee, 'o', 4)
      segment(joints.knee, joints.ankle, 'o', 4)
      segment(hip, joints.knee, front ? 'L' : 'l', 2)
      segment(joints.knee, joints.ankle, front ? 'L' : 'l', 2)
      if (front) segment(hip, joints.knee, 'H', 1)
      const [x, y] = joints.ankle
      for (let dx = -1; dx <= 2; dx++) { dot(x + dx, y, 'o'); dot(x + dx, y + 1, 'o') }
      for (let dx = 0; dx <= 1; dx++) dot(x + dx, y, front ? (dx === 0 ? 'K' : 'k') : 'K')
    }
    leg([12, 22], far, false)
    leg([8, 22], near, true)
  })
}

function armFrame(hand: number, front: boolean, lift = 0): readonly string[] {
  return limbFrame(dot => {
    const shoulder = front ? 6 : 14
    const wristY = 20 - lift
    // The elbow leads the forearm by a smaller amount than the wrist.
    const elbow = Math.round(shoulder + (hand - shoulder) * 0.45)
    for (let y = 14; y <= wristY + 1; y++) {
      const x = y <= 17 ? Math.round(shoulder + (elbow - shoulder) * (y - 14) / 3) : Math.round(elbow + (hand - elbow) * Math.min(1, (y - 17) / (wristY - 17)))
      for (let dx = -1; dx <= 2; dx++) dot(x + dx, y, 'o')
      if (y < wristY - 2) { dot(x, y, front ? 'H' : 'c'); dot(x + 1, y, 'C') }
      else if (y === wristY - 2) { dot(x, y, 'c'); dot(x + 1, y, 'C') }
      else if (y <= wristY) { dot(x, y, 'S'); dot(x + 1, y, 's') }
    }
  })
}

// Bake the entire walk once; the hot draw path only selects cached pixel art.
export const CHARACTER_WALK = FOOT_CYCLE.map((near, i) => {
  const opposite = (i + FOOT_CYCLE.length / 2) % FOOT_CYCLE.length
  const far = FOOT_CYCLE[opposite]
  const wristLift = Math.abs(HAND_CYCLE[i] - 6) === 2 ? 1 : 0
  return {
    legs: legFrame(near, { knee: [far.knee[0] + 2, far.knee[1]], ankle: [far.ankle[0] + 2, far.ankle[1]] }),
    front: armFrame(HAND_CYCLE[i], true, wristLift),
    back: armFrame(HAND_CYCLE[opposite] + 8, false, wristLift),
    // Only the upper assembly settles on loading; soles stay on the ground.
    bodyDip: i % 6 === 1 || i % 6 === 2 ? 1 : 0,
  }
})
export const CHARACTER_AIRBORNE = {
  legs: legFrame({ knee: [13, 24], ankle: [11, 27] }, { knee: [8, 24], ankle: [6, 26] }),
  front: armFrame(5, true),
  back: armFrame(16, false),
  bodyDip: 0,
}

// Idle uses the same hips, shoulders and line weights as the moving rig.
export const CHARACTER_ARMS = { idle: { front: armFrame(6, true), back: armFrame(14, false) } }
export const CHARACTER_LEGS = { idle: legFrame({ knee: [8, 25], ankle: [8, 28] }, { knee: [12, 25], ankle: [12, 28] }) }
const CHARACTER_IDLE = { legs: CHARACTER_LEGS.idle, ...CHARACTER_ARMS.idle, bodyDip: 0 }
export function characterMotion(pose: CharacterPose, phase: number | undefined, airborne: boolean) {
  if (airborne) return CHARACTER_AIRBORNE
  if (pose === 'idle') return CHARACTER_IDLE
  const cycle = phase !== undefined && Number.isFinite(phase) ? phase - Math.floor(phase) : pose === 'stepA' ? 0 : 0.5
  // Do not add 1 then take modulo for positive phases: it rounds exact twelfths
  // down to the previous frame and makes the scrubber/contact sheet stutter.
  return CHARACTER_WALK[Math.min(CHARACTER_WALK.length - 1, Math.floor(cycle * CHARACTER_WALK.length + 1e-9))]
}

const HAIR: Record<HairStyle, { back: readonly string[]; front: readonly string[] }> = {
  short: {
    back: characterFrame(['..hhhhhhhh..', '.hHHHHHHHHh.', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', '.hHHHHHHHhh.', '.hHHHHHHhh..', '..hhhhhh....'], 4, 2),
    front: characterFrame(['...hh.hhh...', '..hHHhHhHh..', '.hHhAHHHHHh.', 'hHHAAHHAAHhh', 'hHHHHhHHHHhh', '.hHhh.hHhhh.', '.hHh........', '..hh........'], 4, 1),
  },
  swept: {
    back: characterFrame(['..hhhhhhhh..', '.hHHHHHHHHh.', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', '.hHHHHHHHhh.', '.hHHHHHHhh..', '..hhhhhh....'], 4, 2),
    front: characterFrame(['.....hhhh...', '...hhAHHHhh.', '..hAAAHHHHHh', '.hAAAHHHHHHh', 'hAAHHHHHHHh.', 'hHHHHhhhHHh.', '.hHHh...hh..', '.hHh........', '..hh........'], 4, 0),
  },
  bob: {
    back: characterFrame(['..hhhhhhhhh.', '.hHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', '.hhhhhhhhhh.'], 4, 2),
    front: characterFrame(['..hhhhhhhh..', '.hHAAAHHHHh.', 'hHAAHHHHHHhh', 'hHAHHHHHHHhh', 'hHHhhhhhhhh.', 'hHHh........', 'hHHh........', 'hHHh........', '.hhh........'], 4, 2),
  },
  long: {
    back: characterFrame(['..hhhhhhhh..', '.hHHHHHHHHh.', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', '.hHHHHHHHhh.', '.hHHHHHHHhh.', '..hhHHHhhh..', '....hhh.....'], 4, 2),
    front: characterFrame(['..hhhhhhhh..', '.hHAAAHHHHh.', 'hHAAHHHHHHhh', 'hHAHHHHHHHhh', 'hHHHhhhHHhh.', 'hHHh........', 'hHHh........', 'hHHh........', 'hHHh........', 'hHHh........', 'hHHh........', '.hHh........', '.hhh........'], 4, 2),
  },
  braids: {
    back: characterFrame(['..hhhhhhhh..', '.hHHHHHHHHh.', 'hHHHHHHHHHhh', 'hHHHHHHHHHhh', '.hHHHHHHHhh.', '.hHHHHHHHhh.', '.hHHHHHHHhh.', '.hHHHHHHHhh.', 'hHHh....hHHh', '.hHH....HHh.', 'hHHh....hHHh', '.hHH....HHh.', 'hHHh....hHHh', '.hGG....GGh.', '..hh....hh..'], 4, 2),
    front: characterFrame(['..hhhhhhhh..', '.hHAAhAHHHh.', 'hHAAHhHHHHhh', 'hHAHHhHHHHhh', 'hHHhh.hhHHh.', '.hHh........', '..hh........'], 4, 2),
  },
  bald: { back: characterFrame([]), front: characterFrame([]) },
}

const fitHair = (rows: readonly string[], cap: boolean, front: boolean): readonly string[] => rows.map((row, y) => [...row].map((ch, x) => {
  if (cap && y < 7) return '.'
  if (cap && y < 11 && (x < 6 || x > 14)) return '.'
  // The swept fringe and sideburns never overwrite the eye sockets or nose.
  if (front && y >= 8 && y <= 12 && x >= 8 && x <= 15) return '.'
  return ch
}).join(''))

export const CHARACTER_HAIR = Object.fromEntries(Object.entries(HAIR).map(([style, hair]) => [style, {
  full: { back: hair.back, front: fitHair(hair.front, false, true) },
  cap: { back: fitHair(hair.back, true, false), front: fitHair(hair.front, true, true) },
}])) as Record<HairStyle, { full: typeof HAIR[HairStyle]; cap: typeof HAIR[HairStyle] }>

// Miniature pixels are sampled once per layer; its eye is deliberately authored
// at 1px so nearest-neighbour reduction can never erase the white/pupil pair.
const minis = new WeakMap<readonly string[], readonly string[]>()
export function miniatureCharacter(rows: readonly string[]): readonly string[] {
  let mini = minis.get(rows)
  if (!mini) {
    mini = Array.from({ length: 15 }, (_, y) => Array.from({ length: 10 }, (_, x) => rows[y * 2 + 1]?.[x * 2 + 1] ?? '.').join(''))
    minis.set(rows, mini)
  }
  return mini
}

export const CHARACTER_MINI_HEAD = miniatureCharacter(CHARACTER_HEAD).map((row, y) => y === 4 || y === 5 ? row.slice(0, 5) + 'WP' + row.slice(7) : row)

export const CHARACTER_CAP = characterFrame([
  'W.........',
  '.HH.......',
  '..HHHH....',
  '..HHHHhH..',
  '.WWWWWWWW.',
], 6, 2)
