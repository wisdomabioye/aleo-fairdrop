import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-sky-500/12 bg-background/70 shadow-xs backdrop-blur-sm transition-[background-color,border-color,box-shadow] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-sky-400/30 focus-visible:ring-3 focus-visible:ring-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-sky-950/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-sky-400/20 data-checked:bg-gradient-to-br data-checked:from-sky-500 data-checked:to-cyan-400 data-checked:text-white",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }