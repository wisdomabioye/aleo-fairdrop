import { useQuery } from '@tanstack/react-query';
import { getAleoClient } from '@fairdrop/sdk/client';

export function useBlockHeight() {
  return useQuery({
    queryKey:        ['blockHeight'],
    queryFn:         () => getAleoClient().getLatestHeight().then(Number),
    staleTime:       5_000,
    refetchInterval: 5_000,
  });
}
