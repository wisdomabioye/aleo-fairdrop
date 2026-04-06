import { TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import type { PricingStepProps, LbpPricingValues } from './types';

export function LbpPricingStep({ value, onChange }: PricingStepProps<LbpPricingValues>) {
  const set = (k: keyof LbpPricingValues) =>
    (v: string) => onChange({ ...value, [k]: v });

  const startMicro = parseTokenAmount(value.startPrice, 6);
  const floorMicro = parseTokenAmount(value.floorPrice, 6);

  const floorErr =
    floorMicro > 0n && startMicro > 0n && floorMicro >= startMicro
      ? 'Floor price must be less than start price.'
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Price is driven by both remaining supply and remaining time. High demand slows
        the price descent; low demand accelerates it. No oracle or liquidity pool required.
      </p>
      <p className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-3 py-2">
        price = floor + (start − floor) × (remaining / supply) × (time_left / duration)
      </p>

      <div className="grid grid-cols-2 gap-4">
        <TokenAmountInput
          label="Start price" value={value.startPrice}
          onChange={set('startPrice')} decimals={6} symbol="ALEO"
          placeholder="1.0"
          hint="Maximum price per token — when supply is full and the auction just opened."
        />
        <TokenAmountInput
          label="Floor price" value={value.floorPrice}
          onChange={set('floorPrice')} decimals={6} symbol="ALEO"
          placeholder="0.1"
          hint="Minimum price per token — price will never drop below this."
          error={floorErr ?? undefined}
        />
      </div>
    </div>
  );
}
