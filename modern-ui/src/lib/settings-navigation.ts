import { useEffect } from 'react'

/** Sections that can be scrolled to / highlighted when opening Settings. */
export type SettingsHighlightTarget = 'upcCheckDigitHints'

export const SETTINGS_HIGHLIGHT_IDS: Record<SettingsHighlightTarget, string> = {
  upcCheckDigitHints: 'settings-upc-check-digit-hints',
}

const OPEN_SETTINGS_EVENT = 'zeus:open-settings'

export function requestOpenSettings(highlight?: SettingsHighlightTarget) {
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { highlight } satisfies { highlight?: SettingsHighlightTarget } }),
  )
}

/** Listen for {@link requestOpenSettings} from anywhere in the app (e.g. UPC hint footer). */
export function useSettingsNavigationRequest(
  onRequest: (highlight?: SettingsHighlightTarget) => void,
) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ highlight?: SettingsHighlightTarget }>).detail
      onRequest(detail?.highlight)
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, handler)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler)
  }, [onRequest])
}
