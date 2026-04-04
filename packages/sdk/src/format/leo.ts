/**
 * Leo typed literal builders.
 *
 * These produce the typed literal strings that the Leo ABI expects as inputs
 * to executeTransaction(). Import from @fairdrop/sdk/format.
 *
 * @example
 *   u128('1500000')          → '1500000u128'
 *   leoStruct({ a: u32(0) }) → '{ a: 0u32 }'
 *   aleou128('1.5')          → '1500000u128'
 */

import { parseTokenAmount } from './amount';

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
export function toFieldLiteral(v: string): string {
  return v.endsWith('field') ? v : `${v}field`;
}

/**
 * Serialise a plain JS object into a Leo struct literal string.
 * All values must already be Leo-typed strings (e.g. from u128(), toFieldLiteral()).
 *
 * @example
 *   leoStruct({ amount: u128('100'), nonce: toFieldLiteral('42') })
 *   // → '{ amount: 100u128, nonce: 42field }'
 */
export function leoStruct(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return `{ ${body} }`;
}

/**
 * Convert a human-readable ALEO amount string to a u128 Leo literal in microcredits.
 * @example aleou128('1.5') → '1500000u128'
 */
export function aleou128(v: string): string {
  return u128(parseTokenAmount(v || '0', 6));
}
