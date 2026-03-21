import type { TokenMetadata } from '../domain/token.js';
import type { Page } from './pagination.js';

export interface TokenSearchParams {
  query?:    string;
  verified?: boolean;
  page?:     number;
  pageSize?: number;
}

export type TokenListResponse = Page<TokenMetadata>;
export type TokenDetailResponse = TokenMetadata;
