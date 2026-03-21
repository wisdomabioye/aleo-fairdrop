/**
 * Minimal Leo value parser.
 *
 * Leo/Aleo serialises on-chain values as strings like:
 *   - Primitives: "100u128", "aleo1...", "12345field", "true", "0u8"
 *   - Structs:    "{ field1: value1, field2: value2 }"
 *
 * This module parses those strings into plain JS objects without a full grammar.
 * Sufficient for the indexer — not a general-purpose Leo parser.
 */

/** Strip a Leo type suffix and return the plain value string. */
export function stripSuffix(raw: string): string {
  // Matches u8, u16, u32, u64, u128, i8, ..., field, group, scalar, bool, address
  return raw.trim().replace(/(?:u\d+|i\d+|field|group|scalar)$/, '').trim();
}

/** Parse a Leo bool string → boolean. */
export function parseBool(raw: string): boolean {
  const v = raw.trim();
  if (v === 'true')  return true;
  if (v === 'false') return false;
  throw new Error(`[leo] Cannot parse bool: ${raw}`);
}

/** Parse a Leo u32/u64 string → number. Safe for values ≤ Number.MAX_SAFE_INTEGER. */
export function parseU32(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

/** Parse a Leo u16 string → number. */
export function parseU16(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

/** Parse a Leo u8 string → number. */
export function parseU8(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

/** Parse a Leo u128 string → BigInt string (preserves precision). */
export function parseU128(raw: string): string {
  return stripSuffix(raw);
}

/** Return the address string as-is (aleo1...). */
export function parseAddress(raw: string): string {
  return raw.trim();
}

/** Return the field string with suffix stripped. */
export function parseField(raw: string): string {
  return stripSuffix(raw);
}

/**
 * Parse a Leo struct string into a flat key→value record.
 *
 * Input:  "{ key1: val1, key2: val2, nested: { a: b } }"
 * Output: { key1: 'val1', key2: 'val2', nested: '{ a: b }' }
 *
 * Nested structs are kept as raw strings — call parseStruct recursively if needed.
 */
export function parseStruct(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error(`[leo] Expected struct, got: ${trimmed.slice(0, 80)}`);
  }
  const inner = trimmed.slice(1, -1).trim();
  const result: Record<string, string> = {};

  let depth = 0;
  let key   = '';
  let value = '';
  let inKey = true;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (inKey) {
      if (ch === ':') {
        inKey = false;
        value = '';
      } else {
        key += ch;
      }
    } else {
      if (ch === ',' && depth === 0) {
        result[key.trim()] = value.trim();
        key   = '';
        value = '';
        inKey = true;
      } else {
        value += ch;
      }
    }
  }

  // Last key-value pair (no trailing comma)
  if (key.trim()) result[key.trim()] = value.trim();

  return result;
}
