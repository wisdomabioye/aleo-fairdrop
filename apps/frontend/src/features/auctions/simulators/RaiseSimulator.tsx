import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { formatAmount } from '@fairdrop/sdk/format';
import type { AuctionView } from '@fairdrop/types/domain';

export function RaiseSimulator({ auction }: { auction: AuctionView }) {
  const [contribution, setContribution] = useState('');

  const decimals    = auction.saleTokenDecimals;
  const commitMicro = BigInt(Math.floor(Number(contribution || 0) * 1_000_000));
  const total       = BigInt(auction.totalPayments);
  const supply      = BigInt(auction.supply);

  const optimistic   = total + commitMicro > 0n ? supply * commitMicro / (total + commitMicro) : 0n;
  const conservative = (total * 3n / 2n) + commitMicro > 0n
    ? supply * commitMicro / ((total * 3n / 2n) + commitMicro)
    : 0n;

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your contribution (ALEO)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          placeholder="e.g. 200"
          value={contribution}
          onChange={(e) => setContribution(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {commitMicro > 0n && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current total raised</span>
            <span className="font-medium">{formatMicrocredits(total)}</span>
          </div>
          <div className="flex justify-between border-t border-border/40 pt-2">
            <span className="text-muted-foreground">Optimistic allocation</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {formatAmount(optimistic, decimals)} {auction.saleTokenSymbol ?? 'tokens'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Conservative (50% more bids)</span>
            <span className="font-medium">
              {formatAmount(conservative, decimals)} {auction.saleTokenSymbol ?? 'tokens'}
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Approximate — final allocation depends on total contributions at close.
      </p>
    </div>
  );
}
