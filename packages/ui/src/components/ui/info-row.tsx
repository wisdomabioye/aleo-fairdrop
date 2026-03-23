import * as React from "react"
import { cn } from "../../lib/utils"

export type InfoRowProps = {
  label:     React.ReactNode
  value:     React.ReactNode
  border?:   boolean
  className?: string
}

export function InfoRow({ label, value, border = true, className }: InfoRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2.5",
        border && "border-b border-border last:border-0",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}
