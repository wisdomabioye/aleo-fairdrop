import { useMemo } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { createFairswapDexV3, type FairswapDexV3 } from '@fairdrop/sdk/dex';

export function useDexClient(): FairswapDexV3 | null {
  const { connected, executeTransaction } = useWallet();
  return useMemo(
    () => connected ? createFairswapDexV3({ executeTransaction }) : null,
    [connected, executeTransaction],
  );
}
