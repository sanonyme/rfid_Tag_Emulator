import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none outline-none placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-200 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/25 focus:ring-offset-0 focus:shadow-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/25 focus-visible:ring-offset-0 focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

