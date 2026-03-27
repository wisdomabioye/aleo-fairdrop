import { Progress } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionType } from '@fairdrop/types/domain';
import type { PricePanelProps } from './types';

export function RaisePricePanel({ auction }: PricePanelProps) {
  const target    = auction.params.type === AuctionType.Raise ? BigInt(auction.params.raise_target) : 0n;
  const committed = BigInt(auction.totalCommitted);
  const raisePct = target > 0n
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
          <Progress value={raisePct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatMicrocredits(committed)} raised</span>
            <span>{raisePct.toFixed(1)}%</span>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Tokens distributed pro-rata if the raise target is met by end block.
      </p>
    </div>
  );
}
