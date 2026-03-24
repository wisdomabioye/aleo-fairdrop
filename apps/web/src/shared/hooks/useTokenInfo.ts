/**
 * useTokenInfo — fetch on-chain token metadata from token_registry.aleo.
 * Returns TokenInfo (symbol, decimals, supply, admin) or null if not registered.
 */
import { useQuery } from '@tanstack/react-query';
import { tokensService } from '@/services/tokens.service';

export function useTokenInfo(tokenId: string | null | undefined) {
  return useQuery({
    queryKey:  ['token-info', tokenId],
    enabled:   !!tokenId,
    staleTime: 5 * 60_000, // 5 min — token metadata is stable
    queryFn:   () => tokensService.get(tokenId!),
  });
}
