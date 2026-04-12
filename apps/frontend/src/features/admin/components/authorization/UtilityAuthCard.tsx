import { useState, useMemo, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { ChevronDown } from 'lucide-react';
import { Button, Spinner } from '@/components';
import { WizardTxStatus } from '@/shared/components/WizardTxStatus';
import { submitApproveOp } from '@fairdrop/sdk/multisig';
import { cn } from '@/lib/utils';
import { SignaturePanel, sigsComplete } from '../shared/SignaturePanel';
import { MsgHashPanel } from '../shared/MsgHashPanel';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { SET_CALLER_BUILDERS } from './constants';
import type { ThreeSigs } from '../../types';
import type { UtilityKey } from '../../hooks/useCallerStatus';

interface UtilityAuthCardProps {
  utilityKey:     UtilityKey;
  label:          string;
  msgHash:        string;
  opHash:         string;
  requestId:      bigint;
  opNonce:        bigint;
  auctionAddress: string;
  sigs:           ThreeSigs;
  onChange:        (sigs: ThreeSigs) => void;
  onSuccess:      () => void;
}

export function UtilityAuthCard({
  utilityKey, label, msgHash, opHash, requestId, opNonce,
  auctionAddress, sigs, onChange, onSuccess,
}: UtilityAuthCardProps) {
  const { executeTransaction } = useWallet();
  const [expanded, setExpanded] = useState(false);
  const ready = sigsComplete(sigs);

  const steps = useMemo(() => [
    {
      label: `Approve ${label}`,
      execute: async () => {
        const spec = submitApproveOp(
          opHash,
          sigs[0].sig, sigs[0].admin,
          sigs[1].sig, sigs[1].admin,
          sigs[2].sig, sigs[2].admin,
          requestId,
        );
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
    {
      label: `Set ${label} caller`,
      execute: async () => {
        const spec = SET_CALLER_BUILDERS[utilityKey](auctionAddress, true, opNonce);
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [opHash, requestId, opNonce, auctionAddress, sigs, utilityKey, label]);

  const { busy, isWaiting, done, error, trackedIds, advance, reset, currentStep } =
    useConfirmedSequentialTx(steps);

  // Auto-fire step 2 after step 1 (approve_op) confirms on-chain.
  useEffect(() => {
    if (currentStep === 1 && !busy && !isWaiting && !done && !error) {
      void advance();
    }
  }, [currentStep, busy, isWaiting, done, error, advance]);

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
