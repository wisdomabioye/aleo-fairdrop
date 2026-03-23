/**
 * In-process TTL cache for protocol config.
 *
 * The config row changes only when a set_* transition is indexed — very rarely.
 * A 5-minute TTL means stale reads last at most 5 min after an admin change,
 * which is acceptable for non-critical config values.
 */
import type { ProtocolConfig } from '@fairdrop/types/domain';

interface CacheEntry {
  data:   ProtocolConfig;
  expiry: number;
}

let cached: CacheEntry | null = null;
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedConfig(): ProtocolConfig | null {
  if (cached && cached.expiry > Date.now()) return cached.data;
  return null;
}

export function setCachedConfig(data: ProtocolConfig): void {
  cached = { data, expiry: Date.now() + CONFIG_TTL_MS };
}
