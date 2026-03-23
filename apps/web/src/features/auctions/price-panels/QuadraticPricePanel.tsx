import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function QuadraticPricePanel({ auction, currentPrice }: PricePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Price per vote</span>
        <span className="text-xl font-semibold">
          {currentPrice ? formatMicrocredits(currentPrice) : '—'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Fixed price per token. Quadratic weighting: your marginal influence diminishes with each
        additional vote — encouraging broad participation.
      </p>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Supply: {auction.supply.toLocaleString()}</span>
        <span>Committed: {auction.totalCommitted.toLocaleString()}</span>
      </div>
    </div>
  );
}
