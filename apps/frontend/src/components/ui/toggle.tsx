import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-md border text-sm font-medium whitespace-nowrap outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:border-sky-400/30 focus-visible:ring-[3px] focus-visible:ring-sky-400/15 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-transparent text-foreground/75 hover:bg-sky-500/8 hover:text-foreground aria-pressed:border-sky-500/12 aria-pressed:bg-gradient-to-r aria-pressed:from-sky-500/14 aria-pressed:to-cyan-400/10 aria-pressed:text-foreground",
        outline:
          "border-sky-500/12 bg-background/70 text-foreground/80 shadow-xs backdrop-blur-sm hover:bg-sky-500/8 hover:text-foreground aria-pressed:border-sky-500/16 aria-pressed:bg-gradient-to-r aria-pressed:from-sky-500/14 aria-pressed:to-cyan-400/10 aria-pressed:text-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }