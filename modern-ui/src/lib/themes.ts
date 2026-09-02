import { atlassianNeutralThemeColors } from './atlassian-neutrals'

export interface ThemeColors {
  primary: string
  primaryForeground: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  border: string
  input: string
  ring: string
}

export interface Theme {
  name: string
  label: string
  colors: {
    light: ThemeColors
    dark: ThemeColors
  }
  /** Hex swatches shown in the settings picker (full palette, both modes). */
  swatches?: string[]
  /** Optional elevation / auxiliary CSS variables beyond the core palette. */
  extras?: {
    light?: Record<string, string>
    dark?: Record<string, string>
  }
}

/** CSS colors for the settings theme picker strip. */
export function getThemeSwatches(theme: Theme, isDark: boolean): string[] {
  if (theme.swatches?.length) {
    return theme.swatches.map((c) => (c.startsWith('#') ? c : c.startsWith('hsl') ? c : `hsl(${c})`))
  }
  const c = isDark ? theme.colors.dark : theme.colors.light
  return [c.background, c.primary, c.secondary, c.accent, c.foreground].map((hsl) => `hsl(${hsl})`)
}

const THEME_EXTRA_KEYS = [
  '--shadow-color',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--file-tree-bg',
  '--file-tree-hover',
  '--folder-icon',
] as const

const DEFAULT_LIGHT_EXTRAS: Record<string, string> = {
  '--shadow-color': '20 30% 18%',
  '--shadow-sm': '0 1px 2px hsl(var(--shadow-color) / 0.08)',
  '--shadow-md': '0 4px 12px hsl(var(--shadow-color) / 0.10)',
  '--shadow-lg': '0 12px 32px hsl(var(--shadow-color) / 0.14)',
  '--file-tree-bg': '30 12% 96%',
  '--file-tree-hover': '30 15% 92%',
  '--folder-icon': '16 45% 42%',
}

const DEFAULT_DARK_EXTRAS: Record<string, string> = {
  '--shadow-color': '222 60% 3%',
  '--shadow-sm': '0 1px 2px hsl(var(--shadow-color) / 0.30)',
  '--shadow-md': '0 4px 14px hsl(var(--shadow-color) / 0.40)',
  '--shadow-lg': '0 12px 34px hsl(var(--shadow-color) / 0.50)',
  '--file-tree-bg': '222 40% 14%',
  '--file-tree-hover': '217 32% 20%',
  '--folder-icon': '16 55% 58%',
}

export const themes: Theme[] = [
  {
    name: 'camel-lava',
    label: 'Camel & Lava',
    swatches: ['#af9164', '#f7f3e3', '#b3b6b7', '#6f1a07', '#2b2118'],
    colors: {
      light: {
        primary: '36 32% 54%', // Camel #af9164
        primaryForeground: '48 56% 93%', // Ivory Mist
        background: '48 56% 93%', // Ivory Mist #f7f3e3
        foreground: '28 28% 13%', // Dark Coffee #2b2118
        card: '48 40% 97%',
        cardForeground: '28 28% 13%',
        popover: '48 40% 97%',
        popoverForeground: '28 28% 13%',
        secondary: '195 8% 88%', // Silver wash
        secondaryForeground: '28 28% 13%',
        muted: '48 22% 90%',
        mutedForeground: '28 16% 38%',
        accent: '36 28% 86%',
        accentForeground: '28 28% 13%',
        destructive: '11 88% 23%', // Molten Lava #6f1a07
        destructiveForeground: '48 56% 93%',
        border: '36 18% 80%',
        input: '36 18% 80%',
        ring: '36 32% 54%',
      },
      dark: {
        primary: '36 38% 62%', // Camel, lifted for dark surfaces
        primaryForeground: '28 28% 10%',
        background: '28 28% 10%', // Dark Coffee
        foreground: '48 45% 93%', // Ivory Mist
        card: '28 24% 14%',
        cardForeground: '48 45% 93%',
        popover: '28 22% 16%',
        popoverForeground: '48 45% 93%',
        secondary: '28 18% 18%',
        secondaryForeground: '48 40% 90%',
        muted: '28 16% 17%',
        mutedForeground: '195 3% 71%', // Silver #b3b6b7
        accent: '11 70% 32%', // Molten Lava
        accentForeground: '48 56% 93%',
        destructive: '11 80% 38%',
        destructiveForeground: '48 56% 93%',
        border: '28 16% 22%',
        input: '28 18% 16%',
        ring: '36 38% 62%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '28 28% 13%',
        '--file-tree-bg': '48 40% 91%',
        '--file-tree-hover': '48 28% 86%',
        '--folder-icon': '36 32% 45%',
      },
      dark: {
        '--shadow-color': '28 40% 4%',
        '--file-tree-bg': '28 24% 11%',
        '--file-tree-hover': '28 20% 18%',
        '--folder-icon': '36 38% 58%',
      },
    },
  },
  {
    name: 'christmas',
    label: 'Christmas Special',
    swatches: ['#D42426', '#146B3A', '#F8B229', '#FAFAFA', '#0a2416'],
    colors: {
      light: {
        primary: '358 70% 49%', // #D42426 Red
        primaryForeground: '0 0% 98%',
        background: '0 0% 98%', // Snow white
        foreground: '146 69% 25%', // #146B3A Dark Green
        card: '0 0% 100%',
        cardForeground: '146 69% 25%',
        popover: '0 0% 100%',
        popoverForeground: '146 69% 25%',
        secondary: '146 69% 25%', // Green
        secondaryForeground: '0 0% 98%',
        muted: '146 30% 90%',
        mutedForeground: '146 40% 40%',
        accent: '40 92% 57%', // #F8B229 Gold
        accentForeground: '0 0% 98%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '146 30% 85%',
        input: '146 30% 85%',
        ring: '358 70% 49%',
      },
      dark: {
        primary: '358 70% 60%', // Red
        primaryForeground: '0 0% 98%',
        background: '146 69% 10%', // Dark Green bg
        foreground: '0 0% 98%',
        card: '146 69% 15%',
        cardForeground: '0 0% 98%',
        popover: '146 69% 15%',
        popoverForeground: '0 0% 98%',
        secondary: '358 70% 49%', // Red
        secondaryForeground: '0 0% 98%',
        muted: '146 40% 20%',
        mutedForeground: '146 30% 70%',
        accent: '40 92% 57%', // Gold
        accentForeground: '0 0% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        border: '146 40% 25%',
        input: '146 40% 25%',
        ring: '358 70% 60%',
      },
    },
  },
  {
    name: 'terracotta',
    label: 'Terracotta (Original)',
    swatches: ['#c46e3c', '#fcfbf9', '#ebe6e0', '#26211f'],
    colors: {
      light: {
        primary: '16 53% 50%',
        primaryForeground: '0 0% 98%',
        background: '40 20% 99%',
        foreground: '20 10% 15%',
        card: '0 0% 100%',
        cardForeground: '20 10% 15%',
        popover: '0 0% 100%',
        popoverForeground: '20 10% 15%',
        secondary: '30 10% 94%',
        secondaryForeground: '20 10% 15%',
        muted: '30 10% 94%',
        mutedForeground: '25 5% 45%',
        accent: '30 15% 94%',
        accentForeground: '20 10% 15%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '30 10% 85%',
        input: '30 10% 85%',
        ring: '16 53% 50%',
      },
      dark: {
        primary: '16 60% 60%',
        primaryForeground: '222 47% 11%',
        background: '222 47% 11%',
        foreground: '210 40% 98%',
        card: '222 47% 11%',
        cardForeground: '210 40% 98%',
        popover: '222 47% 11%',
        popoverForeground: '210 40% 98%',
        secondary: '217 32% 17%',
        secondaryForeground: '210 40% 98%',
        muted: '217 32% 17%',
        mutedForeground: '215 20% 65%',
        accent: '217 32% 17%',
        accentForeground: '210 40% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '210 40% 98%',
        border: '217 32% 17%',
        input: '217 32% 17%',
        ring: '16 60% 60%',
      },
    },
  },
  {
    name: 'teal',
    label: 'Teal & Ocean',
    swatches: ['#229799', '#F5F5F5', '#48CFCB', '#424242'],
    colors: {
      light: {
        primary: '179 63% 37%', // #229799
        primaryForeground: '0 0% 98%',
        background: '0 0% 96%', // #F5F5F5
        foreground: '0 0% 26%', // #424242
        card: '0 0% 100%',
        cardForeground: '0 0% 26%',
        popover: '0 0% 100%',
        popoverForeground: '0 0% 26%',
        secondary: '178 59% 55%', // #48CFCB
        secondaryForeground: '0 0% 98%',
        muted: '180 20% 90%',
        mutedForeground: '0 0% 45%',
        accent: '178 59% 55%', // #48CFCB
        accentForeground: '0 0% 98%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '0 0% 85%',
        input: '0 0% 85%',
        ring: '179 63% 37%',
      },
      dark: {
        primary: '178 59% 55%', // #48CFCB
        primaryForeground: '0 0% 10%',
        background: '0 0% 10%',
        foreground: '0 0% 96%', // #F5F5F5
        card: '0 0% 26%', // #424242
        cardForeground: '0 0% 96%',
        popover: '0 0% 26%',
        popoverForeground: '0 0% 96%',
        secondary: '179 63% 37%', // #229799
        secondaryForeground: '0 0% 98%',
        muted: '0 0% 20%',
        mutedForeground: '0 0% 65%',
        accent: '179 63% 37%',
        accentForeground: '0 0% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        border: '0 0% 20%',
        input: '0 0% 20%',
        ring: '178 59% 55%',
      },
    },
  },
  {
    name: 'deepsea-coral',
    label: 'Deep Sea & Coral',
    swatches: ['#007074', '#034C53', '#FFC1B4', '#F38C79'],
    colors: {
      light: {
        primary: '182 100% 23%', // #007074
        primaryForeground: '0 0% 98%',
        background: '10 30% 98%', // Very light warm white
        foreground: '184 93% 17%', // #034C53
        card: '0 0% 100%',
        cardForeground: '184 93% 17%',
        popover: '0 0% 100%',
        popoverForeground: '184 93% 17%',
        secondary: '10 100% 85%', // #FFC1B4 (Peach)
        secondaryForeground: '184 93% 17%',
        muted: '10 20% 95%',
        mutedForeground: '184 40% 40%',
        accent: '9 85% 71%', // #F38C79 (Coral)
        accentForeground: '0 0% 98%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '10 20% 85%',
        input: '10 20% 85%',
        ring: '182 100% 23%',
      },
      dark: {
        primary: '9 85% 71%', // #F38C79 (Coral)
        primaryForeground: '184 93% 17%', // #034C53
        background: '184 50% 10%', // Very dark version of #034C53
        foreground: '10 100% 85%', // #FFC1B4 (Peach)
        card: '184 93% 13%', // Slightly lighter dark teal
        cardForeground: '10 100% 85%',
        popover: '184 93% 13%',
        popoverForeground: '10 100% 85%',
        secondary: '182 100% 23%', // #007074
        secondaryForeground: '0 0% 98%',
        muted: '184 30% 20%',
        mutedForeground: '10 50% 70%',
        accent: '182 100% 23%', // #007074
        accentForeground: '0 0% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        border: '184 30% 25%',
        input: '184 30% 25%',
        ring: '9 85% 71%',
      },
    },
  },
  {
    name: 'berry-delight',
    label: 'Berry Delight',
    swatches: ['#CD2C58', '#FFE6D4', '#E06B80', '#FFC69D'],
    colors: {
      light: {
        primary: '344 64% 49%', // #CD2C58
        primaryForeground: '0 0% 98%',
        background: '20 100% 97%', // Very light peach/cream for bg
        foreground: '344 64% 20%', // Darker version of berry
        card: '0 0% 100%',
        cardForeground: '344 64% 20%',
        popover: '0 0% 100%',
        popoverForeground: '344 64% 20%',
        secondary: '20 100% 92%', // #FFE6D4
        secondaryForeground: '344 64% 49%',
        muted: '20 50% 95%',
        mutedForeground: '344 40% 50%',
        accent: '349 68% 65%', // #E06B80
        accentForeground: '0 0% 98%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '349 30% 85%',
        input: '349 30% 85%',
        ring: '344 64% 49%',
      },
      dark: {
        primary: '349 68% 65%', // #E06B80
        primaryForeground: '0 0% 98%',
        background: '344 40% 10%', // Very dark berry
        foreground: '20 100% 92%', // #FFE6D4
        card: '344 40% 15%',
        cardForeground: '20 100% 92%',
        popover: '344 40% 15%',
        popoverForeground: '20 100% 92%',
        secondary: '344 64% 49%', // #CD2C58
        secondaryForeground: '0 0% 98%',
        muted: '344 30% 20%',
        mutedForeground: '20 50% 70%',
        accent: '25 100% 81%', // #FFC69D
        accentForeground: '344 64% 20%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        border: '344 40% 25%',
        input: '344 40% 25%',
        ring: '349 68% 65%',
      },
    },
  },
  {
    name: 'john',
    label: 'John 67',
    swatches: ['#39393b', '#f0f2f3', '#1A1A1B', '#e8e8ea'],
    colors: {
      light: {
        primary: '240 2% 23%', // Neutral dark gray (matches theme, no blue cast)
        primaryForeground: '0 0% 98%', // White text
        background: '200 10% 95%', // Very light gray for contrast in light mode
        foreground: '240 2% 10%', // #1A1A1B (Almost Black)
        card: '0 0% 100%',
        cardForeground: '240 2% 10%',
        popover: '0 0% 100%',
        popoverForeground: '240 2% 10%',
        secondary: '240 2% 90%', // Light gray
        secondaryForeground: '240 2% 10%',
        muted: '240 2% 90%',
        mutedForeground: '240 2% 40%',
        accent: '240 2% 90%',
        accentForeground: '240 2% 10%',
        destructive: '0 84.2% 60.2%',
        destructiveForeground: '0 0% 98%',
        border: '240 2% 85%',
        input: '240 2% 85%',
        ring: '240 2% 23%',
      },
      dark: {
        primary: '240 5% 90%', // Light CTA buttons on charcoal — clean, high contrast
        primaryForeground: '240 3% 8%',
        background: '240 3% 7%', // Deep charcoal base
        foreground: '240 4% 93%', // Crisp near-white text
        card: '240 3% 10%', // Lifted panels
        cardForeground: '240 4% 93%',
        popover: '240 3% 13%', // Dropdowns float above cards
        popoverForeground: '240 4% 93%',
        secondary: '240 3% 14%',
        secondaryForeground: '240 4% 88%',
        muted: '240 3% 14%',
        mutedForeground: '240 4% 52%', // Readable secondary text
        accent: '240 4% 18%', // Hover / selection highlight
        accentForeground: '240 4% 93%',
        destructive: '0 65% 45%',
        destructiveForeground: '0 0% 98%',
        border: '240 4% 20%', // Soft but visible structure
        input: '240 3% 12%', // Inputs sit slightly below surface
        ring: '240 5% 55%', // Clear focus ring
      },
    },
    extras: {
      dark: {
        '--shadow-color': '240 8% 2%',
        '--shadow-sm': '0 1px 3px hsl(var(--shadow-color) / 0.40)',
        '--shadow-md': '0 4px 16px hsl(var(--shadow-color) / 0.50)',
        '--shadow-lg': '0 12px 40px hsl(var(--shadow-color) / 0.60)',
        '--file-tree-bg': '240 3% 9%',
        '--file-tree-hover': '240 4% 17%',
        '--folder-icon': '240 4% 58%',
      },
    },
  },
  {
    name: 'atlassian-neutrals',
    label: 'Atlassian Neutrals',
    swatches: ['#2C3E50', '#F7F8F9', '#DEE1E6', '#172B4D'],
    colors: atlassianNeutralThemeColors,
  },
  {
    name: 'matcha-fog',
    label: 'Matcha Fog',
    swatches: ['#5c6f4a', '#f4f1e8', '#c4b8a5', '#2c3328', '#b07d4a'],
    colors: {
      light: {
        primary: '95 20% 36%', // Sage
        primaryForeground: '45 35% 96%',
        background: '45 30% 96%', // Warm paper
        foreground: '98 12% 16%',
        card: '45 25% 98%',
        cardForeground: '98 12% 16%',
        popover: '45 25% 98%',
        popoverForeground: '98 12% 16%',
        secondary: '40 18% 90%',
        secondaryForeground: '98 12% 16%',
        muted: '45 15% 92%',
        mutedForeground: '95 8% 40%',
        accent: '30 28% 90%',
        accentForeground: '98 12% 16%',
        destructive: '0 70% 46%',
        destructiveForeground: '0 0% 98%',
        border: '40 14% 84%',
        input: '40 14% 84%',
        ring: '95 20% 36%',
      },
      dark: {
        primary: '95 22% 58%',
        primaryForeground: '98 12% 10%',
        background: '120 10% 8%',
        foreground: '45 20% 93%',
        card: '120 8% 11%',
        cardForeground: '45 20% 93%',
        popover: '120 8% 13%',
        popoverForeground: '45 20% 93%',
        secondary: '120 8% 16%',
        secondaryForeground: '45 18% 90%',
        muted: '120 8% 15%',
        mutedForeground: '40 12% 65%',
        accent: '30 32% 38%',
        accentForeground: '45 20% 93%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '120 8% 20%',
        input: '120 8% 16%',
        ring: '95 22% 58%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '98 12% 16%',
        '--file-tree-bg': '45 22% 93%',
        '--file-tree-hover': '45 18% 89%',
        '--folder-icon': '95 20% 36%',
      },
      dark: {
        '--shadow-color': '120 20% 3%',
        '--file-tree-bg': '120 9% 10%',
        '--file-tree-hover': '120 8% 16%',
        '--folder-icon': '95 22% 58%',
      },
    },
  },
  {
    name: 'nocturne',
    label: 'Nocturne',
    swatches: ['#0f172a', '#e8eef4', '#d4b896', '#070b14', '#8fa3b8'],
    colors: {
      light: {
        primary: '222 47% 16%',
        primaryForeground: '42 40% 94%',
        background: '220 25% 97%',
        foreground: '222 47% 11%',
        card: '0 0% 100%',
        cardForeground: '222 47% 11%',
        popover: '0 0% 100%',
        popoverForeground: '222 47% 11%',
        secondary: '220 18% 92%',
        secondaryForeground: '222 47% 11%',
        muted: '220 16% 93%',
        mutedForeground: '220 12% 42%',
        accent: '38 42% 88%',
        accentForeground: '222 47% 11%',
        destructive: '0 72% 46%',
        destructiveForeground: '0 0% 98%',
        border: '220 16% 86%',
        input: '220 16% 86%',
        ring: '222 47% 16%',
      },
      dark: {
        primary: '38 48% 68%',
        primaryForeground: '222 45% 8%',
        background: '222 45% 7%',
        foreground: '42 30% 92%',
        card: '222 40% 10%',
        cardForeground: '42 30% 92%',
        popover: '222 38% 12%',
        popoverForeground: '42 30% 92%',
        secondary: '222 30% 16%',
        secondaryForeground: '42 25% 90%',
        muted: '222 28% 15%',
        mutedForeground: '220 15% 62%',
        accent: '220 28% 20%',
        accentForeground: '42 30% 92%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '222 28% 20%',
        input: '222 30% 14%',
        ring: '38 48% 68%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '222 47% 11%',
        '--file-tree-bg': '220 20% 94%',
        '--file-tree-hover': '220 18% 90%',
        '--folder-icon': '38 42% 52%',
      },
      dark: {
        '--shadow-color': '222 50% 3%',
        '--file-tree-bg': '222 42% 9%',
        '--file-tree-hover': '222 32% 16%',
        '--folder-icon': '38 48% 68%',
      },
    },
  },
  {
    name: 'glacier',
    label: 'Glacier',
    swatches: ['#1a6b82', '#eef7fa', '#7ec8d4', '#0c1e28', '#c5e4ea'],
    colors: {
      light: {
        primary: '199 80% 32%',
        primaryForeground: '0 0% 98%',
        background: '200 40% 97%',
        foreground: '205 50% 16%',
        card: '0 0% 100%',
        cardForeground: '205 50% 16%',
        popover: '0 0% 100%',
        popoverForeground: '205 50% 16%',
        secondary: '198 40% 90%',
        secondaryForeground: '205 50% 16%',
        muted: '198 30% 92%',
        mutedForeground: '200 18% 40%',
        accent: '190 45% 90%',
        accentForeground: '205 50% 16%',
        destructive: '0 72% 46%',
        destructiveForeground: '0 0% 98%',
        border: '198 24% 84%',
        input: '198 24% 84%',
        ring: '199 80% 32%',
      },
      dark: {
        primary: '190 70% 55%',
        primaryForeground: '205 45% 8%',
        background: '205 45% 8%',
        foreground: '195 30% 92%',
        card: '205 40% 11%',
        cardForeground: '195 30% 92%',
        popover: '205 38% 13%',
        popoverForeground: '195 30% 92%',
        secondary: '205 32% 16%',
        secondaryForeground: '195 25% 90%',
        muted: '205 30% 15%',
        mutedForeground: '195 18% 62%',
        accent: '205 35% 20%',
        accentForeground: '195 30% 92%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '205 28% 20%',
        input: '205 32% 14%',
        ring: '190 70% 55%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '205 50% 16%',
        '--file-tree-bg': '198 32% 94%',
        '--file-tree-hover': '198 28% 90%',
        '--folder-icon': '199 80% 32%',
      },
      dark: {
        '--shadow-color': '205 50% 3%',
        '--file-tree-bg': '205 42% 9%',
        '--file-tree-hover': '205 32% 16%',
        '--folder-icon': '190 70% 55%',
      },
    },
  },
  {
    name: 'sakura-ink',
    label: 'Sakura Ink',
    swatches: ['#c45c78', '#fdf6f7', '#2a2a2a', '#e8c4ce', '#f5e6ea'],
    colors: {
      light: {
        primary: '350 45% 52%',
        primaryForeground: '0 0% 98%',
        background: '350 40% 98%',
        foreground: '0 0% 12%',
        card: '0 0% 100%',
        cardForeground: '0 0% 12%',
        popover: '0 0% 100%',
        popoverForeground: '0 0% 12%',
        secondary: '350 30% 94%',
        secondaryForeground: '0 0% 12%',
        muted: '350 22% 94%',
        mutedForeground: '350 10% 42%',
        accent: '350 28% 92%',
        accentForeground: '0 0% 12%',
        destructive: '0 72% 46%',
        destructiveForeground: '0 0% 98%',
        border: '350 16% 86%',
        input: '350 16% 86%',
        ring: '350 45% 52%',
      },
      dark: {
        primary: '350 50% 68%',
        primaryForeground: '0 0% 8%',
        background: '0 0% 8%',
        foreground: '350 30% 94%',
        card: '350 8% 11%',
        cardForeground: '350 30% 94%',
        popover: '350 8% 13%',
        popoverForeground: '350 30% 94%',
        secondary: '350 10% 16%',
        secondaryForeground: '350 20% 90%',
        muted: '350 8% 15%',
        mutedForeground: '350 12% 64%',
        accent: '350 16% 18%',
        accentForeground: '350 30% 94%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '350 10% 20%',
        input: '350 8% 14%',
        ring: '350 50% 68%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '0 0% 12%',
        '--file-tree-bg': '350 28% 95%',
        '--file-tree-hover': '350 24% 91%',
        '--folder-icon': '350 45% 52%',
      },
      dark: {
        '--shadow-color': '0 0% 2%',
        '--file-tree-bg': '350 8% 10%',
        '--file-tree-hover': '350 10% 16%',
        '--folder-icon': '350 50% 68%',
      },
    },
  },
  {
    name: 'violet-hour',
    label: 'Violet Hour',
    swatches: ['#6b4d9a', '#f4f0f8', '#c4b0e0', '#1a1224', '#8b7aa8'],
    colors: {
      light: {
        primary: '266 40% 42%',
        primaryForeground: '0 0% 98%',
        background: '270 25% 97%',
        foreground: '270 30% 16%',
        card: '0 0% 100%',
        cardForeground: '270 30% 16%',
        popover: '0 0% 100%',
        popoverForeground: '270 30% 16%',
        secondary: '270 20% 93%',
        secondaryForeground: '270 30% 16%',
        muted: '270 16% 93%',
        mutedForeground: '270 12% 42%',
        accent: '280 24% 92%',
        accentForeground: '270 30% 16%',
        destructive: '0 72% 46%',
        destructiveForeground: '0 0% 98%',
        border: '270 16% 86%',
        input: '270 16% 86%',
        ring: '266 40% 42%',
      },
      dark: {
        primary: '270 45% 70%',
        primaryForeground: '270 28% 10%',
        background: '270 28% 8%',
        foreground: '270 20% 93%',
        card: '270 24% 11%',
        cardForeground: '270 20% 93%',
        popover: '270 22% 13%',
        popoverForeground: '270 20% 93%',
        secondary: '270 20% 16%',
        secondaryForeground: '270 16% 90%',
        muted: '270 18% 15%',
        mutedForeground: '270 12% 64%',
        accent: '270 22% 20%',
        accentForeground: '270 20% 93%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '270 18% 20%',
        input: '270 20% 14%',
        ring: '270 45% 70%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '270 30% 16%',
        '--file-tree-bg': '270 20% 94%',
        '--file-tree-hover': '270 16% 90%',
        '--folder-icon': '266 40% 42%',
      },
      dark: {
        '--shadow-color': '270 30% 3%',
        '--file-tree-bg': '270 26% 10%',
        '--file-tree-hover': '270 20% 16%',
        '--folder-icon': '270 45% 70%',
      },
    },
  },
  {
    name: 'rosewood',
    label: 'Rosewood',
    swatches: ['#6e2436', '#faf6f1', '#c9a08a', '#1c1014', '#8b4554'],
    colors: {
      light: {
        primary: '350 45% 32%',
        primaryForeground: '30 30% 97%',
        background: '30 30% 97%',
        foreground: '350 40% 16%',
        card: '0 0% 100%',
        cardForeground: '350 40% 16%',
        popover: '0 0% 100%',
        popoverForeground: '350 40% 16%',
        secondary: '30 25% 92%',
        secondaryForeground: '350 40% 16%',
        muted: '30 18% 93%',
        mutedForeground: '350 12% 40%',
        accent: '15 35% 90%',
        accentForeground: '350 40% 16%',
        destructive: '0 72% 42%',
        destructiveForeground: '0 0% 98%',
        border: '30 16% 85%',
        input: '30 16% 85%',
        ring: '350 45% 32%',
      },
      dark: {
        primary: '350 40% 58%',
        primaryForeground: '350 25% 8%',
        background: '350 25% 8%',
        foreground: '30 25% 93%',
        card: '350 22% 11%',
        cardForeground: '30 25% 93%',
        popover: '350 20% 13%',
        popoverForeground: '30 25% 93%',
        secondary: '350 16% 16%',
        secondaryForeground: '30 20% 90%',
        muted: '350 14% 15%',
        mutedForeground: '20 12% 64%',
        accent: '350 22% 20%',
        accentForeground: '30 25% 93%',
        destructive: '0 62% 42%',
        destructiveForeground: '0 0% 98%',
        border: '350 16% 20%',
        input: '350 16% 14%',
        ring: '350 40% 58%',
      },
    },
    extras: {
      light: {
        '--shadow-color': '350 40% 16%',
        '--file-tree-bg': '30 22% 94%',
        '--file-tree-hover': '30 18% 90%',
        '--folder-icon': '350 45% 32%',
      },
      dark: {
        '--shadow-color': '350 30% 3%',
        '--file-tree-bg': '350 22% 10%',
        '--file-tree-hover': '350 16% 16%',
        '--folder-icon': '350 40% 58%',
      },
    },
  },
]

export const THEME_CHANGE_EVENT = 'theme-change'

export function applyTheme(themeName: string, isDark: boolean) {
  const theme = themes.find((t) => t.name === themeName) || themes[0]
  const colors = isDark ? theme.colors.dark : theme.colors.light
  const defaultExtras = isDark ? DEFAULT_DARK_EXTRAS : DEFAULT_LIGHT_EXTRAS
  const themeExtras = isDark ? theme.extras?.dark : theme.extras?.light

  const root = document.documentElement

  Object.entries(colors).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
    root.style.setProperty(cssVar, value)
  })

  for (const key of THEME_EXTRA_KEYS) {
    root.style.setProperty(key, themeExtras?.[key] ?? defaultExtras[key])
  }

  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: themeName, isDark } }))
}

export function getSavedTheme(): string {
  const saved = localStorage.getItem('app-theme') || 'john'
  return themes.some((t) => t.name === saved) ? saved : 'john'
}

export function saveTheme(themeName: string) {
  localStorage.setItem('app-theme', themeName)
}

