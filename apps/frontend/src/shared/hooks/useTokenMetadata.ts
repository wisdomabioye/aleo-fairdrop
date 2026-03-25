/**
 * useTokenMetadata — fetch token metadata for one or many token IDs.
 *
 * Single:   const { data, isLoading } = useTokenMetadata(tokenId)
 * Multiple: const { dataMap, isLoading } = useTokenMetadata(tokenIds)
 *
 * react-query deduplicates and caches results across all consumers.
 */
import { useMemo }           from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { tokensService }     from '@/services/tokens.service';
import type { TokenMetadata } from '@fairdrop/types/domain';

const STALE_TIME = 50000 * 60_000; // token metadata is stable - lives for long

// ── Single token ──────────────────────────────────────────────────────────────

export function useTokenMetadata(tokenId: string | null | undefined): {
  data:      TokenMetadata | null | undefined;
  isLoading: boolean;
};

// ── Multiple tokens ───────────────────────────────────────────────────────────

export function useTokenMetadata(tokenIds: string[]): {
  dataMap:   Map<string, TokenMetadata>;
  isLoading: boolean;
};

// ── Implementation ────────────────────────────────────────────────────────────

export function useTokenMetadata(
  input: string | string[] | null | undefined,
): {
  data?:    TokenMetadata | null | undefined;
  dataMap?: Map<string, TokenMetadata>;
  isLoading: boolean;
} {
  const isArray = Array.isArray(input);

  // Single-token path
  const single = useQuery({
    queryKey: ['token-metadata', isArray ? null : input],
    enabled:  !isArray && !!input,
    staleTime: STALE_TIME,
    queryFn:  () => tokensService.get(input as string),
  });

  // Multi-token path
  const ids = isArray ? (input as string[]) : [];
  const multi = useQueries({
    queries: ids.map((id) => ({
      queryKey:  ['token-metadata', id],
      staleTime: STALE_TIME,
      queryFn:   () => tokensService.get(id),
    })),
  });

  const dataMap = useMemo<Map<string, TokenMetadata>>(() => {
    const map = new Map<string, TokenMetadata>();
    multi.forEach((q, i) => {
      if (q.data) map.set(ids[i]!, q.data);
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi]);

  if (isArray) {
    return {
      dataMap,
      isLoading: multi.some((q) => q.isLoading),
    };
  }

  return {
    data:      single.data ?? null,
    isLoading: single.isLoading,
  };
}
