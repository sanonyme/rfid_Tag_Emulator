import * as React from "react"
import { cn } from "@/lib/utils"

type AsProp = "div" | "section" | "ul" | "ol"

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  /** Render element tag. Defaults to `div`. */
  as?: AsProp
  /**
   * When true, stagger the direct children's entrance (uses the CSS
   * `stagger-children` utility). When false, the container itself reveals as a
   * single block.
   */
  stagger?: boolean
}

/**
 * Lightweight entrance wrapper. CSS-driven (see `index.css`), so it adds no
 * re-render cost and automatically respects `prefers-reduced-motion`.
 *
 * - `<Reveal stagger>` for card grids / lists (children fade+slide in sequence).
 * - `<Reveal>` for a single block fade-in.
 */
export const Reveal = React.forwardRef<HTMLElement, RevealProps>(
  ({ as = "div", stagger = false, className, children, ...props }, ref) => {
    const Comp = as as React.ElementType
    return (
      <Comp
        ref={ref}
        className={cn(stagger ? "stagger-children" : "reveal-item", className)}
        {...props}
      >
        {children}
      </Comp>
    )
  },
)
Reveal.displayName = "Reveal"
