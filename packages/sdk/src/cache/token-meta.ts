/**
 * localStorage cache for TokenInfo from token_registry.aleo.
 *
 * Token metadata is write-once on-chain — registered_tokens[tokenId] is set
 * at register_token time and never mutated. No TTL needed.
 */

import type { TokenInfo } from '@fairdrop/types/domain';
import { cacheKey, getPersisted, setPersisted } from './persist.js';

const NS = 'token-meta';

export function getCachedTokenInfo(tokenId: string): TokenInfo | null {
  return getPersisted<TokenInfo>(cacheKey(NS, tokenId));
}

export function setCachedTokenInfo(tokenId: string, info: TokenInfo): void {
  setPersisted(cacheKey(NS, tokenId), info);
}
