import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster, SidebarProvider, SidebarInset, SidebarTrigger } from '@fairdrop/ui';
import { AppSidebar }       from '@/shared/components/layout/AppSidebar';
import { TopBar }           from '@/shared/components/layout/TopBar';
import { TxStatusStepper }  from '@/shared/components/layout/TxStatusStepper';
import { ErrorBoundary }    from '@/shared/components/layout/ErrorBoundary';
import { ConnectButton }    from '@/shared/components/wallet/ConnectButton';
import { routes }           from '@/config';

// ── Feature pages ─────────────────────────────────────────────────────────────

import { DashboardPage }      from '@/features/dashboard/pages/DashboardPage';
import { AuctionListPage }    from '@/features/auctions/pages/AuctionListPage';
import { AuctionDetailPage }  from '@/features/auctions/pages/AuctionDetailPage';
import { CreateAuctionPage }  from '@/features/auctions/pages/CreateAuctionPage';
import { MyAuctionsPage }     from '@/features/creator/pages/MyAuctionsPage';
import { MyBidsPage }         from '@/features/bids/pages/MyBidsPage';
import { ClaimPage }          from '@/features/claim/pages/ClaimPage';
import { EarningsPage }       from '@/features/earnings/pages/EarningsPage';
import { ReferralPage }       from '@/features/referral/pages/ReferralPage';
import { VestingPage }        from '@/features/vesting/pages/VestingPage';
import { GatePage }           from '@/features/gate/pages/GatePage';
import { ShieldPage }         from '@/features/shield/pages/ShieldPage';
import { TokenLaunchPage }    from '@/features/token-launch/pages/TokenLaunchPage';
import { TokenManagerPage }   from '@/features/token-manager/pages/TokenManagerPage';
import { AdminPage }          from '@/features/admin/pages/AdminPage';

// ── Placeholder (for routes not yet built) ────────────────────────────────────
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      {name} — coming soon
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar trigger={<SidebarTrigger />} actions={<ConnectButton />} />
        <main className="flex-1 overflow-auto p-4">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </SidebarInset>
      <TxStatusStepper />
      <Toaster />
    </SidebarProvider>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Overview */}
          <Route index                            element={<DashboardPage />} />

          {/* Auctions */}
          <Route path={routes.auctions}           element={<AuctionListPage />} />
          <Route path={routes.auctionDetail}      element={<AuctionDetailPage />} />
          <Route path={routes.createAuction}      element={<CreateAuctionPage />} />

          {/* Creator / Bidder */}
          <Route path={routes.myAuctions}         element={<MyAuctionsPage />} />
          <Route path={routes.myBids}             element={<MyBidsPage />} />
          <Route path={routes.claim}              element={<ClaimPage />} />

          {/* Finance */}
          <Route path={routes.earnings}           element={<EarningsPage />} />
          <Route path={routes.referral}           element={<ReferralPage />} />
          <Route path={routes.vesting}            element={<VestingPage />} />

          {/* Gate */}
          <Route path={routes.gate}               element={<GatePage />} />

          {/* Tools */}
          <Route path={routes.shield}             element={<ShieldPage />} />
          <Route path={routes.tokenLaunch}        element={<TokenLaunchPage />} />
          <Route path={routes.tokenManager}       element={<TokenManagerPage />} />

          {/* Admin & Guide */}
          <Route path={routes.admin}              element={<AdminPage />} />
          <Route path={routes.guide}              element={<Placeholder name="Guide" />} />

          <Route path="*"                         element={<Placeholder name="404 — Not Found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
