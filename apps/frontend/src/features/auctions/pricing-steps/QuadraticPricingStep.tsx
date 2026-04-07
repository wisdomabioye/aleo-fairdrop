import { TokenAmountInput } from '@/components';
import type { PricingStepProps, QuadraticPricingValues } from './types';

export function QuadraticPricingStep({ value, onChange }: PricingStepProps<QuadraticPricingValues>) {
  const fillPct = Number(value.fillMinBps);
  const fillError = value.fillMinBpsEnabled && value.fillMinBps
    ? (isNaN(fillPct) || fillPct <= 0 || fillPct > 100 ? 'Must be between 1 and 100.' : null)
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Allocation is proportional to √(payment). A bidder with 100× your budget receives
        only 10× your tokens — anti-whale by design. The auction clears only if total
        payments reach the raise target.
      </p>
      <p className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-3 py-2">
        your_tokens = supply × √(your_payment) / Σ√(all_payments)
      </p>

      <TokenAmountInput
        label="Raise target" value={value.raiseTarget}
        onChange={(v) => onChange({ ...value, raiseTarget: v })}
        decimals={6} symbol="ALEO"
        placeholder="10000"
        hint="Minimum total credits for the auction to clear. If not reached, all bidders are refunded."
      />

      {/* Minimum fill threshold */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.fillMinBpsEnabled}
            onChange={(e) => onChange({ ...value, fillMinBpsEnabled: e.target.checked, fillMinBps: e.target.checked ? value.fillMinBps || '70' : '' })}
            className="rounded"
          />
          Enable minimum fill threshold
        </label>
        {value.fillMinBpsEnabled && (
          <div className="pl-6 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max="100" step="1"
                value={value.fillMinBps}
                onChange={(e) => onChange({ ...value, fillMinBps: e.target.value })}
                className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                placeholder="70"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            {fillError && <p className="text-xs text-destructive">{fillError}</p>}
            <p className="text-xs text-muted-foreground">
              If contributions reach {value.fillMinBps || '?'}% of the target, the auction succeeds
              and tokens distribute pro-rata. Below {value.fillMinBps || '?'}%, all bidders receive
              a full refund.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
