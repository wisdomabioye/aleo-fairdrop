import { useQuery } from '@tanstack/react-query';
import { fetchLpBalance } from '@fairdrop/sdk/dex';

/**
 * Fetch public LP balance for (address, poolKey).
 * fetchLpBalance returns bigint (0n on miss) — never null.
 */
export function useLpBalance(address: string | null, poolKey: string | null) {
  return useQuery<bigint>({
    queryKey:  ['dex', 'lp-balance', address, poolKey],
    queryFn:   () => fetchLpBalance(address!, poolKey!),
    enabled:   !!address && !!poolKey,
    staleTime: 30_000,
  });
}
