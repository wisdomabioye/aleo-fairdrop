import { TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricingStepProps, RaisePricingValues } from './types';

export function RaisePricingStep({ value, onChange, supply, saleTokenDecimals }: PricingStepProps<RaisePricingValues>) {
  const targetMicro = parseTokenAmount(value.raiseTarget, 6);

  // Mirrors the contract formula: clearing_price = raise_target * sale_scale / supply
  const saleScale = 10n ** BigInt(saleTokenDecimals ?? 6);
  const humanSupply = supply != null && saleScale > 0n ? supply / saleScale : null;
  const impliedPrice = humanSupply != null && humanSupply > 0n && targetMicro > 0n
    ? targetMicro / humanSupply
    : null;

  const targetError = value.raiseTarget && targetMicro <= 0n ? 'Required, must be > 0.' : null;

  const fillPct = Number(value.fillMinBps);
  const fillError = value.fillMinBpsEnabled && value.fillMinBps
    ? (isNaN(fillPct) || fillPct <= 0 || fillPct > 100 ? 'Must be between 1 and 100.' : null)
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
        error={targetError ?? undefined}
      />
      {targetMicro > 0n && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <div>Raise target: <strong className="text-foreground">{formatMicrocredits(targetMicro)}</strong></div>
          {impliedPrice != null && (
            <div>
              Implied price per token:{' '}
              <strong className="text-foreground">{formatMicrocredits(impliedPrice)}</strong>
              {' '}(raise target ÷ token supply)
            </div>
          )}
        </div>
      )}

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
