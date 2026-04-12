import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricePanelProps } from './types';

export function LbpPricePanel({ /* auction, */ currentPrice }: PricePanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Current price</span>
        <span className="text-xl font-semibold text-green-600 dark:text-green-400">
          {currentPrice ? formatMicrocredits(currentPrice) : '—'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Price shifts as token weight decays. Later participation favours price discovery.
      </p>
    </div>
  );
}
