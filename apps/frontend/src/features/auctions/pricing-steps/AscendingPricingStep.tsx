import { Input, Label, TokenAmountInput } from '@/components';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import type { PricingStepProps, AscendingPricingValues } from './types';

export function AscendingPricingStep({ value, onChange }: PricingStepProps<AscendingPricingValues>) {
  const set = (k: keyof AscendingPricingValues) =>
    (v: string) => onChange({ ...value, [k]: v });

  const extensionEnabled = parseInt(value.extensionWindow) > 0;

  const floorMicro   = parseTokenAmount(value.floorPrice, 6);
  const ceilingMicro = parseTokenAmount(value.ceilingPrice, 6);
  const riseAmt      = parseTokenAmount(value.priceRiseAmount, 6);
  const riseBlocks   = parseInt(value.priceRiseBlocks) || 0;

  const steps = riseAmt > 0n && ceilingMicro > floorMicro
    ? Number((ceilingMicro - floorMicro) / riseAmt)
    : null;
  const blocksToCeiling = steps != null && riseBlocks > 0 ? steps * riseBlocks : null;

  // Inline errors
  const floorError   = value.floorPrice && floorMicro <= 0n ? 'Required, must be > 0.' : null;
  const ceilingError = value.ceilingPrice && ceilingMicro <= 0n ? 'Required, must be > 0.'
                     : value.ceilingPrice && value.floorPrice && ceilingMicro <= floorMicro ? 'Must be greater than floor price.' : null;
  const riseBlkErr   = value.priceRiseBlocks && riseBlocks <= 0 ? 'Required, must be > 0.' : null;
  const riseAmtErr   = value.priceRiseAmount && riseAmt <= 0n   ? 'Required, must be > 0.' : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Price rises from floor to ceiling over time. Each bidder pays the price
        at the moment they bid — no uniform clearing price, no refund at claim.
        Early bidders always pay less.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <TokenAmountInput
          label="Floor price" value={value.floorPrice}
          onChange={set('floorPrice')} decimals={6} symbol="ALEO"
          placeholder="0.05" hint="Starting (lowest) price."
          error={floorError ?? undefined}
        />
        <TokenAmountInput
          label="Ceiling price" value={value.ceilingPrice}
          onChange={set('ceilingPrice')} decimals={6} symbol="ALEO"
          placeholder="0.5" hint="Maximum price cap."
          error={ceilingError ?? undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Rise interval (blocks)</Label>
          <Input
            inputMode="numeric" value={value.priceRiseBlocks}
            onChange={(e) => set('priceRiseBlocks')(e.target.value.replace(/\D/g, ''))}
            placeholder="100"
            aria-invalid={!!riseBlkErr}
            className={riseBlkErr ? 'border-destructive focus-visible:ring-destructive/30' : ''}
          />
          {riseBlkErr
            ? <p className="text-xs text-destructive">{riseBlkErr}</p>
            : <p className="text-xs text-muted-foreground">
                Price rises every {riseBlocks || 'N'} blocks
                {riseBlocks > 0 ? ` (~${Math.round(riseBlocks * 10 / 60)} min)` : ''}.
              </p>
          }
        </div>
        <TokenAmountInput
          label="Rise amount" value={value.priceRiseAmount}
          onChange={set('priceRiseAmount')} decimals={6} symbol="ALEO"
          placeholder="0.01" hint="Price increase per step."
          error={riseAmtErr ?? undefined}
        />
      </div>
      {blocksToCeiling != null && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Reaches ceiling in ~{steps!.toLocaleString()} steps × {riseBlocks} blocks
          {' '}= <strong>{blocksToCeiling.toLocaleString()} blocks</strong>
          {' '}(~{Math.round(blocksToCeiling * 10 / 60)} min).
          Price range: {formatMicrocredits(floorMicro)} – {formatMicrocredits(ceilingMicro)}.
        </div>
      )}

      {/* Anti-sniping extension */}
      <div className="border-t border-border pt-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Anti-sniping</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            If a bid lands within the final N blocks, extend the deadline by M blocks.
            Set window to 0 to disable.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Window (blocks)</Label>
            <Input
              inputMode="numeric" value={value.extensionWindow}
              onChange={(e) => set('extensionWindow')(e.target.value.replace(/\D/g, ''))}
              placeholder="60"
            />
            <p className="text-xs text-muted-foreground">
              {parseInt(value.extensionWindow) > 0
                ? `~${Math.round(parseInt(value.extensionWindow) * 10 / 60)} min before end`
                : 'Disabled'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Extension (blocks)</Label>
            <Input
              inputMode="numeric" value={value.extensionBlocks}
              onChange={(e) => set('extensionBlocks')(e.target.value.replace(/\D/g, ''))}
              placeholder="120"
              disabled={!extensionEnabled}
            />
            <p className="text-xs text-muted-foreground">
              {extensionEnabled && parseInt(value.extensionBlocks) > 0
                ? `+~${Math.round(parseInt(value.extensionBlocks) * 10 / 60)} min per bid`
                : '—'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Hard cap (block)</Label>
            <Input
              inputMode="numeric" value={value.maxEndBlock}
              onChange={(e) => set('maxEndBlock')(e.target.value.replace(/\D/g, ''))}
              placeholder="auto"
              disabled={!extensionEnabled}
            />
            <p className="text-xs text-muted-foreground">Absolute end block ceiling.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
