/**
 * Thin localStorage cache helpers.
 *
 * All cache entries are namespaced with CACHE_VERSION so a struct-shape change
 * (new fields added to a mapping) automatically busts all stale entries.
 *
 * Usage pattern:
 *   const k = cacheKey('auction-config', auctionId);
 *   const hit = getPersisted<BaseAuctionConfig>(k);
 *   if (hit) return hit;
 *   const fresh = await fetchFromChain();
 *   setPersisted(k, fresh);
 *   return fresh;
 */

export const CACHE_VERSION = 'v1';

/** Build a namespaced localStorage key. */
export function cacheKey(namespace: string, id: string): string {
  return `fairdrop:${CACHE_VERSION}:${namespace}:${id}`;
}

/** Read and JSON-parse a cached value. Returns null on miss or parse error. */
export function getPersisted<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** JSON-stringify and write a value. Silently ignores quota errors. */
export function setPersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — cache is best-effort
  }
}

/** Remove a single cached entry. */
export function removePersisted(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}
