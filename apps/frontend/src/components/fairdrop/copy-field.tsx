import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "../../lib/utils"

export type CopyFieldProps = {
  label: string
  value: string
  truncate?: boolean
  className?: string
}

export function CopyField({
  label,
  value,
  truncate = true,
  className,
}: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  const display =
    truncate && value.length > 20
      ? `${value.slice(0, 10)}...${value.slice(-8)}`
      : value

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-3 rounded-xl border border-sky-500/12 bg-gradient-surface px-3 py-2.5 shadow-xs ring-1 ring-white/5 backdrop-blur-sm",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
          {label}
        </p>
        <p className="truncate font-mono text-[13px] text-foreground/85">{display}</p>
      </div>

      <button
        type="button"
        onClick={copy}
        className={cn(
          "shrink-0 rounded-lg border border-sky-500/10 bg-background/60 p-2 text-muted-foreground transition-[border-color,background-color,color,box-shadow] outline-none",
          "hover:border-sky-500/16 hover:bg-sky-500/8 hover:text-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-sky-400/15",
          copied && "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
        )}
        title={copied ? "Copied" : "Copy to clipboard"}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
