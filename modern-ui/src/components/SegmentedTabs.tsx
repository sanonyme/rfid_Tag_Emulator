import * as React from "react"
import { TabsList, TabsTrigger } from "./ui/tabs"
import { segmentedTabsList } from "@/lib/ui-tokens"
import {
  indicatorSpring,
  prefersReducedMotion,
  SLIDE_TAB_ATTR,
  SlidingHighlight,
  useSlidingIndicator,
} from "@/lib/motion"
import { cn } from "@/lib/utils"

export interface SegmentedTabItem {
  value: string
  label: React.ReactNode
  icon?: React.ReactNode
  /** Optional `data-tour` anchor for the individual trigger. */
  dataTour?: string
  /** Extra classes for this specific trigger. */
  className?: string
}

interface SegmentedTabsProps {
  items: SegmentedTabItem[]
  /** Current active value (the parent `Tabs` must be controlled). */
  value: string
  /** Unique id so multiple segmented bars don't share one sliding indicator. */
  layoutId: string
  /** Extra classes on the `TabsList` (e.g. grid columns / max width). */
  className?: string
  /** Extra classes applied to every trigger. */
  triggerClassName?: string
  /** Optional `data-tour` anchor for the whole list. */
  dataTour?: string
}

/**
 * Segmented in-tab navigation with a smooth sliding active indicator.
 * Indicator is a sibling of the triggers (not a child) so it never whites out
 * the tab being left. Honors `prefers-reduced-motion` (snaps instantly).
 */
export function SegmentedTabs({
  items,
  value,
  layoutId: _layoutId,
  className,
  triggerClassName,
  dataTour,
}: SegmentedTabsProps) {
  const reduced = prefersReducedMotion()
  const { containerRef, rect, ready } = useSlidingIndicator(value)

  return (
    <TabsList
      ref={containerRef}
      className={cn(segmentedTabsList, "relative", className)}
      data-tour={dataTour}
    >
      <SlidingHighlight
        rect={rect}
        ready={ready}
        transition={reduced ? { duration: 0 } : indicatorSpring}
      />
      {items.map((item) => (
        <TabsTrigger
          key={item.value}
          value={item.value}
          {...{ [SLIDE_TAB_ATTR]: item.value }}
          data-tour={item.dataTour}
          className={cn(
            "relative z-[1] gap-1.5 rounded-lg text-xs text-muted-foreground transition-colors duration-200",
            "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
            triggerClassName,
            item.className,
          )}
        >
          {item.icon}
          {item.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
