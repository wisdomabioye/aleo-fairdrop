import { useQuery } from '@tanstack/react-query';
import { configService } from '@/services/config.service';

export function useProtocolConfig() {
  return useQuery({
    queryKey: ['protocolConfig'],
    queryFn:  configService.get,
    staleTime: 5 * 60 * 1000,
  });
}
