/**
 * localStorage cache for the global and per-creator auction ID index.
 *
 * The linked-list traversal is expensive (N sequential RPC calls).
 * Cache the ordered ID list keyed by the auction count — if count hasn't
 * changed, the list is identical and no chain reads are needed.
 */

import { cacheKey, getPersisted, setPersisted } from './persist.js';

const NS_GLOBAL  = 'auction-index-global';
const NS_CREATOR = 'auction-index-creator';

interface IndexCache {
  count: number;
  ids:   string[];
}

// ── Global auction ID list ────────────────────────────────────────────────────

/** Returns the cached global auction ID list if `count` matches, else null. */
export function getCachedGlobalIndex(count: number): string[] | null {
  const entry = getPersisted<IndexCache>(cacheKey(NS_GLOBAL, 'all'));
  return entry?.count === count ? entry.ids : null;
}

export function setCachedGlobalIndex(count: number, ids: string[]): void {
  setPersisted(cacheKey(NS_GLOBAL, 'all'), { count, ids } satisfies IndexCache);
}

// ── Per-creator auction ID list ───────────────────────────────────────────────

/** Returns the cached creator auction ID list if `count` matches, else null. */
export function getCachedCreatorIndex(address: string, count: number): string[] | null {
  const entry = getPersisted<IndexCache>(cacheKey(NS_CREATOR, address));
  return entry?.count === count ? entry.ids : null;
}

export function setCachedCreatorIndex(address: string, count: number, ids: string[]): void {
  setPersisted(cacheKey(NS_CREATOR, address), { count, ids } satisfies IndexCache);
}
