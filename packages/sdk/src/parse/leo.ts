/**
 * Leo/Aleo value parser — shared between indexer (Node) and frontend (browser).
 *
 * Leo serialises on-chain values as strings:
 *   Primitives: "100u128"  "aleo1..."  "12345field"  "true"  "0u8"
 *   Structs:    "{ key1: value1, key2: { nested: val } }"
 *
 * All parsers are pure functions with no I/O — safe to use in any environment.
 */

/** Strip a Leo numeric/field type suffix and return the bare value string. */
export function stripSuffix(raw: string): string {
  return raw.trim().replace(/(?:u\d+|i\d+|field|group|bool|scalar)$/, '').trim();
}

export function parseBool(raw: string): boolean {
  const v = raw.trim();
  if (v === 'true')  return true;
  if (v === 'false') return false;
  throw new Error(`[leo/parse] Cannot parse bool: "${raw}"`);
}

/** Parse u8 / u16 / u32 → number. Safe only when value ≤ Number.MAX_SAFE_INTEGER. */
export function parseU8(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

export function parseU16(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

export function parseU32(raw: string): number {
  return parseInt(stripSuffix(raw), 10);
}

/**
 * Parse u64 → bigint.
 * Use instead of parseU32 when the mapping value is typed u64 in Leo — u64 can exceed
 * Number.MAX_SAFE_INTEGER (2^53-1) so number is not safe. bigint handles the full range.
 */
export function parseU64(raw: string): bigint {
  return BigInt(stripSuffix(raw));
}

/**
 * Parse u128 → decimal string.
 * Returned as string to preserve precision — u128 exceeds JS safe integer range.
 * Use u128ToBigInt() when you need to perform arithmetic or comparisons.
 */
export function parseU128(raw: string): string {
  return stripSuffix(raw);
}

/**
 * Convert a u128 decimal string (as returned by parseU128) to bigint.
 * Pattern: const amount = u128ToBigInt(parseU128(raw))
 */
export function u128ToBigInt(s: string): bigint {
  return BigInt(s);
}

/** Return address as-is (aleo1...). */
export function parseAddress(raw: string): string {
  return raw.trim();
}

/** Return field value with type suffix stripped. */
export function parseField(raw: string): string {
  return stripSuffix(raw);
}

/**
 * Returns true if s is a valid Leo field literal.
 * Valid form: one or more decimal digits followed by the "field" suffix.
 * e.g. "7438291047381943field" → true   "abc" → false   "" → false
 * Used as a URL-param guard before making RPC calls with untrusted input.
 */
export function isValidField(s: string): boolean {
  return /^\d+field$/.test(s.trim());
}

/**
 * Convert a Leo field literal to a 0x-prefixed hex string.
 * Useful for compact display of auction IDs and other large field values.
 * e.g. "255field" → "0xff"
 */
export function fieldToHex(s: string): string {
  return '0x' + BigInt(stripSuffix(s)).toString(16);
}

/**
 * Parse a Leo struct string into a flat Record<string, string>.
 *
 * Input:  "{ a: 1u64, b: aleo1..., c: { x: 2u8 } }"
 * Output: { a: '1u64', b: 'aleo1...', c: '{ x: 2u8 }' }
 *
 * Nested structs are kept as raw strings — call parseStruct recursively when needed.
 */
export function parseStruct(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error(`[leo/parse] Expected struct string, got: "${trimmed.slice(0, 80)}"`);
  }

  const inner = trimmed.slice(1, -1).trim();
  const result: Record<string, string> = {};

  let depth = 0;
  let key   = '';
  let value = '';
  let inKey = true;

  for (const ch of inner) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (inKey) {
      if (ch === ':') { inKey = false; value = ''; }
      else              key += ch;
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

  if (key.trim()) result[key.trim()] = value.trim();

  return result;
}
