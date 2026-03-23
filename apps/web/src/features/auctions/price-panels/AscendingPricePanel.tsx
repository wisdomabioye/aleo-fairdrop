import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function AscendingPricePanel({ auction, currentPrice }: PricePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Current price</span>
        <span className="text-xl font-semibold text-emerald-500">
          {currentPrice ? formatMicrocredits(currentPrice) : '—'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Price rises with each block step. Early bidders pay less — no refund at claim.
      </p>
    </div>
  );
}
