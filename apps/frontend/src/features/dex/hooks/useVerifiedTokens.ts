import { useQuery } from '@tanstack/react-query';
import { tokensService } from '@/services/tokens.service';
import { WELL_KNOWN_TOKENS, type TokenDisplay } from '@/config/well-known-tokens';
import type { TokenMetadata } from '@fairdrop/types/domain';

export function useVerifiedTokens() {
  return useQuery({
    queryKey:  ['tokens', 'verified'],
    queryFn:   () => tokensService.list({ verified: true, pageSize: 30 }),
    staleTime: 5 * 60_000,
    select:    (data): TokenDisplay[] => {
      const apiIds = new Set(data.items.map((t: TokenMetadata) => t.tokenId));
      const pinned = WELL_KNOWN_TOKENS.filter((t) => !apiIds.has(t.tokenId));
      return [...pinned, ...data.items];
    },
  });
}
