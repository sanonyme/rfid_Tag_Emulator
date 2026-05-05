import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer touch-none select-none items-center data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-gradient-to-b from-muted/80 to-muted/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/40 dark:from-muted/50 dark:to-muted/30 dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-primary/80 via-primary to-primary/90 shadow-sm" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-[1.125rem] w-[1.125rem] rounded-full border-2 border-background bg-primary shadow-md ring-2 ring-primary/30 transition-[transform,box-shadow] hover:scale-110 hover:shadow-lg hover:ring-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
