import * as React from "react"
import { Timer } from "lucide-react"

import { cn } from "../../lib/utils"

type CountdownMode = "compact" | "clock"

export type CountdownProps = {
  targetTime: Date | string | number
  mode?: CountdownMode
  completedLabel?: React.ReactNode
  onComplete?: () => void
  className?: string
}

type TimeLeft = {
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
  isComplete: boolean
}

function toTimestamp(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime()
}

function getTimeLeft(target: number): TimeLeft {
  const totalMs = Math.max(0, target - Date.now())
  const totalSeconds = Math.floor(totalMs / 1000)

  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return {
    totalMs,
    days,
    hours,
    minutes,
    seconds,
    isComplete: totalMs <= 0,
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function Countdown({
  targetTime,
  mode = "compact",
  completedLabel = "Ended",
  onComplete,
  className,
}: CountdownProps) {
  const target = React.useMemo(() => toTimestamp(targetTime), [targetTime])
  const [timeLeft, setTimeLeft] = React.useState(() => getTimeLeft(target))
  const completedRef = React.useRef(false)

  React.useEffect(() => {
    completedRef.current = false
    setTimeLeft(getTimeLeft(target))

    const interval = window.setInterval(() => {
      setTimeLeft(getTimeLeft(target))
    }, 1_000)

    return () => window.clearInterval(interval)
  }, [target])

  React.useEffect(() => {
    if (timeLeft.isComplete && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
  }, [timeLeft.isComplete, onComplete])

  if (timeLeft.isComplete) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground",
          className
        )}
      >
        <Timer className="size-4" aria-hidden="true" />
        <span>{completedLabel}</span>
      </div>
    )
  }

  const compactValue = [
    timeLeft.days > 0 ? `${timeLeft.days}d` : null,
    timeLeft.days > 0 || timeLeft.hours > 0 ? `${timeLeft.hours}h` : null,
    `${timeLeft.minutes}m`,
    `${timeLeft.seconds}s`,
  ]
    .filter(Boolean)
    .join(" ")

  const clockValue =
    timeLeft.days > 0
      ? `${timeLeft.days}:${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(
          timeLeft.seconds
        )}`
      : `${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(timeLeft.seconds)}`

  return (
    <div
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-sm",
        className
      )}
    >
      <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="font-mono tabular-nums text-foreground">
        {mode === "clock" ? clockValue : compactValue}
      </span>
    </div>
  )
}