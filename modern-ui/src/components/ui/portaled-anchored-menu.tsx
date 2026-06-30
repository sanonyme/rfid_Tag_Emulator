import { useLayoutEffect, useRef, useState, type MouseEventHandler, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export function PortaledAnchoredMenu({
  anchorRef,
  open,
  className,
  children,
  onClick,
  maxHeight = 256,
}: {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  className?: string
  children: ReactNode
  onClick?: MouseEventHandler<HTMLDivElement>
  maxHeight?: number
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return
    const margin = 8
    const gap = 4
    const rect = anchor.getBoundingClientRect()
    const menuWidth = menu.offsetWidth
    let left = rect.right - menuWidth
    if (left < margin) left = margin
    if (left + menuWidth > window.innerWidth - margin) left = window.innerWidth - menuWidth - margin

    const spaceBelow = window.innerHeight - margin - rect.bottom - gap
    const spaceAbove = rect.top - margin - gap
    const openUp = spaceAbove > spaceBelow

    let top: number
    let resolvedMaxHeight: number
    if (openUp) {
      resolvedMaxHeight = Math.min(maxHeight, Math.max(120, spaceAbove))
      const menuHeight = Math.min(menu.scrollHeight, resolvedMaxHeight)
      top = Math.max(margin, rect.top - gap - menuHeight)
      if (rect.top - gap - menuHeight < margin) resolvedMaxHeight = rect.top - margin - gap
    } else {
      top = rect.bottom + gap
      resolvedMaxHeight = Math.min(maxHeight, Math.max(120, spaceBelow))
    }

    setPosition({ left, top, maxHeight: resolvedMaxHeight })
  }, [open, anchorRef, children, maxHeight])

  if (!open) return null

  return createPortal(
    <div
      ref={menuRef}
      className={cn('fixed z-[9999] overflow-auto', className)}
      style={
        position
          ? { left: position.left, top: position.top, maxHeight: position.maxHeight }
          : { visibility: 'hidden', left: 0, top: 0 }
      }
      onClick={onClick}
    >
      {children}
    </div>,
    document.body,
  )
}
