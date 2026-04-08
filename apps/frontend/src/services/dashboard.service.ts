import type { DashboardStats } from '@fairdrop/types/api';
import { apiFetch } from './api.client.js';

export const dashboardService = {
  stats: (): Promise<DashboardStats> => apiFetch('/dashboard/stats'),
};
