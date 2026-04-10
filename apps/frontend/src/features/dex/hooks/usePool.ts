import { useQuery } from '@tanstack/react-query';
import { fetchPool, type PoolState } from '@fairdrop/sdk/dex';

export function usePool(tokenA: string | null, tokenB: string | null) {
  return useQuery<PoolState | null>({
    queryKey:  ['dex', 'pool', tokenA, tokenB],
    queryFn:   () => fetchPool(tokenA!, tokenB!),
    enabled:   !!tokenA && !!tokenB,
    staleTime: 10_000,
    retry:     false,
  });
}
