/**
 * Internal BHP256 helper. Not exported from the package.
 * All public hash functions in keys.ts delegate here.
 *
 * Manages WASM object lifetimes explicitly — free() must be called on every
 * object created by @provablehq/sdk to avoid memory leaks.
 *
 * The BHP256 instance is cached because its constructor precomputes elliptic
 * curve lookup tables, which is the dominant cost per hash call.
 */

import { BHP256, Plaintext } from '@provablehq/sdk';

let _bhp: BHP256 | null = null;

function getBhp(): BHP256 {
  if (!_bhp) _bhp = new BHP256();
  return _bhp;
}

/**
 * Hash an arbitrary Leo struct literal string to a field element.
 * The caller is responsible for serialising the struct correctly —
 * field order must match the Leo struct definition exactly.
 */
export function hashStruct(leoStructLiteral: string): string {
  const struct = Plaintext.fromString(leoStructLiteral);
  const bits   = struct.toBitsLe();
  const field  = getBhp().hash(bits);
  const result = field.toString();
  field.free();
  struct.free();
  return result;
}
