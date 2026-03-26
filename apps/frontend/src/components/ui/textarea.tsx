import * as React from "react"

import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-sky-500/12 bg-background/70 px-2.5 py-2 text-base shadow-xs backdrop-blur-sm transition-[color,box-shadow,border-color,background-color] outline-none placeholder:text-muted-foreground/80 focus-visible:border-sky-400/30 focus-visible:bg-background/90 focus-visible:ring-3 focus-visible:ring-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-sky-950/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }