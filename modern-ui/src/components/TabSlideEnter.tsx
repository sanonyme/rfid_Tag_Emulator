import { useLayoutEffect, useRef } from 'react'
import { playTabEntrance, stopTabEntrance } from '@/lib/tab-enter-animation'

/**
 * Tab panel entrance on an inner shell (not the visibility-hidden TabsContent).
 * Replays panel slide + stagger-children on every activation so revisit matches
 * the first visit.
 */
export function TabSlideEnter({
  active,
  tabId,
  children,
}: {
  active: boolean
  tabId: string
  children: React.ReactNode
}) {
  const shellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    if (!active) {
      stopTabEntrance(shell)
      return
    }

    playTabEntrance(shell)
  }, [active, tabId])

  return (
    <div ref={shellRef} className="h-full min-h-0 w-full">
      {children}
    </div>
  )
}
