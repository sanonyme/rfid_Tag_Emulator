/**
 * Original, articulated wing art. Each 24 × 28 frame has its shoulder at (23, 16)
 * and extends to the left. The renderer uses half-size art pixels, then mirrors
 * and foreshortens a second wing behind it. Geometry is rasterized once here;
 * a paint only looks up the same frozen sprite rows.
 */
export type WingArt = {
  rest: readonly string[]
  raised: readonly string[]
  swept: readonly string[]
  palette: Record<string, string>
}

type Point = readonly [number, number]
type Layer = { fill: string; points: readonly Point[]; edge?: string }
type Pose = 'rest' | 'raised' | 'swept'

const WIDTH = 24
const HEIGHT = 28

function posed([x, y]: Point, pose: Pose): Point {
  const dx = x - 23
  const dy = y - 16
  if (pose === 'raised') return [Math.round(23 + dx * 0.79), Math.round(16 + dx * 0.25 + dy * 0.8)]
  if (pose === 'swept') return [Math.round(23 + dx * 0.86 + dy * 0.1), Math.round(16 - dx * 0.17 + dy * 0.6)]
  return [x, y]
}

function rasterize(layers: readonly Layer[], pose: Pose): readonly string[] {
  const pixels = Array.from({ length: HEIGHT }, () => Array<string>(WIDTH).fill('.'))
  const dot = (x: number, y: number, color: string) => {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) pixels[y][x] = color
  }
  const line = ([ax, ay]: Point, [bx, by]: Point, color: string) => {
    const dx = Math.abs(bx - ax)
    const dy = -Math.abs(by - ay)
    const sx = ax < bx ? 1 : -1
    const sy = ay < by ? 1 : -1
    let error = dx + dy
    for (;;) {
      dot(ax, ay, color)
      if (ax === bx && ay === by) break
      const twice = 2 * error
      if (twice >= dy) { error += dy; ax += sx }
      if (twice <= dx) { error += dx; ay += sy }
    }
  }
  for (const layer of layers) {
    const points = layer.points.map((point) => posed(point, pose))
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let inside = false
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ix, iy] = points[i]
          const [jx, jy] = points[j]
          if ((iy > y + 0.5) !== (jy > y + 0.5) && x + 0.5 < (jx - ix) * (y + 0.5 - iy) / (jy - iy) + ix) inside = !inside
        }
        if (inside) dot(x, y, layer.fill)
      }
    }
    for (let i = 0; i < points.length; i++) line(points[i], points[(i + 1) % points.length], layer.edge ?? layer.fill)
  }
  return Object.freeze(pixels.map((row) => row.join('')))
}

function wing(palette: Record<string, string>, layers: readonly Layer[]): WingArt {
  return Object.freeze({
    palette: Object.freeze(palette),
    rest: rasterize(layers, 'rest'),
    raised: rasterize(layers, 'raised'),
    swept: rasterize(layers, 'swept'),
  })
}

const sprout = wing({
  o: '#203c35', d: '#35604b', m: '#5a8b55', l: '#95b76e', h: '#d5df96', v: '#dfb960', g: '#8d6c39',
}, [
  // The continuous vine binds six overlapping, pointed leaf plumes.
  { fill: 'd', edge: 'o', points: [[2, 5], [9, 6], [17, 11], [23, 16], [23, 19], [17, 21], [7, 21], [3, 15]] },
  { fill: 'm', edge: 'o', points: [[23, 16], [20, 22], [13, 27], [13, 22], [17, 16]] },
  { fill: 'l', points: [[21, 18], [17, 23], [14, 25], [16, 20]] },
  { fill: 'm', edge: 'o', points: [[20, 16], [16, 22], [6, 25], [7, 20], [13, 15]] },
  { fill: 'l', points: [[18, 17], [13, 21], [8, 23], [11, 19]] },
  { fill: 'h', points: [[15, 18], [11, 20], [9, 22]] },
  { fill: 'm', edge: 'o', points: [[16, 14], [14, 19], [5, 20], [1, 16], [8, 13]] },
  { fill: 'l', points: [[13, 15], [10, 18], [4, 17], [8, 15]] },
  { fill: 'h', points: [[10, 15], [6, 16], [4, 16]] },
  { fill: 'm', edge: 'o', points: [[14, 14], [10, 15], [3, 12], [0, 7], [7, 7], [12, 10]] },
  { fill: 'l', points: [[11, 12], [6, 11], [2, 8], [7, 9]] },
  { fill: 'h', points: [[3, 8], [6, 9], [8, 10]] },
  { fill: 'm', edge: 'o', points: [[18, 14], [12, 12], [7, 7], [7, 3], [12, 5], [16, 9]] },
  { fill: 'l', points: [[15, 11], [12, 10], [9, 5], [12, 7]] },
  { fill: 'h', points: [[9, 5], [11, 7], [12, 9]] },
  { fill: 'm', edge: 'o', points: [[23, 16], [19, 15], [16, 9], [17, 6], [21, 9], [23, 13]] },
  { fill: 'l', points: [[21, 13], [19, 11], [18, 8], [20, 10]] },
  { fill: 'g', points: [[4, 9], [12, 14], [23, 17], [23, 19], [12, 16]] },
  { fill: 'v', points: [[6, 10], [13, 15], [23, 17]] },
])

const cloud = wing({
  o: '#384c62', d: '#6d91a6', s: '#a5c5cf', m: '#d5e4df', l: '#f3efda', h: '#fffcef', g: '#c59b5d',
}, [
  // Long primaries radiate from the shoulder, with a short covert layer above.
  { fill: 's', edge: 'o', points: [[23, 16], [21, 23], [14, 27], [13, 25], [17, 17]] },
  { fill: 'l', points: [[21, 19], [18, 24], [15, 26], [18, 20]] },
  { fill: 's', edge: 'o', points: [[21, 15], [18, 22], [9, 26], [8, 24], [13, 17]] },
  { fill: 'l', points: [[18, 17], [15, 22], [10, 24], [14, 19]] },
  { fill: 'h', points: [[17, 18], [13, 21], [10, 24]] },
  { fill: 'm', edge: 'o', points: [[19, 13], [16, 20], [4, 23], [4, 20], [12, 14]] },
  { fill: 'l', points: [[16, 15], [13, 19], [6, 21], [11, 17]] },
  { fill: 'h', points: [[14, 16], [10, 18], [6, 20]] },
  { fill: 'm', edge: 'o', points: [[17, 12], [13, 17], [1, 18], [1, 15], [10, 11]] },
  { fill: 'l', points: [[14, 13], [10, 16], [3, 16], [9, 13]] },
  { fill: 'h', points: [[10, 13], [4, 15], [2, 16]] },
  { fill: 'm', edge: 'o', points: [[15, 10], [11, 14], [0, 12], [0, 9], [8, 8]] },
  { fill: 'l', points: [[12, 11], [9, 12], [2, 10], [8, 10]] },
  { fill: 'h', points: [[3, 10], [7, 10], [10, 11]] },
  { fill: 'l', edge: 'o', points: [[1, 4], [7, 5], [16, 10], [23, 16], [22, 19], [17, 16], [13, 12], [5, 9], [1, 7]] },
  { fill: 'h', points: [[2, 5], [7, 6], [15, 10], [13, 10], [6, 7], [2, 6]] },
  { fill: 'm', points: [[5, 8], [12, 10], [18, 14], [21, 17], [18, 16], [12, 12]] },
  { fill: 'd', points: [[9, 10], [11, 12], [12, 12], [11, 10]] },
  { fill: 'd', points: [[14, 12], [15, 14], [16, 14], [15, 12]] },
  { fill: 'g', points: [[18, 15], [21, 16], [23, 16], [23, 18], [21, 18]] },
  { fill: 'h', points: [[21, 16], [22, 17], [23, 16]] },
])

const ember = wing({
  o: '#482e34', d: '#77363d', s: '#a4443e', m: '#ce6147', l: '#ed9660', g: '#c58b49', h: '#f9d58d',
}, [
  // A forked leading bone and three scalloped membrane bays, not feathers.
  { fill: 'd', edge: 'o', points: [[3, 3], [11, 8], [17, 13], [23, 16], [23, 19], [20, 22], [16, 27], [14, 21], [11, 19], [7, 24], [7, 18], [5, 14], [1, 17], [2, 10]] },
  { fill: 's', points: [[4, 7], [11, 11], [21, 17], [9, 16], [6, 12], [3, 14]] },
  { fill: 'm', points: [[5, 8], [10, 12], [17, 15], [9, 14], [6, 11]] },
  { fill: 'l', points: [[5, 8], [8, 11], [13, 13], [9, 11]] },
  { fill: 's', points: [[9, 16], [21, 18], [14, 19], [9, 22], [9, 19]] },
  { fill: 'm', points: [[11, 17], [19, 18], [14, 18], [10, 20]] },
  { fill: 's', points: [[16, 20], [22, 18], [20, 21], [17, 25]] },
  { fill: 'm', points: [[17, 20], [21, 19], [19, 22], [17, 24]] },
  { fill: 'o', points: [[3, 3], [5, 5], [11, 8], [18, 13], [23, 16], [23, 18], [17, 15], [10, 10], [4, 7]] },
  { fill: 'g', points: [[3, 4], [5, 6], [10, 9], [18, 14], [23, 17], [21, 17], [10, 10], [4, 7]] },
  { fill: 'h', points: [[4, 5], [6, 7], [10, 9], [11, 9]] },
  { fill: 'g', points: [[10, 9], [8, 13], [8, 18], [7, 23], [8, 17], [9, 13]] },
  { fill: 'h', points: [[10, 10], [9, 13], [9, 16]] },
  { fill: 'g', points: [[17, 14], [15, 17], [15, 21], [16, 26], [16, 21], [17, 18]] },
  { fill: 'h', points: [[17, 15], [16, 17], [16, 20]] },
  { fill: 'g', points: [[11, 8], [10, 5], [13, 8], [14, 11]] },
  { fill: 'h', points: [[10, 5], [12, 8]] },
  { fill: 'h', points: [[22, 16], [23, 17], [22, 18], [21, 17]] },
])

const prism = wing({
  o: '#385263', d: '#618a9b', b: '#8cc8d1', i: '#cee8e4', h: '#fff5dc', g: '#c7a15d', r: '#dba6a4',
}, [
  // Four faceted crystal blades, separated by gold ribs at their shared root.
  { fill: 'd', edge: 'o', points: [[23, 16], [22, 21], [16, 27], [13, 22], [17, 16]] },
  { fill: 'i', points: [[22, 18], [19, 23], [16, 26], [17, 21]] },
  { fill: 'r', points: [[14, 22], [17, 20], [16, 26]] },
  { fill: 'h', points: [[22, 18], [19, 22], [16, 26]] },
  { fill: 'b', edge: 'o', points: [[22, 16], [17, 21], [6, 24], [7, 17], [15, 14]] },
  { fill: 'i', points: [[20, 17], [14, 20], [7, 23], [10, 18]] },
  { fill: 'r', points: [[7, 18], [11, 18], [7, 23]] },
  { fill: 'h', points: [[20, 17], [12, 20], [7, 23]] },
  { fill: 'b', edge: 'o', points: [[21, 15], [14, 17], [1, 16], [3, 10], [12, 10]] },
  { fill: 'i', points: [[18, 14], [11, 15], [2, 15], [7, 12]] },
  { fill: 'r', points: [[3, 11], [7, 12], [2, 15]] },
  { fill: 'h', points: [[17, 14], [8, 14], [2, 15]] },
  { fill: 'b', edge: 'o', points: [[23, 16], [16, 14], [5, 9], [1, 3], [9, 4], [17, 9]] },
  { fill: 'i', points: [[2, 4], [8, 5], [16, 10], [20, 14], [10, 8]] },
  { fill: 'r', points: [[2, 4], [6, 8], [11, 10], [9, 7]] },
  { fill: 'h', points: [[2, 4], [9, 7], [20, 14]] },
  { fill: 'g', points: [[12, 11], [19, 15], [23, 16], [23, 19], [19, 18], [14, 21], [18, 17]] },
  { fill: 'h', points: [[19, 15], [22, 16], [23, 17], [21, 19], [19, 17]] },
  { fill: 'b', points: [[21, 16], [22, 17], [21, 18], [20, 17]] },
])

const WINGS: Readonly<Record<string, WingArt>> = Object.freeze({
  'leaf-wings': sprout,
  'angel-wings': cloud,
  'dragon-wings': ember,
  'prism-wings': prism,
})

export function getWingArt(id: string): WingArt | undefined {
  return WINGS[id]
}
