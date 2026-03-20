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
  }
> = {
  public: {
    label: "Public",
    icon: Eye,
    className:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:text-emerald-300",
  },
  private: {
    label: "Private",
    icon: EyeOff,
    className:
      "border-sky-500/20 bg-sky-500/10 text-sky-300 dark:text-sky-300",
  },
  sealed: {
    label: "Sealed",
    icon: LockKeyhole,
    className:
      "border-violet-500/20 bg-violet-500/10 text-violet-300 dark:text-violet-300",
  },
  revealed: {
    label: "Revealed",
    icon: ScanEye,
    className:
      "border-amber-500/20 bg-amber-500/10 text-amber-300 dark:text-amber-300",
  },
  gated: {
    label: "Gated",
    icon: ShieldCheck,
    className:
      "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300 dark:text-fuchsia-300",
  },
}

export function PrivacyBadge({
  state,
  label,
  showIcon = true,
  className,
}: PrivacyBadgeProps) {
  const { icon: Icon, label: defaultLabel, className: stateClassName } =
    privacyConfig[state]

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
        stateClassName,
        className
      )}
    >
      {showIcon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      <span>{label ?? defaultLabel}</span>
    </Badge>
  )
}