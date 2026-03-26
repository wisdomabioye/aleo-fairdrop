import * as React from "react"
import { cn } from "../../lib/utils"

export type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        <div className="h-px w-20 bg-gradient-brand opacity-70" />
        <h2 className="bg-gradient-brand bg-clip-text text-2xl font-bold text-transparent">
          {title}
        </h2>
        {description && (
          <p className="max-w-2xl text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}