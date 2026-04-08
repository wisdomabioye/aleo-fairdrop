import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analytics.service';
import type {
  VolumePeriod,
  AuctionTypeMetrics,
  FillDistribution,
  AttributeBreakdown,
} from '@fairdrop/types/api';

const STALE_TIME = 5 * 60_000; // 5 min — analytics data changes slowly

export function useVolumeByPeriod(bucket: 'weekly' | 'monthly') {
  return useQuery<VolumePeriod[]>({
    queryKey:  ['analytics-volume', bucket],
    queryFn:   () => analyticsService.volumeByPeriod(bucket),
    staleTime: STALE_TIME,
  });
}

export function useAuctionTypeMetrics() {
  return useQuery<AuctionTypeMetrics[]>({
    queryKey:  ['analytics-by-type'],
    queryFn:   () => analyticsService.byType(),
    staleTime: STALE_TIME,
  });
}

export function useFillDistribution() {
  return useQuery<FillDistribution>({
    queryKey:  ['analytics-fill-distribution'],
    queryFn:   () => analyticsService.fillDistribution(),
    staleTime: STALE_TIME,
  });
}

export function useAttributeBreakdown() {
  return useQuery<AttributeBreakdown>({
    queryKey:  ['analytics-attributes'],
    queryFn:   () => analyticsService.attributes(),
    staleTime: STALE_TIME,
  });
}
