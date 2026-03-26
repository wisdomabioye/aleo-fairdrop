"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "color-mix(in oklab, var(--popover) 88%, #0ea5e9 12%)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "rgb(14 165 233 / 0.18)",
          "--success-bg": "color-mix(in oklab, var(--popover) 84%, #22c55e 16%)",
          "--success-border": "rgb(34 197 94 / 0.24)",
          "--error-bg": "color-mix(in oklab, var(--popover) 88%, #ef4444 12%)",
          "--error-border": "rgb(239 68 68 / 0.22)",
          "--warning-bg": "color-mix(in oklab, var(--popover) 86%, #f59e0b 14%)",
          "--warning-border": "rgb(245 158 11 / 0.22)",
          "--info-bg": "color-mix(in oklab, var(--popover) 84%, #0ea5e9 16%)",
          "--info-border": "rgb(14 165 233 / 0.22)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
