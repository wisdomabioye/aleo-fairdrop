import type { AuctionView, AuctionListItem } from '@fairdrop/types/domain';
import type {
  Page,
  PaginationParams,
  AuctionListParams,
  AuctionFilterOptions,
  BidResponse,
} from '@fairdrop/types/api';
import { apiFetch, toQueryString } from './api.client.js';

export const auctionsService = {
  list: (params: AuctionListParams): Promise<Page<AuctionListItem>> =>
    apiFetch(`/auctions?${toQueryString(params as Record<string, unknown>)}`),

  get: (id: string): Promise<AuctionView> =>
    apiFetch(`/auctions/${id}`),

  bids: (id: string, p: PaginationParams): Promise<Page<BidResponse>> =>
    apiFetch(`/auctions/${id}/bids?${toQueryString(p as Record<string, unknown>)}`),

  filters: (): Promise<AuctionFilterOptions> =>
    apiFetch('/auctions/filters'),
};
