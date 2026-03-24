import type { TokenSearchParams, TokenListResponse, TokenDetailResponse } from '@fairdrop/types/api';
import { apiFetch, toQueryString } from './api.client.js';

export const tokensService = {
  list: (params: TokenSearchParams): Promise<TokenListResponse> =>
    apiFetch(`/tokens?${toQueryString(params as Record<string, unknown>)}`),

  get: (tokenId: string): Promise<TokenDetailResponse> =>
    apiFetch(`/tokens/${tokenId}/metadata`),
};
