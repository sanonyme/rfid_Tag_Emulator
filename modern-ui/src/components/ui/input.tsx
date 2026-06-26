import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-200 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/25 focus:ring-offset-0 focus:shadow-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/25 focus-visible:ring-offset-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

