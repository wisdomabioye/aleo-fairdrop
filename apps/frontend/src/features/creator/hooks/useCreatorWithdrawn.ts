import { useQuery } from '@tanstack/react-query';
import { getAleoClient } from '@fairdrop/sdk/client';
import { parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';

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
      const client = getAleoClient();
      const [revRaw, unsoldRaw] = await Promise.all([
        client.getProgramMappingValue(programId, 'creator_withdrawn', auctionId).catch(() => null),
        client.getProgramMappingValue(programId, 'unsold_withdrawn',  auctionId).catch(() => null),
      ]);
      return {
        paymentsWithdrawn: u128ToBigInt(parseU128(revRaw ?? '0')),
        unsoldWithdrawn:   u128ToBigInt(parseU128(unsoldRaw ?? '0')),
      };
    },
    enabled,
    staleTime: 30_000,
  });
}
