/**
 * Display formatting utilities — pure functions, no I/O.
 * Safe in both Node and browser environments.
 *
 * Re-exports blocks and url helpers so callers import from a single path:
 *   import { truncateAddress, estimateDate, sanitizeExternalUrl } from '@fairdrop/sdk/format'
 */

export { estimateDate, estimateMinutes } from './blocks';
export { sanitizeExternalUrl } from './url';

// ── Address / field ────────────────────────────────────────────────────────────

/** Shorten a bech32 address for display: "aleo1abc...xyz". */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Strip `field` suffix and truncate long field elements for display. */
export function formatField(field: string): string {
  const val = field.endsWith('field') ? field.slice(0, -5) : field;
  if (val.length > 16) return `${val.slice(0, 8)}...${val.slice(-6)}`;
  return val;
}

// ── Token amounts ─────────────────────────────────────────────────────────────

/**
 * Format a raw on-chain bigint amount to a locale string respecting decimals.
 * @example formatAmount(1_500_000n, 6) → "1.5"
 */
export function formatAmount(amount: bigint, decimals = 0): string {
  if (decimals === 0) return amount.toLocaleString();
  const divisor = 10n ** BigInt(decimals);
  const whole   = amount / divisor;
  const frac    = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

/**
 * Parse a human-readable token amount string to a raw on-chain bigint.
 * Inverse of formatAmount.
 * @example parseTokenAmount("1.5", 6) → 1_500_000n
 */
export function parseTokenAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  const whole = match[1]!;
  const frac  = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  try {
    return BigInt(whole + frac);
  } catch {
    return 0n;
  }
}

/**
 * Convert a raw bigint amount to a plain numeric string (no locale separators).
 * Used for input field pre-population where commas would be invalid.
 */
export function toPlainAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole   = amount / divisor;
  const frac    = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

// ── Leo literal helpers ────────────────────────────────────────────────────────
//
// These produce the typed literal strings that the Leo ABI expects as inputs
// to executeTransaction().  They live here (not in app code) so any package
// that needs to build on-chain inputs can import them from a single place.
//
// Usage:
//   import { u128, u32, leoStruct } from '@fairdrop/sdk/format';
//   u128('1500000')          → '1500000u128'
//   leoStruct({ a: u32(0) }) → '{ a: 0u32 }'

export const u128 = (v: string | bigint | number): string => `${v}u128`;
export const u64  = (v: string | bigint | number): string => `${v}u64`;
export const u32  = (v: string | bigint | number): string => `${v}u32`;
export const u16  = (v: string | bigint | number): string => `${v}u16`;
export const u8   = (v: string | bigint | number): string => `${v}u8`;
export const i64  = (v: string | bigint | number): string => `${v}i64`;

/**
 * Ensure a value already has a `field` suffix.
 * Pass through if it already ends with "field", otherwise append it.
 */
export function toField(v: string): string {
  return v.endsWith('field') ? v : `${v}field`;
}

/**
 * Serialise a plain JS object into a Leo struct literal string.
 * All values must already be Leo-typed strings (e.g. from u128(), toField()).
 *
 * @example
 *   leoStruct({ amount: u128('100'), nonce: toField('42') })
 *   // → '{ amount: 100u128, nonce: 42field }'
 */
export function leoStruct(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return `{ ${body} }`;
}

/** Convert an ALEO human-unit string to a u128 Leo literal in microcredits. */
export function aleou128(v: string): string {
  return u128(parseTokenAmount(v || '0', 6));
}
