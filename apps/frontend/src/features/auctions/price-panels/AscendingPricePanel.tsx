import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function AscendingPricePanel({ currentPrice }: PricePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Current price</span>
        <span className="text-xl font-semibold text-emerald-500">
          {currentPrice ? formatMicrocredits(currentPrice) : '—'}
        </span>
      </div>
    </div>
  );
}
