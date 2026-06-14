/**
 * Atlassian Design System neutral palette (solid tokens).
 * Hex sources: ADS elevation.neutral / color.neutral tokens.
 */
export const atlassianLightNeutrals = {
  /** Neutral0 */ neutral0: '0 0% 100%',
  /** Neutral100 */ neutral100: '210 14% 97%',
  /** Neutral200 */ neutral200: '220 12% 95%',
  /** Neutral300 */ neutral300: '218 13% 88%',
  /** Neutral400 */ neutral400: '219 13% 74%',
  /** Neutral500 */ neutral500: '217 13% 58%',
  /** Neutral600 */ neutral600: '218 13% 52%',
  /** Neutral700 */ neutral700: '218 16% 45%',
  /** Neutral800 */ neutral800: '218 24% 35%',
  /** Neutral900 */ neutral900: '218 36% 27%',
  /** Neutral1000 */ neutral1000: '218 54% 20%',
  /** Neutral1100 */ neutral1100: '218 76% 15%',
} as const

export const atlassianDarkNeutrals = {
  /** DarkNeutral-100 */ darkNeutralMinus100: '210 10% 4%',
  /** DarkNeutral0 */ darkNeutral0: '210 11% 7%',
  /** DarkNeutral100 */ darkNeutral100: '206 14% 10%',
  /** DarkNeutral200 */ darkNeutral200: '210 12% 13%',
  /** DarkNeutral250 */ darkNeutral250: '207 12% 15%',
  /** DarkNeutral300 */ darkNeutral300: '207 12% 18%',
  /** DarkNeutral350 */ darkNeutral350: '210 14% 20%',
  /** DarkNeutral400 */ darkNeutral400: '210 14% 25%',
  /** DarkNeutral500 */ darkNeutral500: '210 13% 31%',
  /** DarkNeutral600 */ darkNeutral600: '208 13% 40%',
  /** DarkNeutral700 */ darkNeutral700: '211 14% 52%',
  /** DarkNeutral800 */ darkNeutral800: '211 16% 61%',
  /** DarkNeutral900 */ darkNeutral900: '210 16% 71%',
  /** DarkNeutral1000 */ darkNeutral1000: '207 18% 80%',
  /** DarkNeutral1100 */ darkNeutral1100: '206 12% 89%',
  /** DarkNeutral1200 */ darkNeutral1200: '0 0% 100%',
} as const

const L = atlassianLightNeutrals
const D = atlassianDarkNeutrals

/** Maps ADS neutral tokens onto the app's shadcn-style theme slots. */
export const atlassianNeutralThemeColors = {
  light: {
    primary: L.neutral900,
    primaryForeground: L.neutral0,
    background: L.neutral100,
    foreground: L.neutral1000,
    card: L.neutral0,
    cardForeground: L.neutral1000,
    popover: L.neutral0,
    popoverForeground: L.neutral1000,
    secondary: L.neutral200,
    secondaryForeground: L.neutral1000,
    muted: L.neutral200,
    mutedForeground: L.neutral700,
    accent: L.neutral300,
    accentForeground: L.neutral1000,
    destructive: '0 84.2% 60.2%',
    destructiveForeground: L.neutral0,
    border: L.neutral300,
    input: L.neutral300,
    ring: L.neutral800,
  },
  dark: {
    primary: D.darkNeutral500,
    primaryForeground: D.darkNeutral1200,
    background: D.darkNeutral0,
    foreground: D.darkNeutral1100,
    card: D.darkNeutral100,
    cardForeground: D.darkNeutral1100,
    popover: D.darkNeutral200,
    popoverForeground: D.darkNeutral1100,
    secondary: D.darkNeutral200,
    secondaryForeground: D.darkNeutral1100,
    muted: D.darkNeutral250,
    mutedForeground: D.darkNeutral700,
    accent: D.darkNeutral300,
    accentForeground: D.darkNeutral1100,
    destructive: '0 62.8% 30.6%',
    destructiveForeground: D.darkNeutral1200,
    border: D.darkNeutral350,
    input: D.darkNeutral300,
    ring: D.darkNeutral700,
  },
}
