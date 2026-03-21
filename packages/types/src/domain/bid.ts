/**
 * Domain-level bid and claim types.
 */

import type { AuctionType } from './auction.js';

/** Claim lifecycle state for a winning bid after close_auction. */
export enum ClaimStatus {
  /** Auction not yet cleared — no claim available. */
  Pending   = 'pending',
  /** Cleared, bidder has not yet claimed. */
  Claimable = 'claimable',
  /** claim or claim_vested has been called — tokens delivered. */
  Claimed   = 'claimed',
  /** Auction voided — claim_voided available. */
  Refundable = 'refundable',
  /** claim_voided called — payment returned. */
  Refunded  = 'refunded',
}

/**
 * Enriched bid view.
 * Derived from the private Bid record + on-chain AuctionState after clearing.
 */
export interface BidView {
  /** Hex-encoded auction_id. */
  auctionId:      string;
  auctionType:    AuctionType;

  quantity:       bigint;
  /** microcredits deposited at bid time. */
  paymentAmount:  bigint;

  /** Set after close_auction; null until then. */
  clearingPrice:  bigint | null;
  /** quantity × clearingPrice / saleScale — null until cleared. */
  cost:           bigint | null;
  /** paymentAmount − cost — null until cleared. */
  refund:         bigint | null;

  claimStatus:    ClaimStatus;
  vestEnabled:    boolean;

  /** Block at which the Bid record was created (from indexer). */
  placedAtBlock:  number;
  placedAt:       Date | null;
}

/**
 * Releasable amount for a vesting position at a given block height.
 * Computed client-side from the VestedAllocation record.
 */
export interface ReleasableAmount {
  total:      bigint;
  claimed:    bigint;
  releasable: bigint;  // min(vested_so_far, total) − claimed
  fullyVested: boolean;
  cliffReached: boolean;
}
