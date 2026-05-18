/**
 * Stable color accent per handheld slot.
 *
 * Drives the small port-icon badge and a thin top stripe on each card so that,
 * when many slots are open at once, the eye can pin each Port number to a
 * consistent color. We keep the palette small and high-contrast in both light
 * and dark themes; transparency is applied for the tint so the card chrome
 * still wins.
 *
 * Indexing is on the *port number* (stable across reorders, survives reload),
 * with a fallback to slot.id when port is missing.
 */

export interface HandheldAccent {
  /** Solid color (used for icons / text / borders). */
  color: string
  /** Translucent fill suitable for backgrounds. */
  tint: string
  /** Slightly stronger translucent ring/outline. */
  ring: string
}

const PALETTE: { color: string; tint: string; ring: string }[] = [
  { color: 'rgb(99 102 241)',   tint: 'rgba(99, 102, 241, 0.12)',  ring: 'rgba(99, 102, 241, 0.40)' },  // indigo
  { color: 'rgb(16 185 129)',   tint: 'rgba(16, 185, 129, 0.12)',  ring: 'rgba(16, 185, 129, 0.40)' },  // emerald
  { color: 'rgb(244 114 182)',  tint: 'rgba(244, 114, 182, 0.12)', ring: 'rgba(244, 114, 182, 0.40)' }, // pink
  { color: 'rgb(245 158 11)',   tint: 'rgba(245, 158, 11, 0.12)',  ring: 'rgba(245, 158, 11, 0.40)' },  // amber
  { color: 'rgb(14 165 233)',   tint: 'rgba(14, 165, 233, 0.12)',  ring: 'rgba(14, 165, 233, 0.40)' },  // sky
  { color: 'rgb(168 85 247)',   tint: 'rgba(168, 85, 247, 0.12)',  ring: 'rgba(168, 85, 247, 0.40)' },  // purple
  { color: 'rgb(34 197 94)',    tint: 'rgba(34, 197, 94, 0.12)',   ring: 'rgba(34, 197, 94, 0.40)' },   // green
  { color: 'rgb(239 68 68)',    tint: 'rgba(239, 68, 68, 0.12)',   ring: 'rgba(239, 68, 68, 0.40)' },   // red
]

function hashString(s: string): number {
  // Lightweight 32-bit FNV-1a so two adjacent slot.ids don't collide visually.
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function handheldAccent(key: number | string): HandheldAccent {
  let idx: number
  if (typeof key === 'number' && Number.isFinite(key)) {
    idx = Math.abs(Math.trunc(key)) % PALETTE.length
  } else {
    idx = hashString(String(key)) % PALETTE.length
  }
  return PALETTE[idx]
}
