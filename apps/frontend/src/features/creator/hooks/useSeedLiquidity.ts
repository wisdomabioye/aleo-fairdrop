import { useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { buildSeedLiquidity, type SeedLiquidityInput } from '@fairdrop/sdk/dex';
import type { AuctionView } from '@fairdrop/types/domain';

export function useSeedLiquidity(
  auction: AuctionView | null,
  input:   SeedLiquidityInput | null,
) {
  const { address, executeTransaction } = useWallet();

  const steps = useMemo(() => {
    if (!auction || !input || !address || !executeTransaction) return [];
    return [{
      label:   'Seed Liquidity',
      execute: async () => {
        const spec = buildSeedLiquidity(auction, input);
        // buildSeedLiquidity uses the deprecated TxSpec builder (not generated client),
        // so executeTransaction is called directly here and returns { transactionId } | undefined.
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        if (!result?.transactionId) throw new Error('No transaction ID returned');
        return result.transactionId;
      },
    }];
  }, [auction, input, address, executeTransaction]);

  return useConfirmedSequentialTx(steps);
}
