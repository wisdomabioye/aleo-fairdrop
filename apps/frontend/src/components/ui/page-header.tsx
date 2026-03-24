import * as React from "react"
import { cn } from "../../lib/utils"

export type PageHeaderProps = {
  title:        React.ReactNode
  description?: React.ReactNode
  action?:      React.ReactNode
  className?:   string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
