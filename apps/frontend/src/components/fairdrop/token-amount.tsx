import * as React from "react"

import { cn } from "../../lib/utils"

export type TokenAmountProps = {
  amount: string | number | bigint
  decimals?: number
  symbol?: string
  symbolPosition?: "prefix" | "suffix"
  compact?: boolean
  approximateUsd?: string | number
  className?: string
}

function formatUnits(value: string, decimals: number) {
  const negative = value.startsWith("-")
  const digits = negative ? value.slice(1) : value

  if (decimals === 0) {
    return `${negative ? "-" : ""}${digits}`
  }

  const padded = digits.padStart(decimals + 1, "0")
  const whole = padded.slice(0, -decimals) || "0"
  const fraction = padded.slice(-decimals).replace(/0+$/, "")

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`
}

function isIntegerString(value: string) {
  return /^-?\d+$/.test(value)
}

function toDisplayAmount(amount: string | number | bigint, decimals: number) {
  if (typeof amount === "bigint") {
    return formatUnits(amount.toString(), decimals)
  }

  if (typeof amount === "number") {
    return String(amount)
  }

  return isIntegerString(amount) ? formatUnits(amount, decimals) : amount
}

function formatWithIntl(value: string, compact: boolean) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return value
  }

  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 2 : 6,
  }).format(numeric)
}

function formatUsd(value: string | number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return String(value)
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric)
}

export function TokenAmount({
  amount,
  decimals = 0,
  symbol,
  symbolPosition = "suffix",
  compact = false,
  approximateUsd,
  className,
}: TokenAmountProps) {
  const rawValue = React.useMemo(
    () => toDisplayAmount(amount, decimals),
    [amount, decimals]
  )
  const formattedValue = React.useMemo(
    () => formatWithIntl(rawValue, compact),
    [rawValue, compact]
  )

  const primary =
    symbol && symbolPosition === "prefix"
      ? `${symbol} ${formattedValue}`
      : symbol
      ? `${formattedValue} ${symbol}`
      : formattedValue

  return (
    <div className={cn("inline-flex flex-col", className)}>
      <span className="font-mono text-sm font-medium tabular-nums text-foreground">
        {primary}
      </span>

      {approximateUsd !== undefined ? (
        <span className="text-xs text-muted-foreground">
          ≈ {formatUsd(approximateUsd)}
        </span>
      ) : null}
    </div>
  )
}