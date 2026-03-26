import * as React from "react"
import { Eye, EyeOff, LockKeyhole, ScanEye, ShieldCheck } from "lucide-react"

import { cn } from "../../lib/utils"
import { Badge } from "../ui/badge"

export type PrivacyState =
  | "public"
  | "private"
  | "sealed"
  | "revealed"
  | "gated"

export type PrivacyBadgeProps = {
  state: PrivacyState
  label?: string
  showIcon?: boolean
  className?: string
}

const privacyConfig: Record<
  PrivacyState,
  {
    label: string
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    className: string
    dotClassName: string
  }
> = {
  public: {
    label: "Public",
    icon: Eye,
    className:
      "border-emerald-500/16 bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/10 dark:text-emerald-300",
    dotClassName: "bg-emerald-500 dark:bg-emerald-400",
  },
  private: {
    label: "Private",
    icon: EyeOff,
    className:
      "border-sky-500/16 bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/10 dark:text-sky-300",
    dotClassName: "bg-sky-500 dark:bg-sky-400",
  },
  sealed: {
    label: "Sealed",
    icon: LockKeyhole,
    className:
      "border-violet-500/16 bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/10 dark:text-violet-300",
    dotClassName: "bg-violet-500 dark:bg-violet-400",
  },
  revealed: {
    label: "Revealed",
    icon: ScanEye,
    className:
      "border-amber-500/16 bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/10 dark:text-amber-300",
    dotClassName: "bg-amber-500 dark:bg-amber-400",
  },
  gated: {
    label: "Gated",
    icon: ShieldCheck,
    className:
      "border-fuchsia-500/16 bg-fuchsia-500/10 text-fuchsia-700 ring-1 ring-fuchsia-500/10 dark:text-fuchsia-300",
    dotClassName: "bg-fuchsia-500 dark:bg-fuchsia-400",
  },
}

export function PrivacyBadge({
  state,
  label,
  showIcon = true,
  className,
}: PrivacyBadgeProps) {
  const {
    icon: Icon,
    label: defaultLabel,
    className: stateClassName,
    dotClassName,
  } = privacyConfig[state]

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.01em] shadow-xs backdrop-blur-sm",
        stateClassName,
        className
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", dotClassName)}
        aria-hidden="true"
      />
      {showIcon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      <span>{label ?? defaultLabel}</span>
    </Badge>
  )
}