import { prefersReducedMotion } from '@/lib/motion'

const TAB_SLIDE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translate3d(0, 6px, 0) scale(0.995)' },
  { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
]

const TAB_SLIDE_TIMING: KeyframeAnimationOptions = {
  duration: 280,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  fill: 'forwards',
}

function restartCssAnimation(element: HTMLElement): void {
  element.style.animation = 'none'
  void element.offsetWidth
  element.style.animation = ''
}

/** Replay stagger-children entrances (they only auto-run once on mount). */
export function restartStaggerChildren(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.stagger-children').forEach((staggerRoot) => {
    Array.from(staggerRoot.children).forEach((child) => {
      if (child instanceof HTMLElement) restartCssAnimation(child)
    })
  })
}

export function stopTabEntrance(shell: HTMLElement): void {
  shell.getAnimations().forEach((anim) => anim.cancel())
  shell.style.opacity = ''
  shell.style.transform = ''
}

/** Panel slide + stagger replay — identical on first visit and every revisit. */
export function playTabEntrance(shell: HTMLElement): void {
  if (prefersReducedMotion()) return

  stopTabEntrance(shell)
  shell.animate(TAB_SLIDE_KEYFRAMES, TAB_SLIDE_TIMING)
  restartStaggerChildren(shell)
}
