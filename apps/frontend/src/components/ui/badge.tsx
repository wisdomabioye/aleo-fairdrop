import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-sky-400/20 bg-gradient-brand text-white shadow-brand [a]:hover:brightness-110",
        secondary:
          "border-sky-500/10 bg-gradient-brand-soft text-foreground [a]:hover:bg-sky-500/10",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-sky-500/15 bg-background/70 text-foreground backdrop-blur-sm [a]:hover:bg-sky-500/8",
        ghost:
          "border-transparent text-muted-foreground hover:bg-sky-500/8 hover:text-foreground",
        link: "border-transparent px-0 text-sky-600 underline-offset-4 hover:underline dark:text-sky-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }