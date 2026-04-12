import { useQuery }  from '@tanstack/react-query';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchIsAdmin, fetchIsMultisigInitialized } from '@fairdrop/sdk/chain';

export function useAdminGate() {
  const { address, connected } = useWallet();

  const { data: isAdmin = false, isLoading: adminLoading } = useQuery({
    queryKey:  ['multisig', 'admin', address],
    queryFn:   () => fetchIsAdmin(address!),
    enabled:   connected && !!address,
    staleTime: 60_000,
  });

  const { data: isInitialized = true, isLoading: initLoading } = useQuery({
    queryKey:  ['multisig', 'initialized'],
    queryFn:   fetchIsMultisigInitialized,
    staleTime: 60_000,
  });

  const isLoading = adminLoading || initLoading;

  // Pre-init bypass: anyone connected can enter so they can call initialize().
  // Security still rests on the hardcoded ADMIN_0..4 constants in the contract.
  const canEnter = connected && (isAdmin || !isInitialized);

  return { isAdmin, isInitialized, canEnter, isLoading, address };
}
