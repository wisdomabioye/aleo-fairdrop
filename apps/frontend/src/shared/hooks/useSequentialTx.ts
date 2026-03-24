import { useState } from 'react';

/**
 * Step-through transaction flow.
 *
 * Each step is an async function (typically a wallet executeTransaction call).
 * On error the step index stays put — the user retries via advance().
 * On success the index advances; done=true when all steps complete.
 *
 * Usage:
 *   const { currentStep, totalSteps, done, advance, error } = useSequentialTx([
 *     () => executeVerify(...),
 *     () => executePlaceBid(...),
 *   ]);
 */
export function useSequentialTx(steps: Array<() => Promise<void>>) {
  const [currentStep, setCurrentStep] = useState(0);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState<Error | null>(null);

  async function advance() {
    if (done || currentStep >= steps.length) return;
    setError(null);
    try {
      await steps[currentStep]!();
      if (currentStep + 1 >= steps.length) {
        setDone(true);
      } else {
        setCurrentStep((s) => s + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      // Step index intentionally NOT advanced — caller retries via advance()
    }
  }

  function reset() {
    setCurrentStep(0);
    setDone(false);
    setError(null);
  }

  return {
    currentStep,
    totalSteps: steps.length,
    done,
    error,
    advance,
    reset,
  };
}
