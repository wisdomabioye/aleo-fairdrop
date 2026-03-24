import { Input, Label, TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricingStepProps, QuadraticPricingValues } from './types';

export function QuadraticPricingStep({ value, onChange }: PricingStepProps<QuadraticPricingValues>) {
  const set = (k: keyof QuadraticPricingValues) =>
    (v: string) => onChange({ ...value, [k]: v });

  const matchingMicro = parseTokenAmount(value.matchingPool, 6);
  const capMicro      = parseTokenAmount(value.contributionCap, 6);
  const offset        = parseInt(value.matchingDeadlineOffset) || 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quadratic funding: contribution weight = √(amount). Smaller contributors
        receive proportionally more influence. An optional matching pool amplifies
        community support.
      </p>
      <TokenAmountInput
        label="Matching pool" value={value.matchingPool}
        onChange={set('matchingPool')} decimals={6} symbol="ALEO"
        placeholder="1000"
        hint="Credits you contribute to match community bids. 0 = no matching."
      />
      <TokenAmountInput
        label="Contribution cap" value={value.contributionCap}
        onChange={set('contributionCap')} decimals={6} symbol="ALEO"
        placeholder="0"
        hint="Max credits any single bidder can contribute. 0 = unlimited."
      />
      <div className="space-y-1.5">
        <Label>Matching deadline (blocks from start)</Label>
        <Input
          inputMode="numeric" value={value.matchingDeadlineOffset}
          onChange={(e) => set('matchingDeadlineOffset')(e.target.value.replace(/\D/g, ''))}
          placeholder="5000"
        />
        <p className="text-xs text-muted-foreground">
          Block offset after start_block when the matching pool is locked.
          {offset > 0 && ` (~${Math.round(offset * 10 / 60)} min from start)`}
        </p>
      </div>
      {matchingMicro > 0n && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <div>
            You will deposit{' '}
            <strong className="text-foreground">{formatMicrocredits(matchingMicro)}</strong>
            {' '}as matching funds at auction creation.
          </div>
          {capMicro > 0n && (
            <div>
              Max per contributor:{' '}
              <strong className="text-foreground">{formatMicrocredits(capMicro)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
