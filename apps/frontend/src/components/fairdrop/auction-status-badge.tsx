import * as React from "react"
import {
  CheckCircle2,
  Clock3,
  Gavel,
  LoaderCircle,
  PlayCircle,
  TriangleAlert,
} from "lucide-react"
import type { AuctionStatus } from "@fairdrop/types/domain"

import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"

export type { AuctionStatus }

export type AuctionStatusBadgeProps = {
  status: AuctionStatus
  label?: string
  showIcon?: boolean
  className?: string
}

const statusConfig: Record<
  AuctionStatus,
  {
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    className: string
    iconClassName?: string
    dotClassName: string
  }
> = {
  upcoming: {
    label: "Upcoming",
    icon: Clock3,
    className:
      "border-sky-500/16 bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/10 dark:text-sky-300",
    dotClassName: "bg-sky-500 dark:bg-sky-400",
  },
  active: {
    label: "Active",
    icon: PlayCircle,
    className:
      "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/10 dark:text-emerald-300",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  clearing: {
    label: "Clearing",
    icon: LoaderCircle,
    className:
      "border-amber-500/16 bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/10 dark:text-amber-300",
    iconClassName: "animate-spin",
    dotClassName: "bg-amber-500 dark:bg-amber-400",
  },
  cleared: {
    label: "Cleared",
    icon: CheckCircle2,
    className:
      "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/10 dark:text-emerald-300",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  voided: {
    label: "Voided",
    icon: TriangleAlert,
    className:
      "border-rose-500/16 bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/10 dark:text-rose-300",
    dotClassName: "bg-rose-500 dark:bg-rose-400",
  },
  ended: {
    label: "Ended",
    icon: Gavel,
    className:
      "border-slate-500/16 bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/10 dark:text-slate-300",
    dotClassName: "bg-slate-500 dark:bg-slate-400",
  },
}

export function AuctionStatusBadge({
  status,
  label,
  showIcon = true,
  className,
}: AuctionStatusBadgeProps) {
  const {
    icon: Icon,
    label: defaultLabel,
    className: statusClassName,
    iconClassName,
    dotClassName,
  } = statusConfig[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] shadow-xs backdrop-blur-sm",
        statusClassName,
        className
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", dotClassName)}
        aria-hidden="true"
      />
      {showIcon ? (
        <Icon className={cn("size-3.5", iconClassName)} aria-hidden="true" />
      ) : null}
      <span>{label ?? defaultLabel}</span>
    </Badge>
  )
}