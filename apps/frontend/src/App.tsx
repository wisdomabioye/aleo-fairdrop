import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster, SidebarProvider, SidebarInset, SidebarTrigger } from '@/components';
import { AppSidebar }       from '@/shared/components/layout/AppSidebar';
import { TopBar }           from '@/shared/components/layout/TopBar';
import { TxStatusStepper }  from '@/shared/components/layout/TxStatusStepper';
import { ErrorBoundary }    from '@/shared/components/layout/ErrorBoundary';
import { ConnectButton }    from '@/shared/components/wallet/ConnectButton';
import { AppRoutes }           from '@/config';

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
import { TokenLaunchPage }    from '@/features/token-manager/pages/TokenLaunchPage';
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
        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-5 lg:px-6">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
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
          <Route path={AppRoutes.auctions}           element={<AuctionListPage />} />
          <Route path={AppRoutes.auctionDetail}      element={<AuctionDetailPage />} />
          <Route path={AppRoutes.createAuction}      element={<CreateAuctionPage />} />

          {/* Creator / Bidder */}
          <Route path={AppRoutes.myAuctions}         element={<MyAuctionsPage />} />
          <Route path={AppRoutes.myBids}             element={<MyBidsPage />} />
          <Route path={AppRoutes.claim}              element={<ClaimPage />} />

          {/* Finance */}
          <Route path={AppRoutes.earnings}           element={<EarningsPage />} />
          <Route path={AppRoutes.referral}           element={<ReferralPage />} />
          <Route path={AppRoutes.vesting}            element={<VestingPage />} />

          {/* Gate */}
          <Route path={AppRoutes.gate}               element={<GatePage />} />

          {/* Tools */}
          <Route path={AppRoutes.shield}             element={<ShieldPage />} />
          <Route path={AppRoutes.tokenLaunch}        element={<TokenLaunchPage />} />
          <Route path={AppRoutes.tokenManager}       element={<TokenManagerPage />} />

          {/* Admin & Guide */}
          <Route path={AppRoutes.admin}              element={<AdminPage />} />
          <Route path={AppRoutes.guide}              element={<Placeholder name="Guide" />} />

          <Route path="*"                         element={<Placeholder name="404 — Not Found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
