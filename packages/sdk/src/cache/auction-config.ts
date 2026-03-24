/**
 * localStorage cache for BaseAuctionConfig values.
 *
 * AuctionConfig is write-once on-chain — the mapping value never changes after
 * create_auction. Cached entries never go stale, so no TTL is needed.
 */

import type { BaseAuctionConfig } from '@fairdrop/types/contracts/auctions';
import { cacheKey, getPersisted, setPersisted } from './persist';

const NS = 'auction-config';

export function getCachedAuctionConfig(auctionId: string): BaseAuctionConfig | null {
  return getPersisted<BaseAuctionConfig>(cacheKey(NS, auctionId));
}

export function setCachedAuctionConfig(auctionId: string, config: BaseAuctionConfig): void {
  setPersisted(cacheKey(NS, auctionId), config);
}

/**
 * Split a list of auction IDs into cache hits and misses.
 * Returns { hit: Record<id, config>, miss: string[] }.
 */
export function partitionAuctionConfigs(ids: string[]): {
  hit:  Record<string, BaseAuctionConfig>;
  miss: string[];
} {
  const hit:  Record<string, BaseAuctionConfig> = {};
  const miss: string[] = [];
  for (const id of ids) {
    const cached = getCachedAuctionConfig(id);
    if (cached) hit[id] = cached;
    else         miss.push(id);
  }
  return { hit, miss };
}
