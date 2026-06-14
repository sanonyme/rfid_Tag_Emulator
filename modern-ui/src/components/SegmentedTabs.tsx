import * as React from "react"
import { motion, LayoutGroup } from "framer-motion"
import { TabsList, TabsTrigger } from "./ui/tabs"
import { segmentedTabsList } from "@/lib/ui-tokens"
import { indicatorSpring, prefersReducedMotion } from "@/lib/motion"
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
 *
 * Uses framer-motion's shared-layout animation (same `layoutId`) so the
 * highlighted background glides between tabs instead of snapping. Mirrors the
 * main app tab bar's motion. Honors `prefers-reduced-motion` (snaps instantly).
 */
export function SegmentedTabs({
  items,
  value,
  layoutId,
  className,
  triggerClassName,
  dataTour,
}: SegmentedTabsProps) {
  const reduced = prefersReducedMotion()

  return (
    <LayoutGroup id={layoutId}>
      <TabsList className={cn(segmentedTabsList, className)} data-tour={dataTour}>
        {items.map((item) => {
          const isActive = value === item.value
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              data-tour={item.dataTour}
              className={cn(
                "relative z-0 gap-1.5 rounded-lg text-xs text-muted-foreground transition-colors duration-200",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                triggerClassName,
                item.className,
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`${layoutId}-active`}
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-lg bg-background shadow-elev-sm ring-1 ring-border/40"
                  transition={reduced ? { duration: 0 } : indicatorSpring}
                />
              )}
              {item.icon}
              {item.label}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </LayoutGroup>
  )
}
