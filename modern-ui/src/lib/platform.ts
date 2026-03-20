import { Capacitor } from '@capacitor/core'

/**
 * Platform detection for mobile vs desktop UI.
 * - `build:mobile` / `cap:sync` set `VITE_IS_MOBILE=true` (see vite.config.mobile.ts).
 * - **Capacitor iOS/Android** always use the mobile shell even if `dist` was built
 *   by mistake with the desktop target — otherwise you get the full desktop app on a phone.
 * - PWAs / mobile web: ship a build made with `vite.config.mobile.ts` or set the env.
 */
export const IS_MOBILE =
  import.meta.env.VITE_IS_MOBILE === 'true' || Capacitor.isNativePlatform()
