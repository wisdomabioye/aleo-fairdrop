import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  LoaderCircle,
} from "lucide-react"

import { cn } from "../../lib/utils"

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
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    iconClassName: string
    ringClassName: string
  }
> = {
  upcoming: {
    icon: Circle,
    iconClassName: "text-muted-foreground",
    ringClassName: "border-border bg-background",
  },
  current: {
    icon: LoaderCircle,
    iconClassName: "animate-spin text-sky-400",
    ringClassName: "border-sky-500/30 bg-sky-500/10",
  },
  complete: {
    icon: CheckCircle2,
    iconClassName: "text-emerald-400",
    ringClassName: "border-emerald-500/30 bg-emerald-500/10",
  },
  error: {
    icon: AlertCircle,
    iconClassName: "text-rose-400",
    ringClassName: "border-rose-500/30 bg-rose-500/10",
  },
}

export function TxStatusStepper({
  steps,
  className,
}: TxStatusStepperProps) {
  return (
    <ol className={cn("space-y-4", className)}>
      {steps.map((step, index) => {
        const { icon: Icon, iconClassName, ringClassName } =
          stepConfig[step.status]

        return (
          <li key={step.id} className="relative flex gap-3">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border"
              />
            ) : null}

            <div
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                ringClassName
              )}
            >
              <Icon className={cn("size-4", iconClassName)} aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                {step.meta ? (
                  <span className="text-xs text-muted-foreground">{step.meta}</span>
                ) : null}
              </div>

              {step.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.description}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}