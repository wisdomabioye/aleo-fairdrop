/**
 * Internal RPC helper — wraps getProgramMappingValue with null-on-error semantics.
 * Not exported from the package.
 */

import { getAleoClient } from '../client';

export async function getMappingValue(
  programId: string,
  mapping:   string,
  key:       string,
): Promise<string | null> {
  try {
    const value = await getAleoClient().getProgramMappingValue(programId, mapping, key);
    return value ? String(value) : null;
  } catch {
    return null;
  }
}
