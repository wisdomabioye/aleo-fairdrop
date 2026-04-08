import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { computeDutchPriceAt } from '@fairdrop/sdk/price';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';

export function SealedSimulator({ auction }: { auction: AuctionView }) {
  const [commit, setCommit] = useState('');
  const { data: currentBlock = 0 } = useBlockHeight();

  if (auction.params.type !== AuctionType.Sealed) return null;

  // Past commit phase — reveal window is open, clearing price is now set on-chain
  if (currentBlock >= auction.params.commit_end_block) {
    return (
      <p className="text-xs text-muted-foreground">
        Commit phase has ended (block {auction.params.commit_end_block.toLocaleString()}).
        The clearing price is now set — reveal your bid to claim.
      </p>
    );
  }

  const params        = auction.params;
  // Clearing price is deterministic: Dutch price at commit_end_block
  const clearingPrice = computeDutchPriceAt(params, auction.startBlock, params.commit_end_block);
  const commitMicro   = BigInt(Math.floor(Number(commit || 0) * 1_000_000));
  const estimated     = clearingPrice > 0n ? commitMicro / clearingPrice : 0n;
  const cappedByMax   = BigInt(auction.maxBidAmount) > 0n && estimated > BigInt(auction.maxBidAmount)
    ? BigInt(auction.maxBidAmount)
    : estimated;

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Commit amount (ALEO)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          placeholder="e.g. 50"
          value={commit}
          onChange={(e) => setCommit(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {commitMicro > 0n && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Projected clearing price</span>
            <span className="font-medium">{formatMicrocredits(clearingPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated allocation</span>
            <span className="font-medium">{cappedByMax.toLocaleString()} tokens</span>
          </div>
          {auction.maxBidAmount > 0n && estimated > auction.maxBidAmount && (
            <p className="text-[11px] text-amber-500">
              Capped at per-bidder max ({auction.maxBidAmount.toLocaleString()} tokens).
              Excess commit is refunded.
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Clearing price is the Dutch price at block {params.commit_end_block.toLocaleString()} —
        deterministic from auction config. Allocation subject to supply availability.
      </p>
    </div>
  );
}
