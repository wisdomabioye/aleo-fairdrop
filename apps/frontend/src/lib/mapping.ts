/**
 * Thin wrappers around AleoClient.getProgramMappingValue.
 *
 * Problems solved vs calling the client directly:
 *   - Return type is `unknown`; callers had to cast with String(raw) every time.
 *   - Error handling was inconsistent: try/catch, .catch(() => null), or missing entirely.
 *   - Type-specific parsing (u64, u128, bool) was duplicated across call sites.
 *
 * Usage:
 *   const value = await fetchMapping(program, 'my_mapping', key);          // string | null
 *   const amount = await fetchMappingBigInt(program, 'balances', address); // bigint (0n if missing)
 *   const flag   = await fetchMappingBool(program, 'allowed', caller);     // boolean
 */

import { getAleoClient } from '@fairdrop/sdk/client';
import { parseBool, parseU128, u128ToBigInt } from '@fairdrop/sdk/parse';

/**
 * Reads a single mapping entry.
 * Returns the raw string value, or null if the key is absent or the request fails.
 */
export async function fetchMapping(
  program: string,
  mapping: string,
  key:     string,
): Promise<string | null> {
  try {
    const raw = await getAleoClient().getProgramMappingValue(program, mapping, key);
    return raw == null ? null : String(raw);
  } catch {
    return null;
  }
}

/**
 * Reads a u64 or u128 mapping entry and returns a bigint.
 * Returns 0n if the key is absent or unparseable.
 */
export async function fetchMappingBigInt(
  program: string,
  mapping: string,
  key:     string,
): Promise<bigint> {
  const raw = await fetchMapping(program, mapping, key);
  if (!raw) return 0n;
  try { return u128ToBigInt(parseU128(raw)); } catch { return 0n; }
}

/**
 * Reads a boolean mapping entry.
 * Returns false if the key is absent or on network error.
 */
export async function fetchMappingBool(
  program: string,
  mapping: string,
  key:     string,
): Promise<boolean> {
  const raw = await fetchMapping(program, mapping, key);
  return raw != null && parseBool(raw);
}
