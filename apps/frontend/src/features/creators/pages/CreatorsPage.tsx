import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components';
import { truncateAddress } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { creatorsService } from '@/services/creators.service';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { creatorUrl } from '@/config';

export function CreatorsPage() {
  const { data, isLoading } = useQuery({
    queryKey:  ['top-creators'],
    queryFn:   () => creatorsService.list(20),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Top Creators</h1>
        <p className="text-sm text-muted-foreground">Ranked by filled auctions.</p>
      </div>

      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No creators yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {data.items.map((creator, i) => (
                <Link
                  key={creator.address}
                  to={creatorUrl(creator.address)}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {truncateAddress(creator.address)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {creator.filledAuctions} filled · {(creator.fillRate * 100).toFixed(0)}% fill rate ·{' '}
                      {formatMicrocredits(BigInt(creator.volumeMicrocredits))} raised
                    </p>
                  </div>
                  <CreatorBadge tier={creator.tier} size="md" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
