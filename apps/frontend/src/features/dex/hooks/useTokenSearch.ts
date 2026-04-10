import { useQuery } from '@tanstack/react-query';
import { tokensService } from '@/services/tokens.service';

export function useTokenSearch(query: string) {
  return useQuery({
    queryKey:        ['token-search', query],
    queryFn:         () => tokensService.list({ query: query.trim(), pageSize: 20 }),
    enabled:         query.trim().length >= 2,
    staleTime:       60_000,
    placeholderData: (prev) => prev,
  });
}
