import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { computeDutchPriceAt } from '@fairdrop/sdk/price';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';

export function DutchSimulator({ auction }: { auction: AuctionView }) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const [budget, setBudget] = useState('');
  const [quantity, setQuantity] = useState('');

  if (auction.params.type !== AuctionType.Dutch) return null;

  const params      = auction.params;
  const budgetMicro = BigInt(Math.floor(Number(budget || 0) * 1_000_000));
  const desiredQty  = BigInt(Math.max(0, Math.floor(Number(quantity || 0))));

  // Mode 1: budget → tokens at current price
  const currentPrice = computeDutchPriceAt(params, auction.startBlock, currentBlock);
  const tokensNow    = currentPrice > 0n ? budgetMicro / currentPrice : 0n;

  // Mode 2: timing — at what block can I get desiredQty tokens within budget?
  //   max_price  = budget / quantity
  //   bid_block  = start_block + floor((start_price - max_price) / decay_amount) × decay_blocks
  let timingBlock: number | null = null;
  let timingPrice: bigint | null = null;

  if (budgetMicro > 0n && desiredQty > 0n) {
    const maxAffordablePrice = budgetMicro / desiredQty;
    const startPrice   = BigInt(params.start_price);
    const floorPrice   = BigInt(params.floor_price);
    const decayAmount  = BigInt(params.price_decay_amount);
    const decayBlocks  = BigInt(params.price_decay_blocks);

    if (maxAffordablePrice >= floorPrice && maxAffordablePrice < startPrice && decayAmount > 0n) {
      const stepsNeeded = (startPrice - maxAffordablePrice) / decayAmount;
      timingBlock = auction.startBlock + Number(stepsNeeded * decayBlocks);
      timingPrice = startPrice - stepsNeeded * decayAmount;
      if (timingPrice < floorPrice) timingPrice = floorPrice;
    } else if (maxAffordablePrice >= startPrice) {
      // Can afford right now at start price
      timingBlock = auction.startBlock;
      timingPrice = startPrice;
    }
  }

  const blocksAway = timingBlock != null ? Math.max(0, timingBlock - currentBlock) : null;

  return (
    <div className="space-y-3 text-sm">
      {/* Mode 1: budget → tokens */}
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
            <span className="text-muted-foreground">Tokens if you bid now</span>
            <span className="font-medium">{tokensNow.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Mode 2: timing calculator */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Target quantity (tokens) — optional, for timing estimate
        </label>
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 500"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {budgetMicro > 0n && desiredQty > 0n && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
          {timingBlock != null && timingPrice != null ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max affordable price</span>
                <span className="font-medium">{formatMicrocredits(budgetMicro / desiredQty)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bid at or after block</span>
                <span className="font-medium">#{timingBlock.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price at that block</span>
                <span className="font-medium">{formatMicrocredits(timingPrice)}</span>
              </div>
              {blocksAway !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Blocks from now</span>
                  <span className="font-medium">
                    {blocksAway === 0 ? 'Now' : `~${blocksAway.toLocaleString()}`}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-amber-500">
              Budget is insufficient for {desiredQty.toLocaleString()} tokens even at floor price.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
