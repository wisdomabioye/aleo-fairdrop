import { cn } from "../../lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-sky-500/8 via-sky-400/14 to-sky-500/8",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }