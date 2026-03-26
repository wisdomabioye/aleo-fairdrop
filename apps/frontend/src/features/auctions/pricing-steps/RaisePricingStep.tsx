import { TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricingStepProps, RaisePricingValues } from './types';

export function RaisePricingStep({ value, onChange, supply }: PricingStepProps<RaisePricingValues>) {
  const targetMicro = parseTokenAmount(value.raiseTarget, 6);

  // Implied price per base token unit — only meaningful if sale token has 6 decimals.
  // Display as a rough guide; creator should verify against their token's decimals.
  const impliedPrice = supply != null && supply > 0n && targetMicro > 0n
    ? targetMicro / supply
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Fixed-price community raise — no price discovery. Bidders commit any
        amount; tokens are distributed pro-rata by payment when the target is
        met by end_block. The auction voids if the target is not reached.
      </p>
      <TokenAmountInput
        label="Raise target" value={value.raiseTarget}
        onChange={(v) => onChange({ ...value, raiseTarget: v })}
        decimals={6} symbol="ALEO" placeholder="10000"
        hint="Total credits required for the raise to succeed."
      />
      {targetMicro > 0n && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <div>Raise target: <strong className="text-foreground">{formatMicrocredits(targetMicro)}</strong></div>
          {impliedPrice != null && (
            <div>
              Implied price per token unit:{' '}
              <strong className="text-foreground">{formatMicrocredits(impliedPrice)}</strong>
              {' '}(raise target ÷ supply — assumes matching decimals)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
