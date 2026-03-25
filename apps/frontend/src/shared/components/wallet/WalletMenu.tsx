import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Check,
  Gavel,
  ClipboardList,
  PackageCheck,
  LockIcon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { truncateAddress } from "@fairdrop/sdk/format";
import { useProtocolConfig } from '@/shared/hooks/useProtocolConfig';
import { AppRoutes } from "@/config";

interface WalletMenuProps {
  address: string;
  walletName?: string;
  walletIcon?: string;
  onDisconnect: () => void;
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-secondary/80 ${
        destructive ? "text-destructive" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}

export function WalletMenu({ address, walletName, walletIcon, onDisconnect }: WalletMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: pc }  = useProtocolConfig();
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary-hover"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        {walletIcon && (
          <img
            src={walletIcon}
            alt={walletName}
            className="h-4 w-4 rounded-sm object-contain"
          />
        )}
        {truncateAddress(address)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-background shadow-xl animate-fade-in">
          {/* Wallet header */}
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {walletIcon && (
                <img
                  src={walletIcon}
                  alt=""
                  className="h-3.5 w-3.5 rounded-sm object-contain"
                />
              )}
              Connected via {walletName ?? "Wallet"}
            </p>
            <button
              onClick={copyAddress}
              className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
            >
              <span className="flex-1 truncate text-left">{truncateAddress(address, 10)}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </div>

          {/* User actions */}
          <div className="py-1">
            <MenuItem icon={Gavel} label="My Auctions" onClick={() => go(AppRoutes.myAuctions)} />
            <MenuItem icon={ClipboardList} label="My Bids" onClick={() => go(AppRoutes.myBids)} />
            <MenuItem icon={PackageCheck} label="Claim" onClick={() => go(AppRoutes.claim)} />
            {/* Admin Area */}
            {
              pc && pc.protocolAdmin === address && (
                <MenuItem icon={LockIcon} label="Admin" onClick={() => go(AppRoutes.admin)} />
              ) 
            }
          </div>

          {/* Disconnect */}
          <div className="border-t border-border py-1">
            <MenuItem
              icon={LogOut}
              label="Disconnect"
              destructive
              onClick={() => { onDisconnect(); setOpen(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
