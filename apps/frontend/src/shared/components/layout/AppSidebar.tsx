import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  LayoutDashboard,
  Gavel,
  PlusCircle,
  LayoutList,
  Receipt,
  BadgeDollarSign,
  Share2,
  Lock,
  Coins,
  Settings2,
  BookOpen,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Wallet,
  Copy,
  Check,
  Scissors,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components';
import fairdropLogo from '@/assets/fairdrop.svg';
import { truncateAddress } from '@fairdrop/sdk/format';
import { AppRoutes } from '@/config';
import { cn } from '@/lib/utils';

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
};

const OVERVIEW: NavItem[] = [
  { label: 'Dashboard', to: AppRoutes.dashboard, icon: LayoutDashboard, end: true },
];

const AUCTIONS: NavItem[] = [
  { label: 'Browse', to: AppRoutes.auctions, icon: Gavel, end: true },
  { label: 'Create', to: AppRoutes.createAuction, icon: PlusCircle },
  { label: 'My Auctions', to: AppRoutes.myAuctions, icon: LayoutList },
  { label: 'My Bids', to: AppRoutes.myBids, icon: Receipt },
  { label: 'Claim', to: AppRoutes.claim, icon: BadgeDollarSign },
];

const FINANCE: NavItem[] = [
  { label: 'Earnings', to: AppRoutes.earnings, icon: TrendingUp },
  { label: 'Referral', to: AppRoutes.referral, icon: Share2 },
  { label: 'Vesting', to: AppRoutes.vesting, icon: Lock },
];

const TOOLS: NavItem[] = [
  { label: 'Shield', to: AppRoutes.shield, icon: ShieldCheck },
  { label: 'Token Launch', to: AppRoutes.tokenLaunch, icon: Coins },
  { label: 'Token Manager', to: AppRoutes.tokenManager, icon: Settings2 },
  { label: 'Split & Join', to: AppRoutes.tokenSplitJoin, icon: Scissors },
];

const RESOURCES: NavItem[] = [
  { label: 'Guide', to: AppRoutes.guide, icon: BookOpen },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupLabel className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
        {label}
      </SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map(({ label: name, to, icon: Icon, end }) => (
            <SidebarMenuItem key={to}>
              <NavLink to={to} end={end} className="block w-full">
                {({ isActive }) => (
                  <SidebarMenuButton
                    isActive={isActive}
                    className={cn(
                      'group relative h-11 w-full rounded-xl border border-transparent px-2.5 transition-[border-color,background-color,box-shadow,transform] duration-200',
                      'hover:border-sky-500/10 hover:bg-sidebar-accent/45 hover:shadow-xs',
                      isActive &&
                        'border-sky-500/12 bg-gradient-to-r from-sky-500/14 via-sky-400/8 to-transparent text-sidebar-foreground shadow-xs ring-1 ring-white/5'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sky-400 transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0'
                      )}
                    />

                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg border transition-[border-color,background-color,color]',
                        isActive
                          ? 'border-sky-500/14 bg-sky-500/10 text-sky-300'
                          : 'border-sidebar-border/60 bg-sidebar-accent/25 text-sidebar-foreground/70 group-hover:border-sky-500/10 group-hover:bg-sky-500/6'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {name}
                    </span>

                    <ChevronRight
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground/60 transition-all duration-200',
                        isActive
                          ? 'translate-x-0 text-sky-300/90 opacity-100'
                          : 'translate-x-[-2px] opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                      )}
                    />
                  </SidebarMenuButton>
                )}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function WalletChip() {
  const { address, connected, wallet } = useWallet();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
  };

  if (!connected || !address) {
    return (
      <div className="rounded-xl border border-sky-500/10 bg-gradient-surface px-3 py-2 shadow-xs ring-1 ring-white/5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-sky-500/10 bg-sky-500/8 text-sky-300">
            <Wallet className="size-3.5" />
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            Wallet not connected
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={copyAddress}
      className={cn(
        'w-full rounded-xl border border-sky-500/10 bg-gradient-surface px-3 py-2 text-left shadow-xs ring-1 ring-white/5 transition-[border-color,background-color]',
        'hover:border-sky-500/16 hover:bg-background/70',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-400/15'
      )}
      title={copied ? 'Copied' : 'Copy wallet address'}
      aria-label={copied ? 'Copied wallet address' : 'Copy wallet address'}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sky-500/10 bg-sky-500/8">
          {wallet?.adapter.icon ? (
            <img
              src={wallet.adapter.icon}
              alt={wallet.adapter.name}
              className="size-4 object-contain"
            />
          ) : (
            <Wallet className="size-3.5 text-sky-300" />
          )}
        </div>

        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-sidebar-foreground">
          {truncateAddress(address)}
        </span>

        {copied ? (
          <Check className="size-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}

export function AppSidebar() {
  return (
    <Sidebar className="border-r border-sky-500/10 bg-sidebar/95 backdrop-blur-xl">
      <SidebarHeader className="px-3 py-3">
        <div className="rounded-2xl border border-sky-500/12 bg-gradient-surface px-3 py-2.5 shadow-xs ring-1 ring-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl border border-sky-500/14 bg-white/90 p-2 shadow-xs dark:bg-white/10">
              <img src={fairdropLogo} alt="Fairdrop" className="size-full object-contain" />
            </div>

            <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Fairdrop
            </span>

            <span className="rounded-full border border-sky-500/12 bg-sky-500/8 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              Aleo
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 pb-2">
        <NavGroup label="Overview" items={OVERVIEW} />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroup label="Auctions" items={AUCTIONS} />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroup label="Finance" items={FINANCE} />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroup label="Tools" items={TOOLS} />
      </SidebarContent>

      <SidebarFooter className="space-y-2 px-3 pb-4">
        <NavGroup label="Resources" items={RESOURCES} />
        <WalletChip />
      </SidebarFooter>
    </Sidebar>
  );
}
