import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react"
import { motion, type Variants, type Transition } from "framer-motion"
import { cn } from "@/lib/utils"

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

export type SlidingIndicatorRect = {
  left: number
  top: number
  width: number
  height: number
}

const ZERO_RECT: SlidingIndicatorRect = { left: 0, top: 0, width: 0, height: 0 }

/** Mark slide targets — query via `[data-slide-tab="<id>"]` inside the container ref. */
export const SLIDE_TAB_ATTR = "data-slide-tab"

function sameRect(a: SlidingIndicatorRect, b: SlidingIndicatorRect) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/** Measure active child against container — indicator stays a sibling, not inside tabs. */
export function useSlidingIndicator(activeId: string) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<SlidingIndicatorRect>(ZERO_RECT)

  const measure = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    const el = root.querySelector(`[${SLIDE_TAB_ATTR}="${CSS.escape(activeId)}"]`)
    if (!(el instanceof HTMLElement)) return
    const rootBox = root.getBoundingClientRect()
    const tabBox = el.getBoundingClientRect()
    const next = {
      left: tabBox.left - rootBox.left,
      top: tabBox.top - rootBox.top,
      width: tabBox.width,
      height: tabBox.height,
    }
    setRect((prev) => (sameRect(prev, next) ? prev : next))
  }, [activeId])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useLayoutEffect(() => {
    const root = containerRef.current
    if (!root || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  return { containerRef, rect, ready: rect.width > 0 }
}

const segmentedIndicatorClass =
  "pointer-events-none absolute rounded-lg bg-background shadow-elev-sm ring-1 ring-border/40"

/** Container-level sliding pill — avoids layoutId painting the departing tab white. */
export function SlidingHighlight({
  rect,
  ready,
  className,
  transition,
}: {
  rect: SlidingIndicatorRect
  ready: boolean
  className?: string
  transition?: Transition
}) {
  if (!ready) return null
  return createElement(motion.span, {
    "aria-hidden": true,
    className: cn(segmentedIndicatorClass, className),
    animate: rect,
    initial: false,
    transition,
  })
}
