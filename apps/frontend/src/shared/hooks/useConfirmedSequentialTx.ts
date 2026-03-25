import { useState, useEffect } from 'react';
import { useTransactionTracker, type TrackedTx } from '@/providers/transaction-tracker';

export interface SequentialStep {
  label: string;
  /**
   * Execute this step. Should call executeTransaction and return the
   * wallet-internal transactionId, or undefined if nothing was submitted.
   */
  execute: () => Promise<string | undefined>;
}

export interface UseConfirmedSequentialTxResult {
  /** 0-based index of the step the user needs to act on next. */
  currentStep: number;
  totalSteps: number;
  /** All steps have confirmed on-chain. */
  done: boolean;
  /** Wallet prompt is in-flight (executeTransaction not yet resolved). */
  busy: boolean;
  /** Tx submitted — polling for on-chain confirmation. */
  isWaiting: boolean;
  /** Latest terminal error (cleared on the next advance() call). */
  error: Error | null;
  /** The TrackedTx entry for the currently in-flight step, if any. */
  currentTx: TrackedTx | undefined;
  /**
   * Trigger the current step. Safe to call while busy or isWaiting — it
   * returns early. Call again after an error to retry the same step.
   */
  advance: () => Promise<void>;
  /** Reset the wizard back to step 0. Does NOT clear tracker history. */
  reset: () => void;
}

export function useConfirmedSequentialTx(
  steps: SequentialStep[],
): UseConfirmedSequentialTxResult {
  const { transactions, startSigning, confirmSigning, failEntry } =
    useTransactionTracker();

  const [currentStep,    setCurrentStep]    = useState(0);
  const [done,           setDone]           = useState(false);
  const [busy,           setBusy]           = useState(false);
  const [error,          setError]          = useState<Error | null>(null);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);

  // Derive current tx from the tracker's live list (no extra hook needed)
  const currentTx = currentEntryId
    ? transactions.find((t) => t.id === currentEntryId)
    : undefined;

  const isWaiting =
    !!currentEntryId &&
    (currentTx?.status === 'signing' || currentTx?.status === 'pending');

  // Auto-advance when the current tx reaches a terminal state
  useEffect(() => {
    if (!currentTx) return;

    if (currentTx.status === 'confirmed') {
      setCurrentEntryId(null);
      if (currentStep + 1 >= steps.length) {
        setDone(true);
      } else {
        setCurrentStep((s) => s + 1);
      }
    } else if (
      currentTx.status === 'failed' ||
      currentTx.status === 'rejected'
    ) {
      setCurrentEntryId(null);
      setError(new Error(`"${currentTx.label}" transaction failed on-chain`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTx?.status]);

  async function advance() {
    // Guard: don't double-fire
    if (done || busy || currentEntryId || currentStep >= steps.length) return;

    setError(null);
    setBusy(true);

    const step    = steps[currentStep]!;
    const entryId = startSigning(step.label);
    setCurrentEntryId(entryId);

    try {
      const txId = await step.execute();
      if (txId) {
        confirmSigning(entryId, txId);
        // isWaiting becomes true; useEffect above will advance on confirmation
      } else {
        // executeTransaction resolved but returned no id — treat as failure
        failEntry(entryId);
        setCurrentEntryId(null);
        setError(new Error(`"${step.label}" returned no transaction ID`));
      }
    } catch (e) {
      failEntry(entryId);
      setCurrentEntryId(null);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCurrentStep(0);
    setDone(false);
    setBusy(false);
    setError(null);
    setCurrentEntryId(null);
  }

  return {
    currentStep,
    totalSteps: steps.length,
    done,
    busy,
    isWaiting,
    error,
    currentTx,
    advance,
    reset,
  };
}
