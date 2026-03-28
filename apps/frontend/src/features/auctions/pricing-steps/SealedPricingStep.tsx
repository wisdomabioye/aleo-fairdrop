import { Input, Label, TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricingStepProps, SealedPricingValues } from './types';

export function SealedPricingStep({ value, onChange }: PricingStepProps<SealedPricingValues>) {
  const set = (k: keyof SealedPricingValues) =>
    (v: string) => onChange({ ...value, [k]: v });

  const startMicro   = parseTokenAmount(value.startPrice, 6);
  const floorMicro   = parseTokenAmount(value.floorPrice, 6);
  const decayAmt     = parseTokenAmount(value.priceDecayAmount, 6);
  const decayBlocks  = parseInt(value.priceDecayBlocks) || 0;
  const commitOffset = parseInt(value.commitEndBlockOffset) || 0;

  let clearingAtCommit: bigint | null = null;
  if (startMicro > 0n && decayAmt > 0n && decayBlocks > 0 && commitOffset > 0) {
    const stepsElapsed = BigInt(Math.floor(commitOffset / decayBlocks));
    const decayed      = stepsElapsed * decayAmt;
    const raw          = startMicro > decayed ? startMicro - decayed : 0n;
    clearingAtCommit   = raw > floorMicro ? raw : floorMicro;
  }

  const stepsToFloor  = decayAmt > 0n && startMicro > floorMicro ? Number((startMicro - floorMicro) / decayAmt) : null;
  const blocksToFloor = stepsToFloor != null && decayBlocks > 0 ? stepsToFloor * decayBlocks : null;

  // Inline errors
  const startError    = value.startPrice && startMicro <= 0n ? 'Required, must be > 0.' : null;
  const floorError    = value.floorPrice && floorMicro <= 0n ? 'Required, must be > 0.'
                      : value.floorPrice && value.startPrice && floorMicro >= startMicro ? 'Must be less than start price.' : null;
  const decayBlkErr   = value.priceDecayBlocks && decayBlocks <= 0 ? 'Required, must be > 0.' : null;
  const decayAmtErr   = value.priceDecayAmount && decayAmt <= 0n   ? 'Required, must be > 0.' : null;
  const commitErr     = value.commitEndBlockOffset && commitOffset <= 0 ? 'Required, must be > 0.' : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Bidders commit a hidden payment during the commit window, then reveal
        during the reveal window. Clearing price = Dutch price at{' '}
        <code className="text-xs">commit_end_block</code>. All revealed winners pay that same price.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <TokenAmountInput
          label="Start price" value={value.startPrice}
          onChange={set('startPrice')} decimals={6} symbol="ALEO"
          placeholder="0.5" error={startError ?? undefined}
        />
        <TokenAmountInput
          label="Floor price" value={value.floorPrice}
          onChange={set('floorPrice')} decimals={6} symbol="ALEO"
          placeholder="0.1" error={floorError ?? undefined}
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
            : <p className="text-xs text-muted-foreground">Price drops every N blocks.</p>}
        </div>
        <TokenAmountInput
          label="Decay amount" value={value.priceDecayAmount}
          onChange={set('priceDecayAmount')} decimals={6} symbol="ALEO"
          placeholder="0.01" error={decayAmtErr ?? undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Commit window (blocks from start)</Label>
        <Input
          inputMode="numeric" value={value.commitEndBlockOffset}
          onChange={(e) => set('commitEndBlockOffset')(e.target.value.replace(/\D/g, ''))}
          placeholder="1000"
          aria-invalid={!!commitErr}
          className={commitErr ? 'border-destructive focus-visible:ring-destructive/30' : ''}
        />
        {commitErr
          ? <p className="text-xs text-destructive">{commitErr}</p>
          : <p className="text-xs text-muted-foreground">
              Bidders can commit up to this many blocks after start.
              {commitOffset > 0 && ` (~${Math.round(commitOffset * 10 / 60)} min)`}
            </p>}
      </div>

      {clearingAtCommit != null && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
          <div className="text-muted-foreground">
            Estimated clearing price at commit end:{' '}
            <strong className="text-foreground">{formatMicrocredits(clearingAtCommit)}</strong>
          </div>
          {blocksToFloor != null && commitOffset >= blocksToFloor && (
            <p className="text-yellow-600 dark:text-yellow-400">
              Floor is reached before the commit window closes — shorten the window or reduce the decay rate.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
