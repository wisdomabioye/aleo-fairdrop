/**
 * fairdrop_sealed.aleo — TypeScript types.
 *
 * Sealed-bid auction: bidders commit a hash before the commit deadline,
 * then reveal their bids in a separate reveal phase.
 *
 * @todo Define fully when fairdrop_sealed.aleo is implemented.
 */

import type { Field, U128, U32, U16 } from '../../primitives/scalars.js';
import type { BaseAuctionConfig, AuctionState, BaseBid } from './common.js';

export interface SealedAuctionConfig extends BaseAuctionConfig {
  commit_deadline: U32;   // block height after which commits are rejected
  reveal_deadline: U32;   // block height after which reveals are rejected
  max_price:       U128;  // ceiling price used to size the escrow commitment
  price_precision: U16;   // denominator for price fractions
}

/**
 * Sealed bid record. Differs from BaseBid — quantity and price are hidden
 * inside the commitment until reveal.
 */
export interface SealedBid extends BaseBid {
  commitment: Field; // BHP256(SealedBidKey{bidder, quantity, price, salt})
}

export type { AuctionState };

export const SEALED_PROGRAM_ID   = 'fairdrop_sealed.aleo' as const;
export const SEALED_PROGRAM_SALT = '2field' as const;
