import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-sky-500/10 ring-1 ring-sky-500/10",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-gradient-brand transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
