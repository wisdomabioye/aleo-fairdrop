import { useQuery } from '@tanstack/react-query';
import { creatorsService } from '@/services/creators.service';

export function useCreatorReputation(address: string | undefined) {
  return useQuery({
    queryKey:  ['creator-reputation', address],
    queryFn:   () => creatorsService.get(address!),
    enabled:   !!address,
    staleTime: 60_000,
    retry:     false,  // 404 = no record — don't retry
  });
}
