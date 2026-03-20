import * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

import { cn } from "../../lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card"
import { Skeleton } from "../ui/skeleton"

export type MetricTrend = "up" | "down" | "neutral"

export type MetricCardProps = {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  delta?: React.ReactNode
  trend?: MetricTrend
  icon?: React.ReactNode
  loading?: boolean
  className?: string
}

const trendConfig: Record<
  MetricTrend,
  { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; className: string }
> = {
  up: {
    icon: ArrowUpRight,
    className: "text-emerald-400",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-rose-400",
  },
  neutral: {
    icon: ArrowRight,
    className: "text-muted-foreground",
  },
}

export function MetricCard({
  label,
  value,
  hint,
  delta,
  trend,
  icon,
  loading = false,
  className,
}: MetricCardProps) {
  const TrendIcon = trend ? trendConfig[trend].icon : null

  return (
    <Card
      className={cn(
        "border-border/60 bg-card/70 backdrop-blur-sm",
        className
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardDescription className="text-xs uppercase tracking-[0.18em]">
            {label}
          </CardDescription>
          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <CardTitle className="text-2xl font-semibold tracking-tight">
              <span className="tabular-nums">{value}</span>
            </CardTitle>
          )}
        </div>

        {icon ? (
          <div className="rounded-xl border border-border/60 bg-muted/40 p-2 text-muted-foreground">
            {icon}
          </div>
        ) : null}
      </CardHeader>

      {(hint || delta || loading) ? (
        <CardContent className="flex items-center justify-between gap-3 pt-0">
          <div className="min-h-5 text-sm text-muted-foreground">
            {loading ? <Skeleton className="h-4 w-24" /> : hint}
          </div>

          {delta ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium",
                trend ? trendConfig[trend].className : "text-muted-foreground"
              )}
            >
              {TrendIcon ? <TrendIcon className="size-4" aria-hidden="true" /> : null}
              <span>{delta}</span>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}