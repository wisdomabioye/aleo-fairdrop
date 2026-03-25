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

/** Strip the .private / .public visibility suffix from a Leo record field value. */
export function stripVisibility(value: string): string {
  return value.replace(/\.(private|public)$/, '');
}

/**
 * Parse a Leo record plaintext string into a flat key → value map.
 * Values retain their visibility suffix (.private / .public) — use
 * stripVisibility() before further parsing when needed.
 *
 * Works on both single-line and multi-line record plaintexts:
 *   "{ owner: aleo1..., auction_id: 123field, quantity: 1000u128.private }"
 */
export function parsePlaintext(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /\b(\w+):\s*([^,}\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    result[match[1]!] = match[2]!;
  }
  return result;
}

export function parseBool(raw: string): boolean {
  const v = stripVisibility(raw).trim();
  if (v === 'true')  return true;
  if (v === 'false') return false;
  throw new Error(`[leo/parse] Cannot parse bool: "${raw}"`);
}

/** Parse u8 / u16 / u32 → number. Safe only when value ≤ Number.MAX_SAFE_INTEGER. */
export function parseU8(raw: string): number {
  return parseInt(stripSuffix(stripVisibility(raw)), 10);
}

export function parseU16(raw: string): number {
  return parseInt(stripSuffix(stripVisibility(raw)), 10);
}

export function parseU32(raw: string): number {
  return parseInt(stripSuffix(stripVisibility(raw)), 10);
}

/**
 * Parse u64 → bigint.
 * Use instead of parseU32 when the mapping value is typed u64 in Leo — u64 can exceed
 * Number.MAX_SAFE_INTEGER (2^53-1) so number is not safe. bigint handles the full range.
 */
export function parseU64(raw: string): bigint {
  return BigInt(stripSuffix(stripVisibility(raw)));
}

/**
 * Parse u128 → decimal string.
 * Returned as string to preserve precision — u128 exceeds JS safe integer range.
 * Use u128ToBigInt() when you need to perform arithmetic or comparisons.
 */
export function parseU128(raw: string): string {
  return stripSuffix(stripVisibility(raw));
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
  return stripVisibility(raw).trim();
}

/** Return field value with type suffix stripped. */
export function parseField(raw: string): string {
  return stripSuffix(stripVisibility(raw));
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
 * ── Private-record field accessors ────────────────────────────────────────────
 *
 * Aleo wallet adapters return private records as plain JS objects whose shape
 * is one of:
 *   { data: { field_name: "value", … }, … }   (most adapters)
 *   { field_name: "value", … }                 (some adapters / shimmed records)
 *
 * These helpers normalise both shapes so callers don't need to know which
 * adapter is in use.  They are intentionally simple — if a field is absent or
 * cannot be parsed the helpers return a safe zero value instead of throwing,
 * matching the "skip on error" pattern used throughout the transaction flows.
 */

/** Return the string value of a named field from a record object. */
export function recStr(rec: Record<string, unknown>, key: string): string {
  const data = (rec.data ?? rec) as Record<string, string>;
  return String(data[key] ?? '');
}

/**
 * Return a Leo field literal for a named field.
 * Ensures the value always ends with the "field" suffix.
 */
export function recField(rec: Record<string, unknown>, key: string): string {
  const raw = stripSuffix(recStr(rec, key));
  return raw ? (raw.endsWith('field') ? raw : `${raw}field`) : '';
}

/** Return a u128 field parsed to bigint (0n on failure). */
export function recU128(rec: Record<string, unknown>, key: string): bigint {
  try { return BigInt(stripSuffix(recStr(rec, key))); } catch { return 0n; }
}

/** Return a u32 / u64 field parsed to number (0 on failure). */
export function recU32(rec: Record<string, unknown>, key: string): number {
  const n = parseInt(stripSuffix(recStr(rec, key)), 10);
  return isNaN(n) ? 0 : n;
}

/** Return true if the record's data object contains the given key. */
export function hasRecordKey(rec: Record<string, unknown>, key: string): boolean {
  const data = (rec.data ?? rec) as Record<string, unknown>;
  return key in data && data[key] !== undefined && data[key] !== null;
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
