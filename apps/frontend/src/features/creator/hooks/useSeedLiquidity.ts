import { useState, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { buildSeedFromAuction } from '@fairdrop/sdk/transactions';
import type { AuctionView } from '@fairdrop/types/domain';

export type SeedStep = 'idle' | 'withdrawing' | 'withdrawing_unsold' | 'seeding' | 'done' | 'error';

export interface SeedLiquidityState {
  step:    SeedStep;
  txIds:   string[];
  error:   string | null;
  execute: (creditsAmount: bigint, tokenAmount: bigint, minLpTokens: bigint) => Promise<void>;
  reset:   () => void;
}

export function useSeedLiquidity(auction: AuctionView): SeedLiquidityState {
  const { executeTransaction } = useWallet();

  const [step,  setStep]  = useState<SeedStep>('idle');
  const [txIds, setTxIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setTxIds([]);
    setError(null);
  }, []);

  const execute = useCallback(async (
    creditsAmount: bigint,
    tokenAmount:   bigint,
    minLpTokens:   bigint,
  ) => {
    setError(null);
    setTxIds([]);

    const [withdrawCreditsTx, withdrawTokensTx, addLiquidityTx] = buildSeedFromAuction({
      auction, creditsAmount, tokenAmount, minLpTokens,
    });

    try {
      // Step 1 — withdraw credits
      setStep('withdrawing');
      const r0 = await executeTransaction({ ...withdrawCreditsTx, inputs: withdrawCreditsTx.inputs as string[] });
      if (!r0?.transactionId) throw new Error('withdraw_payments failed — no transaction ID returned.');
      setTxIds((ids) => [...ids, r0.transactionId!]);

      // Step 2 — withdraw unsold tokens (must confirm first so record is available)
      setStep('withdrawing_unsold');
      const r1 = await executeTransaction({ ...withdrawTokensTx, inputs: withdrawTokensTx.inputs as string[] });
      if (!r1?.transactionId) throw new Error('withdraw_unsold failed — no transaction ID returned.');
      setTxIds((ids) => [...ids, r1.transactionId!]);

      // Step 3 — add liquidity
      // NOTE: private_dex.aleo is not yet deployed. The token record from step 2
      // must be resolved and substituted before this call is live. The addLiquidityTx
      // returned by buildSeedFromAuction is a placeholder with an empty token record.
      setStep('seeding');
      const r2 = await executeTransaction({ ...addLiquidityTx, inputs: addLiquidityTx.inputs as string[] });
      if (!r2?.transactionId) throw new Error('add_liquidity failed — no transaction ID returned.');
      setTxIds((ids) => [...ids, r2.transactionId!]);

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('error');
    }
  }, [auction, executeTransaction]);

  return { step, txIds, error, execute, reset };
}
