import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster, SidebarProvider, SidebarInset, SidebarTrigger } from '@fairdrop/ui';
import { AppSidebar } from '@/shared/components/layout/AppSidebar';
import { TopBar } from '@/shared/components/layout/TopBar';
import { TxStatusStepper } from '@/shared/components/layout/TxStatusStepper';
import { ErrorBoundary } from '@/shared/components/layout/ErrorBoundary';
import { ConnectButton } from '@/shared/components/wallet/ConnectButton';
import { routes } from '@/config';
import { CreateAuctionPage } from '@/features/auctions/pages/CreateAuctionPage';
import { EarningsPage }      from '@/features/earnings/pages/EarningsPage';
import { ClaimPage }         from '@/features/claim/pages/ClaimPage';
import { ReferralPage }      from '@/features/referral/pages/ReferralPage';
import { VestingPage }       from '@/features/vesting/pages/VestingPage';
import { GatePage }          from '@/features/gate/pages/GatePage';

// ── Placeholder pages (replaced by feature pages in Phase 2+) ────────────────
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      {name} — coming soon
    </div>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

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

// ── App ──────────────────────────────────────────────────────────────────────

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index                           element={<Placeholder name="Dashboard" />} />
          <Route path={routes.auctions}          element={<Placeholder name="Auctions" />} />
          <Route path={routes.auctionDetail}     element={<Placeholder name="Auction Detail" />} />
          <Route path={routes.createAuction}     element={<CreateAuctionPage />} />
          <Route path={routes.myAuctions}        element={<Placeholder name="My Auctions" />} />
          <Route path={routes.myBids}            element={<Placeholder name="My Bids" />} />
          <Route path={routes.claim}             element={<ClaimPage />} />
          <Route path={routes.earnings}          element={<EarningsPage />} />
          <Route path={routes.referral}          element={<ReferralPage />} />
          <Route path={routes.vesting}           element={<VestingPage />} />
          <Route path={routes.gate}              element={<GatePage />} />
          <Route path={routes.tokenLaunch}       element={<Placeholder name="Token Launch" />} />
          <Route path={routes.tokenManager}      element={<Placeholder name="Token Manager" />} />
          <Route path={routes.admin}             element={<Placeholder name="Admin" />} />
          <Route path={routes.guide}             element={<Placeholder name="Guide" />} />
          <Route path="*"                        element={<Placeholder name="404 — Not Found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
