/**
 * Platform detection for mobile vs desktop builds.
 * Set VITE_IS_MOBILE=true when building for mobile (Capacitor, PWA).
 * The mobile build is used for Capacitor → App Store.
 */
export const IS_MOBILE = import.meta.env.VITE_IS_MOBILE === 'true'

/**
 * Christmas Workshop (title-bar game). On by default.
 * Set VITE_ENABLE_WORKSHOP=false to hide it entirely from a release build.
 */
export const WORKSHOP_ENABLED = import.meta.env.VITE_ENABLE_WORKSHOP !== 'false'
