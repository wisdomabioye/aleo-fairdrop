/**
 * useTokenBalance — fetch the connected wallet's public token balance.
 *
 * For CREDITS_RESERVED_TOKEN_ID, queries credits.aleo/account.
 * For other tokens, queries token_registry.aleo/authorized_balances → balances.
 *
 * Uses TanStack Query; refetches on address/tokenId change.
 * Returns null balance when: wallet disconnected, no balance, or lookup fails.
 */
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import {
  fetchCreditsBalance,
  fetchTokenBalance,
  fetchTokenInfo,
} from '@fairdrop/sdk/registry';
import { CREDITS_RESERVED_TOKEN_ID } from '@fairdrop/sdk/credits';

export function useTokenBalance(tokenId: string | null | undefined) {
  const { address } = useWallet();

  return useQuery({
    queryKey:  ['token-balance', address, tokenId],
    enabled:   !!address && !!tokenId,
    staleTime: 30_000,
    queryFn:   async () => {
      if (!address || !tokenId) return null;

      if (tokenId === CREDITS_RESERVED_TOKEN_ID) {
        return fetchCreditsBalance(address);
      }

      // For non-credits tokens: need TokenInfo first for symbol/decimals
      const info = await fetchTokenInfo(tokenId);
      if (!info) return null;
      const bal = await fetchTokenBalance(address, tokenId, info);
      return bal?.amount ?? null;
    },
  });
}
