import { useQuery } from '@tanstack/react-query';
import { indexerService } from '@/services/indexer.service';

export function useIndexerStatus() {
  return useQuery({
    queryKey:        ['indexerStatus'],
    queryFn:         indexerService.status,
    staleTime:       30_000,
    refetchInterval: 30_000,
  });
}
