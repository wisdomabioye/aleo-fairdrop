import { type CSSProperties, useRef, useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import {
  Copy,
  Check,
  Gavel,
  ClipboardList,
  PackageCheck,
  LockIcon,
  LogOut,
  ChevronDown,
  Wallet2,
  type LucideIcon,
} from "lucide-react"
import { truncateAddress } from "@fairdrop/sdk/format"
import { useAdminGate } from "@/features/admin/hooks/useAdminGate"
import { AppRoutes } from "@/config"
import { cn } from "@/lib/utils"

interface WalletMenuProps {
  address: string
  walletName?: string
  walletIcon?: string
  onDisconnect: () => void
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-sm transition-[background-color,border-color,color] outline-none",
        "hover:border-sky-500/10 hover:bg-gradient-to-r hover:from-sky-500/10 hover:to-cyan-400/6",
        "focus-visible:border-sky-400/20 focus-visible:ring-[3px] focus-visible:ring-sky-400/15",
        destructive ? "text-destructive" : "text-foreground/90"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border",
          destructive
            ? "border-destructive/15 bg-destructive/8 text-destructive"
            : "border-sky-500/10 bg-sky-500/8 text-sky-600 dark:text-sky-300"
        )}
      >
        <Icon className={cn("size-3.5", destructive ? "text-current" : "")} />
      </span>

      <span className="flex-1 text-left text-sm font-medium">{label}</span>
    </button>
  )
}

export function WalletMenu({
  address,
  walletName,
  walletIcon,
  onDisconnect,
}: WalletMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const { canEnter: showAdminLink } = useAdminGate()
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const viewportPadding = 8
    const width = Math.min(280, Math.max(220, window.innerWidth - viewportPadding * 2))
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      window.innerWidth - width - viewportPadding
    )

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width,
      zIndex: 120,
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updatePosition()

    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }

    function handleReposition() {
      updatePosition()
    }

    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)

    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [open, updatePosition])

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const go = (path: string) => {
    navigate(path)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "group flex h-9 items-center gap-2 rounded-xl border border-sky-500/12 bg-background/70 px-3 text-sm font-medium text-foreground shadow-xs backdrop-blur-sm transition-[border-color,background-color,box-shadow]",
          "hover:border-sky-500/20 hover:bg-background/90 hover:shadow-brand",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/15",
          open && "border-sky-500/18 bg-background/90 shadow-brand"
        )}
      >
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
        </span>

        {walletIcon ? (
          <img
            src={walletIcon}
            alt={walletName ?? "Wallet"}
            className="size-3.5 rounded-sm object-contain"
          />
        ) : (
          <Wallet2 className="size-3.5 text-sky-500 dark:text-sky-400" />
        )}

        <span className="hidden md:inline">{truncateAddress(address)}</span>
        <span className="md:hidden">{truncateAddress(address, 4)}</span>

        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180 text-foreground/80"
          )}
        />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className={cn(
              "overflow-hidden rounded-xl border border-sky-500/12 bg-gradient-surface text-popover-foreground shadow-brand ring-1 ring-white/6 backdrop-blur-xl",
              "animate-in fade-in-0 zoom-in-95 duration-150"
            )}
          >
            <div className="relative overflow-hidden border-b border-sky-500/10 px-3 py-3">
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-sky-500/10 via-cyan-400/4 to-transparent" />

              <div className="relative flex items-start gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sky-500/12 bg-sky-500/8">
                  {walletIcon ? (
                    <img
                      src={walletIcon}
                      alt={walletName ?? "Wallet"}
                      className="size-5 object-contain"
                    />
                  ) : (
                    <Wallet2 className="size-4 text-sky-500 dark:text-sky-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {walletName ?? "Connected Wallet"}
                    </p>
                    <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Connected
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Wallet session active
                  </p>

                  <button
                    type="button"
                    onClick={copyAddress}
                    className={cn(
                      "mt-2 flex w-full items-center gap-2 rounded-lg border border-sky-500/10 bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground/90 transition-[border-color,background-color]",
                      "hover:border-sky-500/16 hover:bg-background/80",
                      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/15"
                    )}
                  >
                    <span className="flex-1 truncate text-left">
                      {truncateAddress(address, 10)}
                    </span>
                    {copied ? (
                      <Check className="size-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-1.5 py-1.5">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                Account
              </div>

              <div className="space-y-0.5">
                <MenuItem
                  icon={Gavel}
                  label="My Auctions"
                  onClick={() => go(AppRoutes.myAuctions)}
                />
                <MenuItem
                  icon={ClipboardList}
                  label="My Bids"
                  onClick={() => go(AppRoutes.myBids)}
                />
                <MenuItem
                  icon={PackageCheck}
                  label="Claim"
                  onClick={() => go(AppRoutes.claim)}
                />

                {showAdminLink && (
                  <MenuItem
                    icon={LockIcon}
                    label="Admin"
                    onClick={() => go(AppRoutes.admin)}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-sky-500/10 px-1.5 py-1.5">
              <MenuItem
                icon={LogOut}
                label="Disconnect"
                destructive
                onClick={() => {
                  onDisconnect()
                  setOpen(false)
                }}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}