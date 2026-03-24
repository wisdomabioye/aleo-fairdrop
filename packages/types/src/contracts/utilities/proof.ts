/**
 * fairdrop_proof.aleo — TypeScript types.
 *
 * Issues participation receipts (sybil-resistance) and tracks creator reputation.
 * Bidder identity is pseudonymous: only BHP256(bidder, auction_id) stored on-chain.
 */

import type { Field, Address, U128, U64, Bool } from '../../primitives/scalars';

/**
 * Private record proving participation in an auction.
 * Single-issuance per (bidder, auction_id): second issue_receipt call reverts.
 * Used to prevent double-bidding without revealing bidder identity.
 */
export interface ParticipationReceipt {
  owner:           Address; // private — bidder's address (never in finalize)
  auction_id:      Field;
  commitment_hash: Field;   // 0field for non-sealed auctions
}

/**
 * Creator reputation stats — aggregated across all auctions by this creator.
 * Stored in `reputation` mapping keyed by creator address.
 */
export interface CreatorReputation {
  total_auctions:  U64;
  filled_auctions: U64;
  total_volume:    U128;
}

/** `participated` mapping value — BHP256(BidderKey) => bool. */
export type ParticipatedState = Bool;

/** Input to `issue_receipt` — called from all bid transitions. */
export interface IssueReceiptInput {
  auction_id:      Field;
  commitment_hash: Field;  // 0field for non-sealed auctions
  bidder_key:      Field;  // BHP256(BidderKey{bidder, auction_id}) — computed off-chain
}

/**
 * Input to `update_reputation` — called from close_auction.
 * creator is a D11 param: passed publicly and validated in finalize.
 */
export interface UpdateReputationInput {
  creator: Address;
  filled:  boolean;
  volume:  U128;
}

