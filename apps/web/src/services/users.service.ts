import type {
  UserProfileResponse,
  UserBidsResponse,
  UserAuctionsResponse,
  UserVestingResponse,
} from '@fairdrop/types/api';
import type { PaginationParams } from '@fairdrop/types/api';
import { apiFetch, toQueryString } from './api.client.js';

export const usersService = {
  profile: (address: string): Promise<UserProfileResponse> =>
    apiFetch(`/users/${address}`),

  bids: (address: string, p?: PaginationParams): Promise<UserBidsResponse> =>
    apiFetch(`/users/${address}/bids${p ? `?${toQueryString(p as Record<string, unknown>)}` : ''}`),

  auctions: (address: string, p?: PaginationParams): Promise<UserAuctionsResponse> =>
    apiFetch(`/users/${address}/auctions${p ? `?${toQueryString(p as Record<string, unknown>)}` : ''}`),

  vesting: (address: string, p?: PaginationParams): Promise<UserVestingResponse> =>
    apiFetch(`/users/${address}/vesting${p ? `?${toQueryString(p as Record<string, unknown>)}` : ''}`),
};
