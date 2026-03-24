import * as React from "react"
import { useId } from "react"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { cn } from "../../lib/utils"

export type TokenAmountInputProps = {
  label:        string
  value:        string
  onChange:     (value: string) => void
  decimals:     number
  symbol?:      string | null
  /** Raw on-chain max (bigint). Renders a "Max" button when provided. */
  max?:         bigint
  maxLabel?:    string
  placeholder?: string
  error?:       string
  hint?:        string
  className?:   string
}

function formatPlain(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString()
  const divisor = 10n ** BigInt(decimals)
  const whole   = amount / divisor
  const frac    = amount % divisor
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}

/**
 * Numeric input for human-readable token amounts with decimal support.
 * Parent stores the display string; converts to raw bigint via parseTokenAmount.
 */
export function TokenAmountInput({
  label,
  value,
  onChange,
  decimals,
  symbol,
  max,
  maxLabel = "Max",
  placeholder,
  error,
  hint,
  className,
}: TokenAmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value

    if (decimals === 0) {
      v = v.replace(/[^0-9]/g, "")
    } else {
      v = v.replace(/[^0-9.]/g, "")
      const parts = v.split(".")
      if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("")
      if (parts.length === 2 && parts[1]!.length > decimals)
        v = parts[0] + "." + parts[1]!.slice(0, decimals)
    }

    onChange(v)
  }

  const handleMax = () => {
    if (max == null) return
    onChange(formatPlain(max, decimals))
  }

  const inputId = useId()
  const fullLabel = symbol ? `${label} (${symbol})` : label

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={inputId}>{fullLabel}</Label>
      <Input
        id={inputId}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        aria-invalid={!!error}
      />
      {max != null && (
        <button
          type="button"
          onClick={handleMax}
          className="text-xs text-primary hover:underline"
        >
          {maxLabel} ({formatPlain(max, decimals)}{symbol ? ` ${symbol}` : ""})
        </button>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
