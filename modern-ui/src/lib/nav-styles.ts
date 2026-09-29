/**
 * Where the main app tab menu lives.
 */

export type NavLayout = 'auto' | 'top' | 'side' | 'icon-rail'

export const NAV_LAYOUT_OPTIONS: {
  value: NavLayout
  label: string
  description: string
}[] = [
  {
    value: 'auto',
    label: 'Adaptive',
    description: 'Top bar when wide, side menu when the window shrinks',
  },
  {
    value: 'top',
    label: 'Top bar',
    description: 'Always use the horizontal menu',
  },
  {
    value: 'side',
    label: 'Side menu',
    description: 'Always use the admin-style sidebar',
  },
  {
    value: 'icon-rail',
    label: 'Icon rail',
    description: 'Always use a compact icon-only sidebar',
  },
]

export function isNavLayout(v: unknown): v is NavLayout {
  return NAV_LAYOUT_OPTIONS.some((o) => o.value === v)
}
