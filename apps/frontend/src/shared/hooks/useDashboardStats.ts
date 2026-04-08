import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import type { DashboardStats } from '@fairdrop/types/api';

const STALE_TIME      = 30_000;
const REFETCH_INTERVAL = 30_000;

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey:        ['dashboard-stats'],
    queryFn:         () => dashboardService.stats(),
    staleTime:       STALE_TIME,
    refetchInterval: REFETCH_INTERVAL,
  });
}
