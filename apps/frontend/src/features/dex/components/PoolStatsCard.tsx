import { Card, CardContent, Skeleton } from '@/components';
import { formatAmount } from '@fairdrop/sdk/format';
import type { PoolState } from '@fairdrop/sdk/dex';
import type { TokenDisplay } from '@/config/well-known-tokens';
import { formatPoolPrice } from '../utils/format';

interface PoolStatsCardProps {
  pool:     PoolState | null;
  tokenA:   TokenDisplay | null;
  tokenB:   TokenDisplay | null;
  loading?: boolean;
}

export function PoolStatsCard({ pool, tokenA, tokenB, loading }: PoolStatsCardProps) {
  if (loading) {
    return (
      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-5 w-24 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!pool) return null;

  const decA = tokenA?.decimals ?? 6;
  const decB = tokenB?.decimals ?? 6;
  const symA = tokenA?.symbol ?? '?';
  const symB = tokenB?.symbol ?? '?';

  const stats = [
    { label: `Reserve ${symA}`, value: formatAmount(pool.reserveA, decA) },
    { label: `Reserve ${symB}`, value: formatAmount(pool.reserveB, decB) },
    { label: 'Fee',             value: `${(pool.feeBps / 100).toFixed(2)}%` },
    { label: 'Spot Price',      value: `1 ${symA} = ${formatPoolPrice(pool.reserveA, pool.reserveB, decA, decB)} ${symB}` },
    { label: 'LP Supply',       value: pool.lpSupply.toLocaleString() },
  ];

  return (
    <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
      <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {stats.map(({ label, value }) => (
          <div key={label} className="space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {label}
            </p>
            <p className="text-sm font-medium tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
