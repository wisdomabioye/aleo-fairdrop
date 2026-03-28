import { useQuery } from '@tanstack/react-query';
import { fetchMappingBigInt } from '@/lib/mapping';

export interface CreatorWithdrawn {
  paymentsWithdrawn: bigint;
  unsoldWithdrawn:   bigint;
}

/**
 * Queries `creator_withdrawn` and `unsold_withdrawn` on-chain mappings
 * for a cleared auction to determine remaining withdrawable amounts.
 */
export function useCreatorWithdrawn(
  auctionId: string,
  programId: string,
  enabled:   boolean,
) {
  return useQuery<CreatorWithdrawn>({
    queryKey: ['creator-withdrawn', auctionId],
    queryFn:  async () => {
      const [paymentsWithdrawn, unsoldWithdrawn] = await Promise.all([
        fetchMappingBigInt(programId, 'creator_withdrawn', auctionId),
        fetchMappingBigInt(programId, 'unsold_withdrawn',  auctionId),
      ]);
      return { paymentsWithdrawn, unsoldWithdrawn };
    },
    enabled,
    staleTime: 30_000,
  });
}
