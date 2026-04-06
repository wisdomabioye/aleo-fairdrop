import { TokenAmountInput } from '@/components';
import type { PricingStepProps, QuadraticPricingValues } from './types';

export function QuadraticPricingStep({ value, onChange }: PricingStepProps<QuadraticPricingValues>) {
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
    </div>
  );
}
