import { useQuery } from '@tanstack/react-query';
import { AuctionStatus } from '@fairdrop/types/domain';
import { auctionsService } from '@/services/auctions.service';

export function useAuction(id: string | undefined) {
  return useQuery({
    queryKey: ['auction', id],
    queryFn:  () => auctionsService.get(id!),
    enabled:  !!id,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === AuctionStatus.Cleared || status === AuctionStatus.Voided) return false;
      return 30_000;
    },
  });
}
