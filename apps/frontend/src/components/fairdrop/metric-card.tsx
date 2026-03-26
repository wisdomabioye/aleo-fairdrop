import * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"
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
  {
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    className: string
    badgeClassName: string
  }
> = {
  up: {
    icon: ArrowUpRight,
    className: "text-emerald-600 dark:text-emerald-300",
    badgeClassName:
      "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-rose-600 dark:text-rose-300",
    badgeClassName:
      "border-rose-500/16 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  neutral: {
    icon: ArrowRight,
    className: "text-muted-foreground",
    badgeClassName:
      "border-slate-500/14 bg-slate-500/8 text-muted-foreground",
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
        "border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5 backdrop-blur-sm",
        className
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardDescription className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
            {label}
          </CardDescription>
          {loading ? (
            <Skeleton className="h-8 w-32 rounded-md" />
          ) : (
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              <span className="tabular-nums">{value}</span>
            </CardTitle>
          )}
        </div>

        {icon ? (
          <div className="rounded-xl border border-sky-500/12 bg-sky-500/8 p-2.5 text-sky-600 shadow-xs dark:text-sky-300">
            {icon}
          </div>
        ) : null}
      </CardHeader>

      {(hint || delta || loading) ? (
        <CardContent className="flex items-center justify-between gap-3 pt-0">
          <div className="min-h-5 text-sm text-muted-foreground">
            {loading ? <Skeleton className="h-4 w-24 rounded-md" /> : hint}
          </div>

          {delta ? (
            <Badge
              variant="outline"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium shadow-xs",
                trend
                  ? trendConfig[trend].badgeClassName
                  : "border-slate-500/14 bg-slate-500/8 text-muted-foreground"
              )}
            >
              {TrendIcon ? (
                <TrendIcon
                  className={cn(
                    "size-3.5",
                    trend ? trendConfig[trend].className : "text-muted-foreground"
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <span>{delta}</span>
            </Badge>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}