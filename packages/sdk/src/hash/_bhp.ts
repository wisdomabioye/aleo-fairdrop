/**
 * Internal BHP256 helper. Not exported from the package.
 * All public hash functions in keys.ts delegate here.
 *
 * Manages WASM object lifetimes explicitly — free() must be called on every
 * object created by @provablehq/sdk to avoid memory leaks.
 */

import { BHP256, Plaintext } from '@provablehq/sdk';

/**
 * Hash an arbitrary Leo struct literal string to a field element.
 * The caller is responsible for serialising the struct correctly —
 * field order must match the Leo struct definition exactly.
 */
export function hashStruct(leoStructLiteral: string): string {
  const struct = Plaintext.fromString(leoStructLiteral);
  const bits   = struct.toBitsLe();
  const bhp    = new BHP256();
  const field  = bhp.hash(bits);
  const result = field.toString();
  field.free();
  bhp.free();
  struct.free();
  return result;
}
