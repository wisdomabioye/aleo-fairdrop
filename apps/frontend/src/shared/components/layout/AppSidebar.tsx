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
  Zap,
  Wallet,
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
import { truncateAddress } from '@fairdrop/sdk/format';
import { AppRoutes } from '@/config';

// ── Nav item definition ──────────────────────────────────────────────────────

type NavItem = {
  label: string;
  to:    string;
  icon:  React.ComponentType<{ className?: string }>;
  end?:  boolean;
};

// ── Route groups ─────────────────────────────────────────────────────────────

const OVERVIEW: NavItem[] = [
  { label: 'Dashboard',      to: AppRoutes.dashboard,   icon: LayoutDashboard, end: true },
];

const AUCTIONS: NavItem[] = [
  { label: 'Browse',         to: AppRoutes.auctions,      icon: Gavel, end: true },
  { label: 'Create',         to: AppRoutes.createAuction, icon: PlusCircle },
  { label: 'My Auctions',    to: AppRoutes.myAuctions,    icon: LayoutList },
  { label: 'My Bids',        to: AppRoutes.myBids,        icon: Receipt },
  { label: 'Claim',          to: AppRoutes.claim,          icon: BadgeDollarSign },
];

const FINANCE: NavItem[] = [
  { label: 'Earnings',       to: AppRoutes.earnings,    icon: TrendingUp },
  { label: 'Referral',       to: AppRoutes.referral,    icon: Share2 },
  { label: 'Vesting',        to: AppRoutes.vesting,     icon: Lock },
];

const TOOLS: NavItem[] = [
  { label: 'Shield',         to: AppRoutes.shield,        icon: ShieldCheck },
  { label: 'Token Launch',   to: AppRoutes.tokenLaunch,   icon: Coins },
  { label: 'Token Manager',  to: AppRoutes.tokenManager,  icon: Settings2 },
];

const RESOURCES: NavItem[] = [
  { label: 'Guide',          to: AppRoutes.guide, icon: BookOpen },
];

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ label: name, to, icon: Icon, end }) => (
            <SidebarMenuItem key={to}>
              <NavLink to={to} end={end} className="block w-full">
                {({ isActive }) => (
                  <SidebarMenuButton
                    isActive={isActive}
                    className={isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      : 'hover:bg-sidebar-accent/50'}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{name}</span>
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

// ── WalletChip ────────────────────────────────────────────────────────────────

function WalletChip() {
  const { address, connected } = useWallet();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-xs text-sidebar-foreground">
      <Wallet className="size-3.5 shrink-0 text-sidebar-primary" />
      {connected && address ? (
        <span className="font-mono truncate">{truncateAddress(address)}</span>
      ) : (
        <span className="text-muted-foreground">Not connected</span>
      )}
    </div>
  );
}

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  return (
    <Sidebar>
      {/* Branding */}
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Zap className="size-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">
            Fairdrop
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Overview"  items={OVERVIEW} />
        <SidebarSeparator />
        <NavGroup label="Auctions"  items={AUCTIONS} />
        <SidebarSeparator />
        <NavGroup label="Finance"   items={FINANCE} />
        <SidebarSeparator />
        <NavGroup label="Tools"     items={TOOLS} />
      </SidebarContent>

      <SidebarFooter className="space-y-3 px-3 pb-4">
        <NavGroup label="Resources" items={RESOURCES} />
        <WalletChip />
      </SidebarFooter>
    </Sidebar>
  );
}
