import * as React from "react"
import { Zap, RefreshCw, StopCircle } from "lucide-react"
import { Button, type ButtonProps } from "./ui/button"
import { cn } from "@/lib/utils"

/**
 * Shared "Send" / "Loop Send" action buttons so every tab (Fixed, Handheld, ...)
 * uses the exact same look and motion: a gradient primary with a sheen sweep and
 * an animated icon, plus a loop/stop button that morphs between an idle "Loop
 * Send" (rotating refresh icon) and an active "Stop" (destructive ring).
 */

const sendPrimaryBase =
  "group relative overflow-hidden gap-2 rounded-lg font-semibold text-primary-foreground bg-gradient-to-br from-primary via-primary to-primary/80 shadow-md shadow-primary/30 ring-1 ring-primary/30 transition-all duration-200 hover:shadow-lg hover:shadow-primary/40 hover:brightness-[1.07] active:scale-[0.98] active:brightness-100"

export interface SendButtonProps extends Omit<ButtonProps, "variant" | "size"> {
  label?: string
  /** Optional keyboard shortcut badge rendered on the right. */
  shortcut?: string
  size?: "sm" | "lg"
}

export const SendButton = React.forwardRef<HTMLButtonElement, SendButtonProps>(
  ({ label = "Send Tags", shortcut, size = "lg", className, ...props }, ref) => {
    const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
    return (
      <Button
        ref={ref}
        size={size}
        className={cn(sendPrimaryBase, size === "lg" && "h-11 min-h-11", className)}
        {...props}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
        />
        <Zap
          className={cn(
            iconSize,
            "shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-90",
          )}
        />
        <span>{label}</span>
        {shortcut && (
          <kbd className="pointer-events-none inline-flex items-center rounded-md border border-primary-foreground/25 bg-primary-foreground/15 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-primary-foreground/95 transition-colors group-hover:bg-primary-foreground/25">
            {shortcut}
          </kbd>
        )}
      </Button>
    )
  },
)
SendButton.displayName = "SendButton"

export interface LoopSendButtonProps
  extends Omit<ButtonProps, "variant" | "size" | "children"> {
  /** True while a send/loop is in progress (renders the destructive "Stop" state). */
  active: boolean
  idleLabel?: string
  activeLabel?: string
  size?: "sm" | "lg"
}

export const LoopSendButton = React.forwardRef<HTMLButtonElement, LoopSendButtonProps>(
  (
    { active, idleLabel = "Loop Send", activeLabel = "Stop", size = "lg", className, ...props },
    ref,
  ) => {
    const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
    return (
      <Button
        ref={ref}
        size={size}
        variant={active ? "destructive" : "outline"}
        className={cn(
          "group gap-2 rounded-lg font-semibold transition-all duration-200 active:scale-[0.98]",
          size === "lg" && "h-11 min-h-11 px-4 sm:min-w-[9.75rem]",
          active
            ? "shadow-md shadow-destructive/30 ring-2 ring-destructive/40 hover:shadow-lg hover:shadow-destructive/40"
            : "border-primary/30 bg-primary/5 text-primary shadow-sm hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-md hover:shadow-primary/15",
          className,
        )}
        {...props}
      >
        {active ? (
          <>
            <StopCircle
              className={cn(
                iconSize,
                "shrink-0 transition-transform duration-200 group-hover:scale-110",
              )}
            />
            {activeLabel}
          </>
        ) : (
          <>
            <RefreshCw
              className={cn(
                iconSize,
                "shrink-0 transition-transform duration-500 ease-out group-hover:rotate-180",
              )}
            />
            {idleLabel}
          </>
        )}
      </Button>
    )
  },
)
LoopSendButton.displayName = "LoopSendButton"
