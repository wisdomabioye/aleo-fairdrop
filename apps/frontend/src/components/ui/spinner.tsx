import { cn } from "../../lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin text-sky-500 dark:text-sky-400", className)}
      {...props}
    />
  )
}

export { Spinner }