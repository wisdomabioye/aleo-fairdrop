import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components';
import { truncateAddress } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { creatorsService } from '@/services/creators.service';
import { CreatorBadge } from '@/features/auctions/components/CreatorBadge';
import { creatorUrl } from '@/config';
import { cn } from '@/lib/utils';

const RANK_STYLES: Record<number, string> = {
  1: 'text-yellow-500 dark:text-yellow-300 font-bold',
  2: 'text-slate-400 dark:text-slate-300 font-bold',
  3: 'text-amber-600 dark:text-amber-400 font-bold',
};

export function CreatorsPage() {
  const { data, isLoading } = useQuery({
    queryKey:  ['top-creators', 20],
    queryFn:   () => creatorsService.list(20),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Top Creators</h1>
        <p className="text-sm text-muted-foreground">Ranked by fill rate across all auctions.</p>
      </div>

      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {isLoading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No creators yet.</p>
          ) : (
            <div>
              <div className="grid grid-cols-[2rem_1fr_4rem_4rem_5.5rem_2.5rem] items-center gap-x-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                <span className="text-right">#</span>
                <span>Creator</span>
                <span className="text-right">Filled</span>
                <span className="text-right">Fill %</span>
                <span className="text-right">Raised</span>
                <span />
              </div>

              <div className="divide-y divide-border/40">
                {data.items.map((creator, i) => {
                  const rank = i + 1;
                  return (
                    <Link
                      key={creator.address}
                      to={creatorUrl(creator.address)}
                      className="grid grid-cols-[2rem_1fr_4rem_4rem_5.5rem_2.5rem] items-center gap-x-2 px-4 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <span className={cn('text-right text-xs', RANK_STYLES[rank] ?? 'text-muted-foreground')}>
                        {rank}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {truncateAddress(creator.address)}
                      </span>
                      <span className="text-right text-xs tabular-nums text-foreground">
                        {creator.filledAuctions}/{creator.auctionsRun}
                      </span>
                      <span className="text-right text-xs tabular-nums text-foreground">
                        {(creator.fillRate * 100).toFixed(0)}%
                      </span>
                      <span className="text-right text-xs tabular-nums text-muted-foreground">
                        {formatMicrocredits(BigInt(creator.volumeMicrocredits))}
                      </span>
                      <span className="flex justify-end">
                        <CreatorBadge tier={creator.tier} size="sm" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
