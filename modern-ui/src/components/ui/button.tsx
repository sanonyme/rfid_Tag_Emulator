import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "smooth-press relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium select-none cursor-pointer outline-none transition-[transform,background-color,box-shadow,border-color,color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/40 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface Ripple {
  key: number
  x: number
  y: number
  size: number
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Show a Material-style ripple on press. Ignored when `asChild` is set. */
  ripple?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, ripple = false, onPointerDown, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const [ripples, setRipples] = React.useState<Ripple[]>([])
    const rippleId = React.useRef(0)

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (ripple && !asChild) {
        const target = event.currentTarget
        const rect = target.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = event.clientX - rect.left - size / 2
        const y = event.clientY - rect.top - size / 2
        const key = rippleId.current++
        setRipples((prev) => [...prev, { key, x, y, size }])
        window.setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.key !== key))
        }, 600)
      }
      onPointerDown?.(event)
    }

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), ripple && "overflow-hidden")}
        ref={ref}
        onPointerDown={handlePointerDown}
        {...props}
      >
        {children}
        {ripple &&
          ripples.map((r) => (
            <span
              key={r.key}
              className="pointer-events-none absolute rounded-full bg-current opacity-30 animate-button-ripple"
              style={{
                left: r.x,
                top: r.y,
                width: r.size,
                height: r.size,
              }}
            />
          ))}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
