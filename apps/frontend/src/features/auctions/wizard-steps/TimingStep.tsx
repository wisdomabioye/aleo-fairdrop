import { useEffect } from 'react';
import { Input, Label, Button } from '@/components';
import { estimateDate } from '@fairdrop/sdk/format';
import { AuctionType } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import { getRegistrySlot } from '../registry';
import type { ProtocolConfig } from '@fairdrop/types/domain';
import type { StepProps } from './types';

interface TimingStepProps extends StepProps {
  protocolConfig: ProtocolConfig;
}

function BlockInput({
  label, value, onChange, currentBlock, hint, error,
}: {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  currentBlock: number;
  hint?:        string;
  error?:       string | null;
}) {
  const blockNum  = parseInt(value) || 0;
  const estimated = blockNum > 0 && currentBlock > 0 ? estimateDate(blockNum, currentBlock) : null;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        aria-invalid={!!error}
        className={error ? 'border-destructive focus-visible:ring-destructive/30' : ''}
      />
      {estimated && !error && (
        <p className="text-xs text-muted-foreground">~{estimated.toLocaleString()}</p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function TimingStep({ form, onChange, protocolConfig }: TimingStepProps) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const minDuration = protocolConfig.minAuctionDuration;

  // Set sensible defaults once block height is known
  useEffect(() => {
    if (form.startBlock || currentBlock === 0) return;
    const start = currentBlock + 100;
    onChange({
      startBlock: String(start),
      endBlock:   String(start + Math.max(minDuration, 720)),
    });
  }, [currentBlock]); // eslint-disable-line react-hooks/exhaustive-deps

  const startBlock = parseInt(form.startBlock) || 0;
  const endBlock   = parseInt(form.endBlock)   || 0;
  const duration   = endBlock - startBlock;

  const slot           = getRegistrySlot(form.auctionType);
  const isSealed       = form.auctionType === AuctionType.Sealed;

  const commitOffset = isSealed
    ? parseInt((form.pricing as { commitEndBlockOffset?: string })?.commitEndBlockOffset ?? '0') || 0
    : 0;
  const commitBlock = isSealed && startBlock > 0 ? startBlock + commitOffset : null;

  // ── Validation ─────────────────────────────────────────────────────────────
  const startError =
    form.startBlock && startBlock <= currentBlock
      ? `Must be greater than current block (${currentBlock}).`
      : null;

  const endError =
    form.endBlock && endBlock > 0 && endBlock <= startBlock
      ? 'End block must be after start block.'
      : null;

  const durationError =
    !endError && duration > 0 && duration < minDuration
      ? `Minimum duration is ${minDuration} blocks (~${Math.round(minDuration * 10 / 60)} min).`
      : null;

  const minBidError =
    form.minBidAmount !== '' && parseFloat(form.minBidAmount) <= 0
      ? 'Required — must be greater than zero.'
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set the auction schedule. Estimates assume 10 s/block.
        Minimum duration: <strong>{minDuration} blocks</strong>{' '}
        (~{Math.round(minDuration * 10 / 60)} min).
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <BlockInput
            label="Start block"
            value={form.startBlock}
            onChange={(v) => onChange({ startBlock: v })}
            currentBlock={currentBlock}
            error={startError}
          />
          {startError && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onChange({ startBlock: String(currentBlock + 100) })}
            >
              Set to +100 blocks ({currentBlock + 100})
            </Button>
          )}
          {!startError && (
            <p className="text-xs text-muted-foreground">Current block: {currentBlock || '…'}</p>
          )}
        </div>

        <BlockInput
          label="End block"
          value={form.endBlock}
          onChange={(v) => onChange({ endBlock: v })}
          currentBlock={currentBlock}
          hint={duration > 0 && !durationError ? `Duration: ${duration} blocks` : undefined}
          error={endError ?? durationError}
        />
      </div>

      {isSealed && commitBlock != null && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium">Sealed auction phases</p>
          <p className="text-muted-foreground">
            Commit: block {startBlock} → {commitBlock}
            {currentBlock > 0 && <> (~{estimateDate(commitBlock, currentBlock).toLocaleString()})</>}
          </p>
          <p className="text-muted-foreground">
            Reveal: block {commitBlock} → {endBlock}
            {currentBlock > 0 && endBlock > 0 && <> (~{estimateDate(endBlock, currentBlock).toLocaleString()})</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {slot?.isContributionType ? (
          <>
            <div className="space-y-1.5">
              <Label>Min contribution (ALEO)</Label>
              <Input
                inputMode="decimal"
                value={form.minBidAmount}
                onChange={(e) => onChange({ minBidAmount: e.target.value })}
                placeholder="0.01"
                aria-invalid={!!minBidError}
                className={minBidError ? 'border-destructive focus-visible:ring-destructive/30' : ''}
              />
              {minBidError
                ? <p className="text-xs text-destructive">{minBidError}</p>
                : <p className="text-xs text-muted-foreground">Required.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Max contribution (ALEO)</Label>
              <Input
                inputMode="decimal"
                value={form.maxBidAmount}
                onChange={(e) => onChange({ maxBidAmount: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">0 = no cap.</p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Min bid ({form.tokenSymbol || 'tokens'})</Label>
              <Input
                inputMode="decimal"
                value={form.minBidAmount}
                onChange={(e) => onChange({ minBidAmount: e.target.value })}
                placeholder="1"
                aria-invalid={!!minBidError}
                className={minBidError ? 'border-destructive focus-visible:ring-destructive/30' : ''}
              />
              {minBidError
                ? <p className="text-xs text-destructive">{minBidError}</p>
                : <p className="text-xs text-muted-foreground">Required.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Max bid ({form.tokenSymbol || 'tokens'})</Label>
              <Input
                inputMode="decimal"
                value={form.maxBidAmount}
                onChange={(e) => onChange({ maxBidAmount: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">0 = no cap.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
