import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components';
import { truncateAddress } from '@fairdrop/sdk/format';
import { AppRoutes } from '@/config';
import { useCreatorReputation } from '@/features/auctions/hooks/useCreatorReputation';
import { useAuctions } from '@/features/auctions/hooks/useAuctions';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { AuctionCard } from '@/features/auctions/components/AuctionCard';

export function CreatorPage() {
  const { address } = useParams<{ address: string }>();

  if (!address) {
    return (
      <div className="p-4">
        <p className="text-sm text-destructive">Invalid creator address.</p>
        <Link to={AppRoutes.creators} className="text-sm text-muted-foreground underline underline-offset-4">
          Back to creators
        </Link>
      </div>
    );
  }

  return <CreatorContent address={address} />;
}

function CreatorContent({ address }: { address: string }) {
  const { data: rep, isLoading: repLoading } = useCreatorReputation(address);
  const { data: auctionsPage, isLoading: auctionsLoading } = useAuctions({ creator: address, pageSize: 50 });
  const auctions = auctionsPage?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={AppRoutes.creators} className="hover:text-foreground">Creators</Link>
        <span>/</span>
        <span className="truncate text-foreground">{truncateAddress(address)}</span>
      </div>

      {/* Reputation card */}
      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            {truncateAddress(address)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {repLoading ? (
            <Skeleton className="h-28 w-full rounded-lg" />
          ) : rep && rep.tier !== 'none' ? (
            <CreatorBadge tier={rep.tier} stats={rep} size="lg" />
          ) : rep ? (
            <p className="text-sm text-muted-foreground">
              {rep.auctionsRun} auction{rep.auctionsRun !== 1 ? 's' : ''} run, none filled yet.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No on-chain reputation yet — no closed auctions recorded.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Auction history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Auctions by this creator</h2>
        {auctionsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : auctions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No auctions found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
