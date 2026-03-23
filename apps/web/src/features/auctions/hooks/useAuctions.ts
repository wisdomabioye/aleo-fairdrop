import { useQuery } from '@tanstack/react-query';
import type { AuctionListParams } from '@fairdrop/types/api';
import { auctionsService } from '@/services/auctions.service';

export function useAuctions(params: AuctionListParams) {
  return useQuery({
    queryKey:        ['auctions', params],
    queryFn:         () => auctionsService.list(params),
    staleTime:       15_000,
    refetchInterval: 30_000,
  });
}
