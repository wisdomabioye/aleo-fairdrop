import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { truncateAddress } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { creatorsService } from '@/services/creators.service';
import { creatorUrl, AppRoutes } from '@/config';

export function TopCreatorsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['top-creators', 5],
    queryFn:  () => creatorsService.list(5),
    staleTime: 60_000,
  });

  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No creators yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((creator) => (
        <Link
          key={creator.address}
          to={creatorUrl(creator.address)}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
        >
          <CreatorBadge tier={creator.tier} size="sm" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {truncateAddress(creator.address)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {creator.filledAuctions}/{creator.auctionsRun} filled
              {' · '}
              {formatMicrocredits(BigInt(creator.volumeMicrocredits))} vol
            </p>
          </div>

          <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
        </Link>
      ))}

      <div className="pt-1">
        <Link
          to={AppRoutes.creators}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          View all creators →
        </Link>
      </div>
    </div>
  );
}
