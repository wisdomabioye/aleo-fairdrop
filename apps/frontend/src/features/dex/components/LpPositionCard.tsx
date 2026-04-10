import { useMemo } from 'react';
import { Card, CardContent, Skeleton } from '@/components';
import { computePoolKey } from '@fairdrop/sdk/dex';
import type { PoolState } from '@fairdrop/sdk/dex';
import type { TokenDisplay } from '@/config/well-known-tokens';
import { useLpBalance } from '../hooks/useLpBalance';

interface LpPositionCardProps {
  address: string;
  pool:    PoolState;
  tokenA:  TokenDisplay | null;
  tokenB:  TokenDisplay | null;
}

export function LpPositionCard({ address, pool, tokenA, tokenB }: LpPositionCardProps) {
  const poolKey = useMemo(() => {
    try { return computePoolKey(pool.tokenA, pool.tokenB); }
    catch { return null; }
  }, [pool.tokenA, pool.tokenB]);

  const { data: lpBalance, isLoading } = useLpBalance(address, poolKey);

  if (isLoading) {
    return (
      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="space-y-2 p-4">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-5 w-32 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!lpBalance || lpBalance === 0n) return null;

  const share = pool.lpSupply > 0n
    ? Number((lpBalance * 10_000n) / pool.lpSupply) / 100
    : 0;

  const symA = tokenA?.symbol ?? '?';
  const symB = tokenB?.symbol ?? '?';

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardContent className="space-y-2 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
          Your LP Position
        </p>
        <p className="text-sm font-medium tabular-nums text-foreground">
          {lpBalance.toLocaleString()} LP
        </p>
        <p className="text-xs text-muted-foreground">
          {share.toFixed(2)}% of {symA}/{symB} pool
        </p>
      </CardContent>
    </Card>
  );
}
