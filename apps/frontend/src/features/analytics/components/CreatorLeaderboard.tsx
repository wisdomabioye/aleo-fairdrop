import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { truncateAddress } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { creatorsService } from '@/services/creators.service';
import { creatorUrl } from '@/config';

type SortKey = 'fillRate' | 'volume' | 'auctionsRun' | 'bidCount';

interface CreatorLeaderboardProps {
  sort: SortKey;
}

export function CreatorLeaderboard({ sort }: CreatorLeaderboardProps) {
  const { data, isLoading } = useQuery({
    queryKey:  ['top-creators-analytics', sort],
    queryFn:   () => creatorsService.list(20, sort),
    staleTime: 5 * 60_000,
  });

  const items = data?.items ?? [];

  return (
    <div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No creators yet.</p>
      ) : (
        <div className="divide-y divide-border/30 rounded-xl border border-border/60 bg-gradient-surface overflow-hidden">
          {items.map((creator, idx) => (
            <Link
              key={creator.address}
              to={creatorUrl(creator.address)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
            >
              {/* Rank */}
              <span className="w-5 shrink-0 text-center text-[11px] font-medium tabular-nums text-muted-foreground/60">
                {idx + 1}
              </span>

              <CreatorBadge tier={creator.tier} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {truncateAddress(creator.address)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {creator.filledAuctions}/{creator.auctionsRun} filled
                  {' · '}
                  {Math.round(creator.fillRate * 100)}% fill rate
                </p>
              </div>

              {/* Sort-relevant stat highlighted */}
              <div className="shrink-0 text-right">
                {sort === 'volume' && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {formatMicrocredits(BigInt(creator.volumeMicrocredits))}
                  </span>
                )}
                {sort === 'fillRate' && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {Math.round(creator.fillRate * 100)}%
                  </span>
                )}
                {sort === 'auctionsRun' && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {creator.auctionsRun} runs
                  </span>
                )}
                {sort === 'bidCount' && (
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {creator.auctionsRun} auctions
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

