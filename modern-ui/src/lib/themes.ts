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
}

export const themes: Theme[] = [
  {
    name: 'christmas',
    label: 'Christmas Special',
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
    colors: {
      light: {
        primary: '200 12% 23%', // #333F44 (Slate Gray)
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
        ring: '200 12% 23%', // #333F44
      },
      dark: {
        primary: '200 12% 23%', // #333F44 (Buttons)
        primaryForeground: '0 0% 98%', // White text
        background: '240 2% 10%', // #1A1A1B (Background)
        foreground: '0 0% 90%', // Light Gray text
        card: '240 2% 13%', // Slightly lighter than bg
        cardForeground: '0 0% 90%',
        popover: '240 2% 13%',
        popoverForeground: '0 0% 90%',
        secondary: '240 2% 15%', // Dark gray secondary
        secondaryForeground: '0 0% 90%',
        muted: '240 2% 15%',
        mutedForeground: '0 0% 60%',
        accent: '240 2% 20%', // Slightly lighter for hover
        accentForeground: '0 0% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '0 0% 98%',
        border: '240 2% 20%',
        input: '240 2% 20%',
        ring: '200 12% 23%', // #333F44
      },
    },
  },
  {
    name: 'cyberpunk',
    label: 'Neon City (Cyberpunk)',
    colors: {
      light: {
        primary: '280 100% 60%', // #AA00FF Purple
        primaryForeground: '0 0% 100%',
        background: '280 5% 96%', // Light purple tint
        foreground: '280 50% 10%', // Dark purple
        card: '0 0% 100%',
        cardForeground: '280 50% 10%',
        popover: '0 0% 100%',
        popoverForeground: '280 50% 10%',
        secondary: '180 100% 40%', // Cyan
        secondaryForeground: '0 0% 100%',
        muted: '280 20% 90%',
        mutedForeground: '280 40% 40%',
        accent: '320 100% 50%', // Pink
        accentForeground: '0 0% 100%',
        destructive: '0 100% 50%',
        destructiveForeground: '0 0% 100%',
        border: '280 30% 80%',
        input: '280 30% 80%',
        ring: '280 100% 60%',
      },
      dark: {
        primary: '300 100% 50%', // Neon Pink #FF00FF
        primaryForeground: '0 0% 0%',
        background: '260 50% 8%', // Deep Purple BG
        foreground: '180 100% 70%', // Cyan Text
        card: '260 50% 12%',
        cardForeground: '180 100% 70%',
        popover: '260 50% 12%',
        popoverForeground: '180 100% 70%',
        secondary: '180 100% 50%', // Neon Cyan #00FFFF
        secondaryForeground: '0 0% 0%',
        muted: '260 40% 20%',
        mutedForeground: '300 100% 80%',
        accent: '60 100% 50%', // Neon Yellow
        accentForeground: '0 0% 0%',
        destructive: '0 100% 60%', // Bright Red
        destructiveForeground: '0 0% 100%',
        border: '300 100% 40%',
        input: '300 100% 40%',
        ring: '180 100% 50%',
      },
    },
  },
]

export const THEME_CHANGE_EVENT = 'theme-change'

export function applyTheme(themeName: string, isDark: boolean) {
  const theme = themes.find((t) => t.name === themeName) || themes[0]
  const colors = isDark ? theme.colors.dark : theme.colors.light

  const root = document.documentElement
  
  // Avoid infinite loops: applyTheme dispatches THEME_CHANGE_EVENT, and some listeners
  // may call applyTheme again. If theme/isDark are unchanged, skip dispatch.
  const prevThemeName = root.dataset.themeName
  const prevIsDark = root.dataset.themeIsDark === 'true'
  if (prevThemeName === themeName && prevIsDark === isDark) {
    return
  }
  root.dataset.themeName = themeName
  root.dataset.themeIsDark = String(isDark)

  Object.entries(colors).forEach(([key, value]) => {
    // Convert camelCase to kebab-case for CSS variables
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
    root.style.setProperty(cssVar, value)
  })

  // Dispatch custom event for components that need to react to theme changes
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: themeName, isDark } }))
}

export function getSavedTheme(): string {
  return localStorage.getItem('app-theme') || 'john'
}

export function saveTheme(themeName: string) {
  localStorage.setItem('app-theme', themeName)
}

