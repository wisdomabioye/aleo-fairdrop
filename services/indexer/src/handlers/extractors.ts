/**
 * Auction ID extraction strategies.
 *
 * Each extractor resolves an auction_id from a transition + its finalize ops.
 * The processor calls the appropriate extractor per transition (configured in
 * createProgramHandlerMap).
 *
 * Why three different strategies:
 *   fromPublicInput  — auction_id is an explicit public field input (most transitions)
 *   fromFinalizeKey  — auction_id is NOT a public input; it was computed inside the
 *                      transition body and written as a mapping key in finalize.
 *                      Used for: create_auction, reveal_bid (sealed).
 */
import { parseField }                             from '@fairdrop/sdk/parse';
import type { AleoTransition, FinalizeOperation } from '../types/aleo.js';
import type { AuctionIdExtractor }                from './types.js';

/**
 * Scan transition inputs for the first public field-typed value.
 *
 * Handles transitions where the Bid record is inputs[0] (private, no value)
 * and auction_id is a later positional input — e.g. place_bid_private.
 */
export const auctionIdFromPublicInput: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:       FinalizeOperation[],
): string | null => {
  for (const input of transition.inputs) {
    if (input.value?.trim().endsWith('field')) {
      return parseField(input.value);
    }
  }
  return null;
};

/**
 * Scan finalize mapping ops for the first field-typed key that is not the
 * protocol treasury sentinel (0field).
 *
 * The Aleo REST API exposes plaintext keys in finalize ops, but mapping_id is
 * a field hash — NOT the human-readable mapping name. Matching on the name via
 * includes() would never work. Instead we match on key shape:
 *
 *   - creator_nonces key  = "aleo1..."      (address — doesn't end with 'field')
 *   - protocol_treasury   = "0field"        (excluded explicitly)
 *   - auction_configs key = "<auction_id>field"  ← this is what we want
 *   - auction_states key  = "<auction_id>field"  ← same key, different mapping
 *
 * Both create_auction and reveal_bid write the auction_id as the key to at
 * least one mapping, so the first matching op yields the correct auction_id.
 */
export const auctionIdFromFinalizeKey: AuctionIdExtractor = (
  _transition: AleoTransition,
  ops:         FinalizeOperation[],
): string | null => {
  for (const op of ops) {
    const k = op.key_id?.trim();
    if (k && k.endsWith('field') && k !== '0field') {
      return parseField(k);
    }
  }
  return null;
};



export const parseAuctionIdFromTransition: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:         FinalizeOperation[],
): string | null => {
  const match = String(JSON.stringify(transition)).match(
    /auction_id:\s*([0-9]+field)/
  );
  const auctionId = match ? match[1] : null;
  if (auctionId) {
    return parseField(auctionId)
  }
  return auctionId
};


