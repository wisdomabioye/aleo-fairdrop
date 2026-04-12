import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { AuctionView } from '@fairdrop/types/domain';

export function LbpSimulator({ auction }: { auction: AuctionView }) {
  const [budget, setBudget] = useState('');
  const currentPrice = BigInt(auction.currentPrice ?? 0n);
  const budgetMicro  = BigInt(Math.floor(Number(budget || 0) * 1_000_000));
  const tokensNow    = currentPrice > 0n ? budgetMicro / currentPrice : 0n;

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your budget (ALEO)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          placeholder="e.g. 100"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {budgetMicro > 0n && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current price</span>
            <span className="font-medium">{formatMicrocredits(currentPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tokens at current price</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              ~{tokensNow.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        LBP price decreases as supply fills — waiting may yield more tokens for the same budget.
      </p>
    </div>
  );
}
