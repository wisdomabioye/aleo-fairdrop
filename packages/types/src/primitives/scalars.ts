/**
 * Branded Aleo primitive types.
 *
 * Leo on-chain values arrive as strings in JSON payloads (SDK, indexer, RPC).
 * Branding preserves semantic meaning at compile time and prevents accidental
 * substitution — e.g. passing an Address where a Field is expected.
 *
 * Sizing rationale:
 *   U8  / U16 / U32  max ≤ 4 294 967 295  < Number.MAX_SAFE_INTEGER → plain number
 *   U64            max   18 446 744 073 709 551 615 > MAX_SAFE_INTEGER → string
 *   U128           max   3.4 × 10^38                                  → string
 *   Field          254-bit prime field element                         → string
 */

declare const _brand: unique symbol;
type Brand<T, B> = T & { readonly [_brand]: B };

/** Aleo field element — decimal string representation of a 254-bit value. */
export type Field = Brand<string, 'Field'>;

/** Aleo address — bech32 "aleo1…" format, 63 characters. */
export type Address = Brand<string, 'Address'>;

/** Leo u64 as a decimal string (exceeds Number.MAX_SAFE_INTEGER). */
export type U64 = Brand<string, 'U64'>;

/** Leo u128 as a decimal string (exceeds Number.MAX_SAFE_INTEGER). */
export type U128 = Brand<string, 'U128'>;

/** Leo u32 — fits safely in JS number (max 4 294 967 295). */
export type U32 = number;

/** Leo u16 — fits safely in JS number (max 65 535). */
export type U16 = number;

/** Leo u8 — fits safely in JS number (max 255). */
export type U8 = number;

/** Leo bool. */
export type Bool = boolean;

// ── Unsafe casts (use only after external validation) ────────────────────────

/** Cast a validated decimal string to Field. */
export const asField = (s: string): Field => s as Field;

/** Cast a validated bech32 string to Address. */
export const asAddress = (s: string): Address => s as Address;

/** Cast a validated decimal string to U64. */
export const asU64 = (s: string): U64 => s as U64;

/** Cast a validated decimal string to U128. */
export const asU128 = (s: string): U128 => s as U128;
