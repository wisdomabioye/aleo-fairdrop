import { Link } from 'react-router-dom';
import {
  Button,
  MetricCard,
  Skeleton,
} from '@fairdrop/ui';
import {
  Zap,
  Gavel,
  PlusCircle,
  Activity,
  BarChart3,
  Users,
  TrendingUp,
} from 'lucide-react';
import { AuctionStatus } from '@fairdrop/types/domain';
import { useAuctions }   from '@/features/auctions/hooks/useAuctions';
import { AuctionCard }   from '@/features/auctions/components/AuctionCard';
import { routes }        from '@/config';

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-background px-8 py-10">
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Zap className="size-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Fairdrop</h1>
          </div>
          <p className="max-w-md text-base text-muted-foreground">
            Privacy-preserving token launches on the Aleo network.
            Fair distribution, sealed bids, on-chain guarantees.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button asChild size="sm">
            <Link to={routes.auctions}>
              <Gavel className="mr-1.5 size-4" />
              Browse Auctions
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={routes.createAuction}>
              <PlusCircle className="mr-1.5 size-4" />
              Create Auction
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── StatsRow ──────────────────────────────────────────────────────────────────

function StatsRow() {
  const { data: active, isLoading: loadingActive } = useAuctions({
    status: AuctionStatus.Active, pageSize: 1,
  });
  const { data: all, isLoading: loadingAll } = useAuctions({
    pageSize: 1,
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Active Auctions"
        value={loadingActive ? '—' : (active?.total ?? 0)}
        icon={<Activity className="size-4" />}
        loading={loadingActive}
        hint="Live right now"
      />
      <MetricCard
        label="Total Auctions"
        value={loadingAll ? '—' : (all?.total ?? 0)}
        icon={<BarChart3 className="size-4" />}
        loading={loadingAll}
        hint="All time"
      />
      <MetricCard
        label="Auction Types"
        value="6"
        icon={<TrendingUp className="size-4" />}
        hint="Dutch · Sealed · Raise · Ascending · LBP · Quadratic"
      />
      <MetricCard
        label="Network"
        value="Aleo"
        icon={<Users className="size-4" />}
        hint="Privacy-first L1"
      />
    </div>
  );
}

// ── LiveAuctions ──────────────────────────────────────────────────────────────

function LiveAuctions() {
  const { data, isLoading } = useAuctions({
    status:   AuctionStatus.Active,
    sort:     'created',
    order:    'desc',
    pageSize: 6,
  });

  const items = data?.items ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live Auctions</h2>
          <p className="text-sm text-muted-foreground">Currently accepting bids</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={routes.auctions}>View all →</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
          <Gavel className="size-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No live auctions yet</p>
            <p className="text-xs text-muted-foreground">
              Be the first — create an auction to get started.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={routes.createAuction}>
              <PlusCircle className="mr-1.5 size-4" />
              Create Auction
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((auction) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  return (
    <div className="space-y-8 p-6">
      <Hero />
      <StatsRow />
      <LiveAuctions />
    </div>
  );
}
