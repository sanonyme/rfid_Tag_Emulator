import type { Variants, Transition } from "framer-motion"

/**
 * Shared framer-motion variants/transitions for a cohesive, balanced motion
 * system. Use these for chrome and one-off animated elements; for large lists
 * prefer the CSS `stagger-children` utility (cheaper, no re-render cost).
 *
 * All values are tuned to be lively but not flashy. Respect reduced-motion at
 * call sites with `usePrefersReducedMotion()` or framer-motion's
 * `useReducedMotion()` and skip/disable animation accordingly.
 */

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeOut } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: easeOut } },
}

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 380, damping: 24 },
  },
}

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.02 },
  },
}

/** Spring used by the active-tab indicator and other layout transitions. */
export const indicatorSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
}

/** Returns true when the user prefers reduced motion (SSR-safe). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
