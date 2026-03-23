import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "../../lib/utils"

export type CopyFieldProps = {
  label:      string
  value:      string
  truncate?:  boolean
  className?: string
}

export function CopyField({ label, value, truncate = true, className }: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const display =
    truncate && value.length > 20
      ? `${value.slice(0, 10)}...${value.slice(-8)}`
      : value

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg bg-secondary px-3 py-2",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm text-foreground">{display}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="ml-2 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
