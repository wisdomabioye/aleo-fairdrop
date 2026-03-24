import { useEffect } from 'react';
import { Input, Label } from '@/components';
import { estimateDate } from '@fairdrop/sdk/format';
import { AuctionType } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';
import type { ProtocolConfig } from '@fairdrop/types/domain';
import type { StepProps } from './types';

interface TimingStepProps extends StepProps {
  protocolConfig: ProtocolConfig;
}

function BlockInput({
  label, value, onChange, currentBlock, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currentBlock: number;
  hint?: string;
}) {
  const blockNum  = parseInt(value) || 0;
  const estimated = blockNum > 0 && currentBlock > 0
    ? estimateDate(blockNum, currentBlock)
    : null;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
      {estimated && (
        <p className="text-xs text-muted-foreground">~{estimated.toLocaleString()}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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

  const isSealed = form.auctionType === AuctionType.Sealed;
  const commitOffset = isSealed
    ? parseInt((form.pricing as { commitEndBlockOffset?: string })?.commitEndBlockOffset ?? '0') || 0
    : 0;
  const commitBlock = isSealed && startBlock > 0 ? startBlock + commitOffset : null;

  const durationError =
    duration > 0 && duration < minDuration
      ? `Minimum duration is ${minDuration} blocks.`
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set the auction schedule. Estimates assume 10s per block.
        Minimum duration: <strong>{minDuration} blocks</strong>
        {' '}(~{Math.round(minDuration * 10 / 60)} min).
      </p>

      <div className="grid grid-cols-2 gap-4">
        <BlockInput
          label="Start block"
          value={form.startBlock}
          onChange={(v) => onChange({ startBlock: v })}
          currentBlock={currentBlock}
          hint={`Current block: ${currentBlock || '…'}`}
        />
        <BlockInput
          label="End block"
          value={form.endBlock}
          onChange={(v) => onChange({ endBlock: v })}
          currentBlock={currentBlock}
          hint={duration > 0 ? `Duration: ${duration} blocks` : undefined}
        />
      </div>

      {durationError && (
        <p className="text-xs text-destructive">{durationError}</p>
      )}

      {isSealed && commitBlock != null && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium">Sealed auction phases</p>
          <p className="text-muted-foreground">
            Commit: block {startBlock} →{' '}
            {commitBlock}
            {currentBlock > 0 && (
              <> (~{estimateDate(commitBlock, currentBlock).toLocaleString()})</>
            )}
          </p>
          <p className="text-muted-foreground">
            Reveal: block {commitBlock} →{' '}
            {endBlock}
            {currentBlock > 0 && endBlock > 0 && (
              <> (~{estimateDate(endBlock, currentBlock).toLocaleString()})</>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Min bid amount (ALEO, 0 = none)</Label>
          <Input
            inputMode="decimal"
            value={form.minBidAmount}
            onChange={(e) => onChange({ minBidAmount: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Max bid amount (ALEO, 0 = no cap)</Label>
          <Input
            inputMode="decimal"
            value={form.maxBidAmount}
            onChange={(e) => onChange({ maxBidAmount: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
