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
  BarChart2,
  ArrowLeftRight,
  Droplets,
  type LucideIcon,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
  useSidebar,
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
  { label: 'Dashboard', to: AppRoutes.dashboard,  icon: LayoutDashboard, end: true },
  { label: 'Analytics', to: AppRoutes.analytics,  icon: BarChart2 },
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

const EXCHANGE: NavItem[] = [
  { label: 'Swap',      to: AppRoutes.dex,          icon: ArrowLeftRight, end: true },
  { label: 'Liquidity', to: AppRoutes.dexLiquidity,  icon: Droplets },
  { label: 'New Pool',  to: AppRoutes.dexPoolNew,    icon: PlusCircle },
];

const RESOURCES: NavItem[] = [
  { label: 'Guide', to: AppRoutes.guide, icon: BookOpen },
];

function NavItemButton({ name, icon: Icon, isActive }: { name: string; icon: LucideIcon; isActive: boolean }) {
  return (
    <SidebarMenuButton
      isActive={isActive}
      className={cn(
        'group relative h-8 w-full rounded-lg border border-transparent px-2 transition-[border-color,background-color] duration-200',
        'hover:border-sky-500/10 hover:bg-sidebar-accent/45',
        isActive &&
          'border-sky-500/12 bg-gradient-to-r from-sky-500/14 via-sky-400/8 to-transparent text-sidebar-foreground ring-1 ring-white/5'
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sky-400 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0'
        )}
      />
      <Icon className={cn(
        'size-3.5 shrink-0 transition-colors',
        isActive ? 'text-sky-300' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80'
      )} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
    </SidebarMenuButton>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const handleNavClick = () => { if (isMobile) setOpenMobile(false); };

  return (
    <SidebarGroup className="px-2 py-0.5">
      <SidebarGroupLabel className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map(({ label: name, to, icon, end }) => (
            <SidebarMenuItem key={to}>
              <NavLink to={to} end={end} className="block w-full" onClick={handleNavClick}>
                {({ isActive }) => <NavItemButton name={name} icon={icon} isActive={isActive} />}
              </NavLink>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function sidebarGroupKey(label: string): string {
  return `sidebar-group-${label.toLowerCase()}`;
}

function NavGroupCollapsible({
  label,
  items,
  defaultOpen = true,
}: {
  label:        string;
  items:        NavItem[];
  defaultOpen?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const storageKey = sidebarGroupKey(label);

  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  const toggle = () =>
    setOpen((prev) => {
      localStorage.setItem(storageKey, String(!prev));
      return !prev;
    });

  const handleNavClick = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Collapsible open={open} onOpenChange={toggle}>
      <SidebarGroup className="px-2 py-0.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between px-2 pb-1.5"
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75 transition-colors group-hover:text-muted-foreground">
              {label}
            </span>
            <ChevronRight
              className={cn(
                'size-3 text-muted-foreground/50 transition-transform duration-150 ease-out',
                open ? 'rotate-90' : 'rotate-0',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map(({ label: name, to, icon, end }) => (
                <SidebarMenuItem key={to}>
                  <NavLink to={to} end={end} className="block w-full" onClick={handleNavClick}>
                    {({ isActive }) => <NavItemButton name={name} icon={icon} isActive={isActive} />}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
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
        <NavGroupCollapsible label="Overview"  items={OVERVIEW}  defaultOpen />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroupCollapsible label="Auctions"  items={AUCTIONS}  defaultOpen />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroupCollapsible label="Exchange"  items={EXCHANGE}  defaultOpen />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroupCollapsible label="Finance"   items={FINANCE}   defaultOpen={false} />
        <SidebarSeparator className="mx-3 bg-sky-500/8" />
        <NavGroupCollapsible label="Tools"     items={TOOLS}     defaultOpen={false} />
      </SidebarContent>

      <SidebarFooter className="space-y-2 px-3 pb-4">
        <NavGroup label="Resources" items={RESOURCES} />
        <WalletChip />
      </SidebarFooter>
    </Sidebar>
  );
}
