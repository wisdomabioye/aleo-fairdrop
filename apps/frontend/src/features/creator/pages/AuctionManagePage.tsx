import { Link, useParams } from 'react-router-dom';
import { ChevronRight, ExternalLink, TriangleAlert } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  AuctionStatusBadge,
  CopyField,
} from '@/components';
import { AuctionStatus } from '@fairdrop/types/domain';
import { AppRoutes, auctionDetailUrl } from '@/config';
import { useAuction } from '@/features/auctions/hooks/useAuction';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { useCreatorWithdrawn } from '../hooks/useCreatorWithdrawn';
import { AuctionOverviewCard }  from '../components/AuctionOverviewCard';
import { AuctionSalesCard }     from '../components/AuctionSalesCard';
import { CreatorRevenueCard }   from '../components/CreatorRevenueCard';
import { CreatorActionsCard }   from '../components/CreatorActionsCard';
import { SeedLiquidityPanel }   from '../components/SeedLiquidityPanel';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function AuctionManageContent({ id }: { id: string }) {
  const { data: auction, isLoading, isError } = useAuction(id);
  const { data: blockHeight } = useBlockHeight();

  const isCleared = auction?.status === AuctionStatus.Cleared;
  const withdrawn = useCreatorWithdrawn(id, auction?.programId ?? '', isCleared && !!auction);

  if (isLoading) return <LoadingSkeleton />;

  if (isError || !auction) {
    return (
      <Card className="mx-auto max-w-md border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="space-y-2 p-4 text-center">
          <TriangleAlert className="mx-auto size-5 text-destructive" />
          <p className="text-sm text-destructive">Auction not found or failed to load.</p>
          <Link to={AppRoutes.myAuctions} className="text-sm text-muted-foreground underline underline-offset-4">
            Back to My Auctions
          </Link>
        </CardContent>
      </Card>
    );
  }

  const name = auction.metadata?.name ?? `${auction.id.slice(0, 20)}…`;

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to={AppRoutes.myAuctions} className="transition-colors hover:text-foreground">My Auctions</Link>
        <ChevronRight className="size-3" />
        <span className="truncate text-foreground">{name}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{name}</h1>
          <div className="flex">
            <div className="truncate font-mono text-xs text-muted-foreground">
              <CopyField
                value={auction.id}
                label="Auction Id"
                truncate
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AuctionStatusBadge status={auction.status} showIcon />
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to={auctionDetailUrl(auction.id)}>
              <ExternalLink className="mr-1.5 size-3.5" />
              View auction
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <AuctionOverviewCard auction={auction} blockHeight={blockHeight} />
          <AuctionSalesCard auction={auction} />
          {isCleared && (
            <CreatorRevenueCard
              auction={auction}
              paymentsWithdrawn={withdrawn.data?.paymentsWithdrawn ?? 0n}
              unsoldWithdrawn={withdrawn.data?.unsoldWithdrawn ?? 0n}
              loading={withdrawn.isLoading}
            />
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <CreatorActionsCard
            auction={auction}
            blockHeight={blockHeight}
            paymentsWithdrawn={withdrawn.data?.paymentsWithdrawn ?? 0n}
            unsoldWithdrawn={withdrawn.data?.unsoldWithdrawn ?? 0n}
            onWithdrawDone={() => void withdrawn.refetch()}
          />
          <SeedLiquidityPanel
            auction={auction}
            paymentsWithdrawn={withdrawn.data?.paymentsWithdrawn ?? 0n}
            unsoldWithdrawn={withdrawn.data?.unsoldWithdrawn ?? 0n}
          />
        </div>
      </div>
    </div>
  );
}

export function AuctionManagePage() {
  const { auctionId } = useParams<{ auctionId: string }>();

  if (!auctionId) {
    return (
      <div className="p-4">
        <Card className="mx-auto max-w-md border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
          <CardContent className="space-y-2 p-4 text-center">
            <p className="text-sm text-destructive">Invalid auction ID.</p>
            <Link to={AppRoutes.myAuctions} className="text-sm text-muted-foreground underline underline-offset-4">
              Back to My Auctions
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6">
      <AuctionManageContent id={auctionId} />
    </div>
  );
}
