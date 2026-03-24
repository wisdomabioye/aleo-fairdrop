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
  }
> = {
  upcoming: {
    label: "Upcoming",
    icon: Clock3,
    className: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  },
  active: {
    label: "Active",
    icon: PlayCircle,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
  clearing: {
    label: "Clearing",
    icon: LoaderCircle,
    className: "border-orange-500/20 bg-orange-500/10 text-orange-300",
  },
  cleared: {
    label: "Cleared",
    icon: CheckCircle2,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  },
  voided: {
    label: "Voided",
    icon: TriangleAlert,
    className: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  },
  ended: {
    label: "Ended",
    icon: Gavel,
    className: "border-slate-500/20 bg-slate-500/10 text-slate-300",
  },
}

export function AuctionStatusBadge({
  status,
  label,
  showIcon = true,
  className,
}: AuctionStatusBadgeProps) {
  const { icon: Icon, label: defaultLabel, className: statusClassName } =
    statusConfig[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
        statusClassName,
        className
      )}
    >
      {showIcon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      <span>{label ?? defaultLabel}</span>
    </Badge>
  )
}