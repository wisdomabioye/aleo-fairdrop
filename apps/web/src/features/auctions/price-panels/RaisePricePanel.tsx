import { Progress } from '@fairdrop/ui';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function RaisePricePanel({ auction }: PricePanelProps) {
  const target    = auction.raiseTarget ?? 0n;
  const committed = auction.totalCommitted;
  const pct       = target > 0n
    ? Math.min(100, Number((committed * 100n) / target))
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Raise target</span>
        <span className="text-xl font-semibold">
          {target > 0n ? formatMicrocredits(target) : '—'}
        </span>
      </div>
      {target > 0n && (
        <>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatMicrocredits(committed)} raised</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Tokens distributed pro-rata if the raise target is met by end block.
      </p>
    </div>
  );
}
