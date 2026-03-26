import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function DutchPricePanel({ auction }: PricePanelProps) {
  const clearingPrice = BigInt(auction.clearingPrice ?? 0)
  const currentPrice = BigInt(auction.currentPrice ?? 0)
  const isClearing = clearingPrice > 0n;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">
          {isClearing ? 'Clearing price' : 'Current price'}
        </span>
        <span className="text-xl font-semibold">
          {isClearing
            ? formatMicrocredits(clearingPrice)
            : currentPrice
              ? formatMicrocredits(currentPrice)
              : '—'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {clearingPrice
          ? 'Auction closed — all winners pay this uniform price.'
          : 'Price steps down at fixed intervals until supply is met or the auction ends.'}
      </p>
    </div>
  );
}
