import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatAmount } from '@fairdrop/sdk/format';
import { isqrt } from '@fairdrop/sdk/price';
import type { AuctionView } from '@fairdrop/types/domain';

export function QuadraticSimulator({ auction }: { auction: AuctionView }) {
  const [contribution, setContribution] = useState('');

  if (!auction.sqrtWeight) {
    return (
      <p className="text-xs text-muted-foreground">
        Simulator available once the first bid is placed.
      </p>
    );
  }

  const decimals      = auction.saleTokenDecimals;
  const commitMicro   = BigInt(Math.floor(Number(contribution || 0) * 1_000_000));
  const totalWeight   = BigInt(auction.sqrtWeight);
  const myWeight      = isqrt(commitMicro);
  const supply        = BigInt(auction.supply);

  const optimistic   = totalWeight + myWeight > 0n
    ? supply * myWeight / (totalWeight + myWeight) : 0n;
  const conservative = (totalWeight * 3n / 2n) + myWeight > 0n
    ? supply * myWeight / ((totalWeight * 3n / 2n) + myWeight) : 0n;

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your contribution (ALEO)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          placeholder="e.g. 100"
          value={contribution}
          onChange={(e) => setContribution(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {commitMicro > 0n && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Your sqrt weight</span>
            <span className="font-medium">{myWeight.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current total weight</span>
            <span className="font-medium">{totalWeight.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-border/40 pt-2">
            <span className="text-muted-foreground">Optimistic allocation</span>
            <span className="font-medium text-rose-600 dark:text-rose-400">
              {formatAmount(optimistic, decimals)} {auction.saleTokenSymbol ?? 'tokens'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Conservative (50% more weight)</span>
            <span className="font-medium">
              {formatAmount(conservative, decimals)} {auction.saleTokenSymbol ?? 'tokens'}
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Approximate — final weight depends on all bids placed before close.
      </p>
    </div>
  );
}
