import type { CreatorReputationResponse } from '@fairdrop/types/domain';
import type { Page } from '@fairdrop/types/api';
import { apiFetch, toQueryString } from './api.client.js';

export const creatorsService = {
  get: (address: string): Promise<CreatorReputationResponse> =>
    apiFetch(`/creators/${address}`),

  list: (limit = 20): Promise<{ items: CreatorReputationResponse[] }> =>
    apiFetch(`/creators?${toQueryString({ limit })}`),

  auctions: (address: string, params?: Record<string, unknown>): Promise<Page<unknown>> =>
    apiFetch(`/auctions?creator=${address}&${toQueryString(params ?? {})}`),
};
