import { NavLink } from 'react-router-dom';
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
} from '@fairdrop/ui';
import { routes } from '@/config';

// ── Nav item definition ──────────────────────────────────────────────────────

type NavItem = {
  label: string;
  to:    string;
  icon:  React.ComponentType<{ className?: string }>;
  end?:  boolean; // exact match for NavLink active state
};

// ── Route groups ─────────────────────────────────────────────────────────────

const OVERVIEW: NavItem[] = [
  { label: 'Dashboard',      to: routes.dashboard,   icon: LayoutDashboard, end: true },
];

const AUCTIONS: NavItem[] = [
  { label: 'Browse',         to: routes.auctions,     icon: Gavel, end: true },
  { label: 'Create',         to: routes.createAuction, icon: PlusCircle },
  { label: 'My Auctions',    to: routes.myAuctions,   icon: LayoutList },
  { label: 'My Bids',        to: routes.myBids,        icon: Receipt },
  { label: 'Claim',          to: routes.claim,         icon: BadgeDollarSign },
];

const FINANCE: NavItem[] = [
  { label: 'Earnings',       to: routes.earnings,    icon: TrendingUp },
  { label: 'Referral',       to: routes.referral,    icon: Share2 },
  { label: 'Vesting',        to: routes.vesting,     icon: Lock },
];

const TOOLS: NavItem[] = [
  { label: 'Token Launch',   to: routes.tokenLaunch,   icon: Coins },
  { label: 'Token Manager',  to: routes.tokenManager,  icon: Settings2 },
];

const RESOURCES: NavItem[] = [
  { label: 'Guide',          to: routes.guide,          icon: BookOpen },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ label: name, to, icon: Icon, end }) => (
            <SidebarMenuItem key={to}>
              <NavLink to={to} end={end}>
                {({ isActive }) => (
                  <SidebarMenuButton isActive={isActive}>
                    <Icon className="size-4" />
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

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-lg font-bold tracking-tight">Fairdrop</span>
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

      <SidebarFooter>
        <NavGroup label="Resources" items={RESOURCES} />
      </SidebarFooter>
    </Sidebar>
  );
}
