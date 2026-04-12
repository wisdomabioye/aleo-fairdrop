import { useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Spinner } from '@/components';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { cn } from '@/lib/utils';
import { SignaturePanel, sigsComplete } from '../shared/SignaturePanel';
import { MsgHashPanel } from '../shared/MsgHashPanel';
import { useTwoPhaseOp } from '../shared/useTwoPhaseOp';
import { SET_CALLER_BUILDERS } from './constants';
import type { ThreeSigs } from '../../types';
import type { UtilityKey } from '../../hooks/useCallerStatus';

interface UtilityAuthCardProps {
  utilityKey:     UtilityKey;
  label:          string;
  opHash:         string;
  requestId:      bigint;
  opNonce:        bigint;
  auctionAddress: string;
  sigs:           ThreeSigs;
  onChange:        (sigs: ThreeSigs) => void;
  onSuccess:      () => void;
}

export function UtilityAuthCard({
  utilityKey, label, opHash, requestId, opNonce,
  auctionAddress, sigs, onChange, onSuccess,
}: UtilityAuthCardProps) {
  const [expanded, setExpanded] = useState(false);
  const ready = sigsComplete(sigs);

  const buildPhase2 = useCallback(
    () => SET_CALLER_BUILDERS[utilityKey](auctionAddress, true, opNonce),
    [utilityKey, auctionAddress, opNonce],
  );

  const { msgHash, currentStep, busy, isWaiting, done, error, trackedIds, advance, reset } =
    useTwoPhaseOp({
      opHash,
      requestId,
      sigs,
      phase2Label: `Set ${label} caller`,
      buildPhase2,
    });

  if (done) {
    onSuccess();
    reset();
  }

  const submitting = busy || isWaiting;

  return (
    <div className={cn(
      'rounded-lg border p-3',
      done
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : ready
          ? 'border-sky-500/20 bg-sky-500/5'
          : 'border-border/70 bg-muted/20',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {done && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ Approved</span>
          )}
          {!done && ready && (
            <span className="text-[10px] font-medium text-sky-600 dark:text-sky-400">Ready</span>
          )}
          {!done && !ready && (
            <span className="text-[10px] text-muted-foreground">Needs signatures</span>
          )}
        </div>
        <ChevronDown className={cn(
          'size-4 text-muted-foreground transition-transform duration-200',
          expanded && 'rotate-180',
        )} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
          <MsgHashPanel msgHash={msgHash} />
          <SignaturePanel value={sigs} onChange={onChange} />

          {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
          {error && <p className="text-xs text-destructive">{error.message}</p>}

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Step 1: Register approval in multisig — Step 2: {label} consumes the approval
            </p>
            <Button
              size="sm"
              className="w-full"
              disabled={!ready || submitting}
              onClick={() => void advance()}
            >
              {submitting
                ? <><Spinner className="mr-1.5 h-3 w-3" />{currentStep === 0 ? `Step 1/2 — Registering in multisig…` : `Step 2/2 — ${label} consuming approval…`}</>
                : currentStep === 0 ? `Approve & set ${label} caller` : `Set ${label} caller`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
