import { Link } from 'react-router-dom';
import { Button, Skeleton } from '@/components';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Gavel, PlusCircle } from 'lucide-react';
import fairdropLogo from '@/assets/fairdrop.svg';
import { AuctionStatus } from '@fairdrop/types/domain';
import { useAuctions } from '@/features/auctions/hooks/useAuctions';
import { AuctionCard } from '@/features/auctions/components/AuctionCard';
import { AuctionTypeBreakdown } from '../components/AuctionTypeBreakdown';
import { TopCreatorsList } from '../components/TopCreatorsList';
import { useDashboardStats } from '@/shared/hooks/useDashboardStats';
import { AppRoutes } from '@/config';
import { cn } from '@/lib/utils';

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="overflow-hidden rounded-xl border border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/12 bg-white/90 p-2 shadow-xs dark:bg-white/10">
            <img src={fairdropLogo} alt="Fairdrop" className="size-full object-contain" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="h-5 rounded-full border-sky-500/14 bg-sky-500/8 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
              >
                Aleo
              </Badge>
              <Badge
                variant="outline"
                className="h-5 rounded-full border-border bg-background/70 px-1.5 text-[10px] font-medium text-muted-foreground"
              >
                Sealed bids
              </Badge>
            </div>

            <p className="mt-1 truncate text-sm font-medium text-foreground">
              Privacy-preserving token launches and capital formation on Aleo.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button asChild size="sm" className="h-8 rounded-lg px-3">
            <Link to={AppRoutes.auctions}>
              <Gavel className="mr-1.5 size-3.5" />
              Browse
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-8 rounded-lg px-3">
            <Link to={AppRoutes.createAuction}>
              <PlusCircle className="mr-1.5 size-3.5" />
              Create Auction
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── LiveAuctions ──────────────────────────────────────────────────────────────

function LiveAuctions() {
  const { data, isLoading } = useAuctions({
    status: AuctionStatus.Active,
    sort: 'created',
    order: 'desc',
    pageSize: 6,
  });

  const items = data?.items ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Live Auctions
          </h2>
          <p className="text-xs text-muted-foreground">
            Currently accepting bids
          </p>
        </div>

        <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg px-2.5">
          <Link to={AppRoutes.auctions}>
            View all
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-500/12 bg-gradient-surface px-4 py-8 text-center shadow-xs ring-1 ring-white/5">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-sky-500/10 bg-sky-500/8 text-sky-500 dark:text-sky-300">
            <Gavel className="size-4.5" />
          </div>

          <p className="mt-3 text-sm font-medium text-foreground">
            No live auctions yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create the first auction to get started.
          </p>

          <div className="mt-4">
            <Button asChild size="sm" variant="outline" className="h-8 rounded-lg px-3">
              <Link to={AppRoutes.createAuction}>
                <PlusCircle className="mr-1.5 size-3.5" />
                Create Auction
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((auction) => (
            <div
              key={auction.id}
              className={cn(
                'rounded-xl border border-transparent transition-[transform,border-color] hover:border-sky-500/10 hover:-translate-y-0.5'
              )}
            >
              <AuctionCard auction={auction} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── AnalyticsRow ──────────────────────────────────────────────────────────────

function AnalyticsRow() {
  const { data, isLoading } = useDashboardStats();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Auctions by type
          </p>
          {isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 rounded-md" />
              ))}
            </div>
          ) : (
            <AuctionTypeBreakdown breakdown={data?.typeBreakdown ?? {}} />
          )}
        </CardContent>
      </Card>

      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top creators
          </p>
          <TopCreatorsList />
        </CardContent>
      </Card>
    </div>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  return (
    <div className="space-y-5 p-4 sm:p-5 lg:p-6">
      <Hero />
      <AnalyticsRow />
      <LiveAuctions />
    </div>
  );
}
