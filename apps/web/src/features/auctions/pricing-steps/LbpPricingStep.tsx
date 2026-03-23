import { Input, Label, TokenAmountInput } from '@fairdrop/ui';
import type { PricingStepProps, LbpPricingValues } from './types';

function bpsToPercent(bps: string): string {
  const n = parseInt(bps) || 0;
  return (n / 100).toFixed(n % 100 === 0 ? 0 : 2);
}

export function LbpPricingStep({ value, onChange }: PricingStepProps<LbpPricingValues>) {
  const set = (k: keyof LbpPricingValues) =>
    (v: string) => onChange({ ...value, [k]: v });

  const intField = (k: 'startWeight' | 'endWeight' | 'swapFeeBps') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k)(e.target.value.replace(/\D/g, ''));

  const startWt = parseInt(value.startWeight) || 0;
  const endWt   = parseInt(value.endWeight)   || 0;
  const feeBps  = parseInt(value.swapFeeBps)  || 0;

  const weightWarning = startWt > 0 && endWt > 0 && startWt <= endWt;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Token weight shifts from <code className="text-xs">start_weight</code> to{' '}
        <code className="text-xs">end_weight</code> over the auction duration,
        driving price naturally downward and discouraging front-running bots.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Start weight (bps)</Label>
          <Input
            inputMode="numeric" value={value.startWeight}
            onChange={intField('startWeight')} placeholder="9000"
          />
          <p className="text-xs text-muted-foreground">
            {startWt > 0 ? `${bpsToPercent(value.startWeight)}% sale token — high initial weight → high starting price.` : 'e.g. 9000 = 90%'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>End weight (bps)</Label>
          <Input
            inputMode="numeric" value={value.endWeight}
            onChange={intField('endWeight')} placeholder="1000"
          />
          <p className="text-xs text-muted-foreground">
            {endWt > 0 ? `${bpsToPercent(value.endWeight)}% sale token — low final weight → lower ending price.` : 'e.g. 1000 = 10%'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Swap fee (bps)</Label>
          <Input
            inputMode="numeric" value={value.swapFeeBps}
            onChange={intField('swapFeeBps')} placeholder="30"
          />
          <p className="text-xs text-muted-foreground">
            {feeBps > 0 ? `${bpsToPercent(value.swapFeeBps)}% fee per swap.` : 'e.g. 30 = 0.3%'}
          </p>
        </div>
        <TokenAmountInput
          label="Initial price" value={value.initialPrice}
          onChange={set('initialPrice')} decimals={6} symbol="ALEO"
          placeholder="1.0" hint="Starting price per token."
        />
      </div>
      {weightWarning && (
        <p className="text-xs text-destructive">
          Start weight should be greater than end weight for a downward price curve.
        </p>
      )}
    </div>
  );
}
