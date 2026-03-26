import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  LoaderCircle,
} from "lucide-react"

import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"
import { Card, CardContent } from "../ui/card"

export type TxStepStatus = "upcoming" | "current" | "complete" | "error"

export type TxStep = {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  status: TxStepStatus
  meta?: React.ReactNode
}

export type TxStatusStepperProps = {
  steps: TxStep[]
  className?: string
}

const stepConfig: Record<
  TxStepStatus,
  {
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    iconClassName: string
    ringClassName: string
    lineClassName: string
    badgeClassName: string
    titleClassName: string
  }
> = {
  upcoming: {
    label: "Upcoming",
    icon: Circle,
    iconClassName: "text-muted-foreground/70",
    ringClassName: "border-sky-500/10 bg-background/70",
    lineClassName: "bg-border/80",
    badgeClassName:
      "border-slate-500/14 bg-slate-500/8 text-muted-foreground",
    titleClassName: "text-foreground/80",
  },
  current: {
    label: "In Progress",
    icon: LoaderCircle,
    iconClassName: "animate-spin text-sky-500 dark:text-sky-400",
    ringClassName:
      "border-sky-500/20 bg-sky-500/10 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]",
    lineClassName: "bg-sky-500/20",
    badgeClassName:
      "border-sky-500/16 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    titleClassName: "text-foreground",
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    iconClassName: "text-emerald-500 dark:text-emerald-400",
    ringClassName:
      "border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]",
    lineClassName: "bg-emerald-500/20",
    badgeClassName:
      "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    titleClassName: "text-foreground",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    iconClassName: "text-rose-500 dark:text-rose-400",
    ringClassName:
      "border-rose-500/20 bg-rose-500/10 shadow-[0_0_0_4px_rgba(244,63,94,0.08)]",
    lineClassName: "bg-rose-500/20",
    badgeClassName:
      "border-rose-500/16 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    titleClassName: "text-foreground",
  },
}

export function TxStatusStepper({
  steps,
  className,
}: TxStatusStepperProps) {
  return (
    <Card
      className={cn(
        "border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5 backdrop-blur-sm",
        className
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <ol className="space-y-0">
          {steps.map((step, index) => {
            const {
              icon: Icon,
              iconClassName,
              ringClassName,
              lineClassName,
              badgeClassName,
              label,
              titleClassName,
            } = stepConfig[step.status]

            const isLast = index === steps.length - 1

            return (
              <li
                key={step.id}
                className={cn("relative flex gap-3", !isLast && "pb-4")}
              >
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-4 top-9 w-px h-[calc(100%-1rem)]",
                      lineClassName
                    )}
                  />
                ) : null}

                <div
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm",
                    ringClassName
                  )}
                >
                  <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={cn("text-sm font-medium", titleClassName)}>
                      {step.label}
                    </p>

                    <div className="flex items-center gap-2">
                      {step.meta ? (
                        <span className="text-xs text-muted-foreground">
                          {step.meta}
                        </span>
                      ) : null}

                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium shadow-xs",
                          badgeClassName
                        )}
                      >
                        {label}
                      </Badge>
                    </div>
                  </div>

                  {step.description ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}