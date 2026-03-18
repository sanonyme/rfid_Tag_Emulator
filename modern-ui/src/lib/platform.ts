/**
 * Platform detection for mobile vs desktop builds.
 * Set VITE_IS_MOBILE=true when building for mobile (Capacitor, PWA).
 * The mobile build is used for Capacitor → App Store.
 */
export const IS_MOBILE = import.meta.env.VITE_IS_MOBILE === 'true'
