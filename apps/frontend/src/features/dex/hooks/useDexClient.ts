import { useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { createFairswapDexV2, type FairswapDexV2 } from '@fairdrop/sdk/dex';

export function useDexClient(): FairswapDexV2 | null {
  const { connected, executeTransaction } = useWallet();
  return useMemo(
    () => connected ? createFairswapDexV2({ executeTransaction }) : null,
    [connected, executeTransaction],
  );
}
