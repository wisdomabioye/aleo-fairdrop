import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

/** Sealed: shown only after close_auction when clearing price is finalised. */
export function SealedPricePanel({ auction }: PricePanelProps) {
  const clearingPrice = BigInt(auction.clearingPrice ?? 0);
  if (clearingPrice <= 0n) return null;

  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">Clearing price</span>
      <span className="text-xl font-semibold">{formatMicrocredits(clearingPrice)}</span>
    </div>
  );
}
