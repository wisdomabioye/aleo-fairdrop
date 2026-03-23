import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function DutchPricePanel({ auction, currentPrice }: PricePanelProps) {
  const clearingPrice = auction.clearingPrice;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">
          {clearingPrice ? 'Clearing price' : 'Current price'}
        </span>
        <span className="text-xl font-semibold">
          {clearingPrice
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
