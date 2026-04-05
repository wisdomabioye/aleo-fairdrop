import { useQuery }  from '@tanstack/react-query';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchIsAdmin } from '@fairdrop/sdk/chain';

export function useAdminGate() {
  const { address, connected } = useWallet();

  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey:  ['multisig', 'admin', address],
    queryFn:   () => fetchIsAdmin(address!),
    enabled:   connected && !!address,
    staleTime: 60_000,
  });

  return { isAdmin, isLoading, address };
}
