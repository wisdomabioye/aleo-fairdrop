import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import type { DashboardStats } from '@fairdrop/types/api';

export function useDashboardStats(staleTime = 60_000) {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn:  () => dashboardService.stats(),
    staleTime,
  });
}
