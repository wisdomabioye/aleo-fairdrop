import type {
  VolumePeriod,
  AuctionTypeMetrics,
  FillDistribution,
  AttributeBreakdown,
} from '@fairdrop/types/api';
import { apiFetch } from './api.client.js';

export const analyticsService = {
  volumeByPeriod: (bucket: 'weekly' | 'monthly'): Promise<VolumePeriod[]> =>
    apiFetch(`/analytics/volume-by-period?bucket=${bucket}`),

  byType: (): Promise<AuctionTypeMetrics[]> =>
    apiFetch('/analytics/by-type'),

  fillDistribution: (): Promise<FillDistribution> =>
    apiFetch('/analytics/fill-distribution'),

  attributes: (): Promise<AttributeBreakdown> =>
    apiFetch('/analytics/attributes'),
};
