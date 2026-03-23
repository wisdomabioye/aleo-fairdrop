import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

/** Sealed: Dutch price curve used for reference; clearing price shown after close. */
export function SealedPricePanel({ auction, currentPrice }: PricePanelProps) {
  const clearingPrice = auction.clearingPrice;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">
          {clearingPrice ? 'Clearing price' : 'Reference price'}
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
          ? 'Uniform clearing price — all revealed bids pay this amount.'
          : 'The clearing price will be the Dutch price at commit-phase close.'}
      </p>
    </div>
  );
}
