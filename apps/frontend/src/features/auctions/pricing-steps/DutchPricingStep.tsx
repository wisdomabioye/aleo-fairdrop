import { Input, Label, TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { AuctionType } from '@fairdrop/types/domain';
import { buildCreateAuction } from '@fairdrop/sdk/transactions';
import type { CreateBase, TxSpec } from '@fairdrop/sdk/transactions';
import type { PricingStepProps, DutchPricingValues, AnyPricingValues } from './types';
import { ReviewRow } from '../wizard-steps/ReviewSection';

const mic = (v: string) => aleoToMicro(v) ?? 0n;
const blk = (v: string) => parseInt(v || '0');

export const defaultPricing: DutchPricingValues = {
  type: AuctionType.Dutch,
  startPrice: '', floorPrice: '', priceDecayBlocks: '100', priceDecayAmount: '',
};

export function PricingReviewRows({ pricing }: { pricing: DutchPricingValues }) {
  return (
    <>
      <ReviewRow label="Start price"  value={`${pricing.startPrice || '0'} ALEO`} />
      <ReviewRow label="Floor price"  value={`${pricing.floorPrice || '0'} ALEO`} />
      <ReviewRow label="Decay blocks" value={pricing.priceDecayBlocks || '0'} />
      <ReviewRow label="Decay amount" value={`${pricing.priceDecayAmount || '0'} ALEO`} />
    </>
  );
}

export function buildWizardInputs(pricing: AnyPricingValues, base: CreateBase): TxSpec {
  if (pricing.type !== AuctionType.Dutch) throw new Error(`buildWizardInputs[dutch]: got ${pricing.type}`);
  return buildCreateAuction({
    ...base, type: AuctionType.Dutch,
    startPrice:       mic(pricing.startPrice),
    floorPrice:       mic(pricing.floorPrice),
    priceDecayBlocks: blk(pricing.priceDecayBlocks),
    priceDecayAmount: mic(pricing.priceDecayAmount),
  });
}

export function DutchPricingStep({ value, onChange }: PricingStepProps<DutchPricingValues>) {
  const set = (k: keyof Omit<DutchPricingValues, 'type'>) =>
    (v: string) => onChange({ ...value, [k]: v });

  const startMicro  = parseTokenAmount(value.startPrice, 6);
  const floorMicro  = parseTokenAmount(value.floorPrice, 6);
  const decayAmt    = parseTokenAmount(value.priceDecayAmount, 6);
  const decayBlocks = parseInt(value.priceDecayBlocks) || 0;

  const steps         = decayAmt > 0n && startMicro > floorMicro ? Number((startMicro - floorMicro) / decayAmt) : null;
  const blocksToFloor = steps != null && decayBlocks > 0 ? steps * decayBlocks : null;

  // Inline errors — only shown when field has a value but is invalid
  const startError   = value.startPrice  && startMicro <= 0n   ? 'Required, must be > 0.' : null;
  const floorError   = value.floorPrice  && floorMicro <= 0n   ? 'Required, must be > 0.'
                     : value.floorPrice  && value.startPrice && floorMicro >= startMicro ? 'Must be less than start price.' : null;
  const decayBlkErr  = value.priceDecayBlocks  && decayBlocks <= 0 ? 'Required, must be > 0.' : null;
  const decayAmtErr  = value.priceDecayAmount  && decayAmt <= 0n   ? 'Required, must be > 0.' : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Price steps down every N blocks until supply is met or the floor is reached.
        All winners pay the same clearing price.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <TokenAmountInput
          label="Start price" value={value.startPrice}
          onChange={set('startPrice')} decimals={6} symbol="ALEO"
          placeholder="0.5" hint="Highest price bidders see."
          error={startError ?? undefined}
        />
        <TokenAmountInput
          label="Floor price" value={value.floorPrice}
          onChange={set('floorPrice')} decimals={6} symbol="ALEO"
          placeholder="0.1" hint="Minimum clearing price."
          error={floorError ?? undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Decay interval (blocks)</Label>
          <Input
            inputMode="numeric" value={value.priceDecayBlocks}
            onChange={(e) => set('priceDecayBlocks')(e.target.value.replace(/\D/g, ''))}
            placeholder="100"
            aria-invalid={!!decayBlkErr}
            className={decayBlkErr ? 'border-destructive focus-visible:ring-destructive/30' : ''}
          />
          {decayBlkErr
            ? <p className="text-xs text-destructive">{decayBlkErr}</p>
            : <p className="text-xs text-muted-foreground">
                Price drops every {decayBlocks || 'N'} blocks
                {decayBlocks > 0 ? ` (~${Math.round(decayBlocks * 10 / 60)} min)` : ''}.
              </p>
          }
        </div>
        <TokenAmountInput
          label="Decay amount" value={value.priceDecayAmount}
          onChange={set('priceDecayAmount')} decimals={6} symbol="ALEO"
          placeholder="0.01" hint="Price drop per step."
          error={decayAmtErr ?? undefined}
        />
      </div>

      {blocksToFloor != null && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Reaches floor in ~{steps!.toLocaleString()} steps × {decayBlocks} blocks
          {' '}= <strong>{blocksToFloor.toLocaleString()} blocks</strong>
          {' '}(~{Math.round(blocksToFloor * 10 / 60)} min).
          Clearing price range: {formatMicrocredits(floorMicro)} – {formatMicrocredits(startMicro)}.
        </div>
      )}
    </div>
  );
}
