/**
 * Thin cache helpers built on IStorage.
 *
 * All cache entries are namespaced with CACHE_VERSION so a struct-shape change
 * automatically busts all stale entries.
 *
 * The default storage backend is LocalStorageAdapter (browser). Swap it for
 * tests or Node.js by calling setStorage() before any cache operation:
 *
 *   import { setStorage, MemoryStorageAdapter } from '@fairdrop/sdk/cache';
 *   setStorage(new MemoryStorageAdapter());
 */

import { type IStorage, LocalStorageAdapter } from './storage';

export const CACHE_VERSION = 'v1';

let _storage: IStorage = new LocalStorageAdapter();

/** Replace the storage backend. Affects all subsequent cache operations. */
export function setStorage(storage: IStorage): void {
  _storage = storage;
}

/** Build a namespaced storage key. */
export function cacheKey(namespace: string, id: string): string {
  return `fairdrop:${CACHE_VERSION}:${namespace}:${id}`;
}

// ── BigInt serialization ──────────────────────────────────────────────────────
// JSON.stringify throws on bigint. Use a tagged-object round-trip so that types
// like TokenInfo (which carry totalSupply/maxSupply as bigint) survive storage.
// Non-bigint values pass through unchanged — fully backward-compatible.

const BIGINT_TAG = '__bigint__';

function replacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? { [BIGINT_TAG]: String(v) } : v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v !== null && typeof v === 'object' && BIGINT_TAG in (v as object)) {
    return BigInt((v as Record<string, string>)[BIGINT_TAG]);
  }
  return v;
}

/** Read and JSON-parse a cached value. Returns null on miss or parse error. */
export function getPersisted<T>(key: string): T | null {
  try {
    const raw = _storage.getItem(key);
    return raw ? (JSON.parse(raw, reviver) as T) : null;
  } catch {
    return null;
  }
}

/** JSON-stringify and write a value. Silently ignores quota errors. */
export function setPersisted<T>(key: string, value: T): void {
  _storage.setItem(key, JSON.stringify(value, replacer));
}

/** Remove a single cached entry. */
export function removePersisted(key: string): void {
  _storage.removeItem(key);
}
