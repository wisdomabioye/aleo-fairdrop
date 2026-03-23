/**
 * BHP256 hash utilities for computing Leo mapping keys client-side.
 *
 * These mirror on-chain BHP256::hash_to_field calls used in Fairdrop contracts.
 * Must only be called in browser environments where @provablehq/sdk WASM is loaded.
 */

import { BHP256, Plaintext } from '@provablehq/sdk';

function hashStruct(source: string): string {
  const struct = Plaintext.fromString(source);
  const bits   = struct.toBitsLe();
  const bhp    = new BHP256();
  const field  = bhp.hash(bits);
  const key    = field.toString();
  field.free();
  bhp.free();
  struct.free();
  return key;
}

/**
 * Compute the sealed-auction commitment key for a bidder.
 * Mirrors: BHP256::hash_to_field(BidderKey { bidder, auction_id })
 *
 * Used as the key in `pending_commits` and as input to `slash_unrevealed`.
 */
export function computeBidderKey(bidder: string, auctionId: string): string {
  return hashStruct(`{ bidder: ${bidder}, auction_id: ${auctionId} }`);
}

/**
 * Compute a referral list enumeration key.
 * Mirrors: BHP256::hash_to_field(RefListKey { code_id, index })
 *
 * Used to enumerate uncredited bidder_keys from the `referral_list` mapping.
 */
export function computeRefListKey(codeId: string, index: bigint): string {
  return hashStruct(`{ code_id: ${codeId}, index: ${index}u64 }`);
}
