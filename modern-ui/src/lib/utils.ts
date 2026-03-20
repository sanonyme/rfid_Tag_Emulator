import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Scroll only the log region — never use scrollIntoView (it scrolls outer tab/page). */
export function scrollLogAnchorIntoView(anchor: HTMLElement | null, behavior: ScrollBehavior = 'smooth'): void {
  if (!anchor) return
  const viewport = anchor.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null
  if (viewport) {
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    })
    return
  }
  let el: HTMLElement | null = anchor.parentElement
  for (let depth = 0; el && depth < 24; depth++, el = el.parentElement) {
    if (el === document.body || el === document.documentElement) break
    const { overflowY } = getComputedStyle(el)
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') continue
    if (el.scrollHeight <= el.clientHeight) continue
    const scrollable = el
    requestAnimationFrame(() => {
      scrollable.scrollTo({ top: scrollable.scrollHeight, behavior })
    })
    return
  }
}

export function formatTime(date: Date = new Date()): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}
