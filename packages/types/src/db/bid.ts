/**
 * Database row shapes for bids and vesting positions.
 * Bids are indexed from TransitionEvents; the record plaintext is never stored
 * (it is encrypted on-chain and only readable by the owner).
 */
export interface BidRow {
  /** Synthetic PK: hex(bidder_key) — BHP256(BidderKey{bidder, auction_id}). */
  bidderKey:     string;
  auctionId:     string;
  programId:     string;

  quantity:      string;       // u128 as decimal string
  paymentAmount: string;       // microcredits at bid time
  placedAtBlock: number;
  placedAt:      Date;

  // Populated after close_auction
  clearingPrice: string | null;
  cost:          string | null; // quantity * clearingPrice / saleScale
  refund:        string | null; // paymentAmount - cost

  // Claim state
  claimed:       boolean;
  claimedAt:     Date | null;
  refunded:      boolean;      // claim_voided
  refundedAt:    Date | null;
}

/** Vesting position — one per (bidder, auction_id) when vest_enabled. */
export interface VestingRow {
  bidderKey:       string;
  auctionId:       string;
  saleTokenId:     string;
  totalAmount:     string;
  claimed:         string;     // cumulative released
  endedAtBlock:    number;
  cliffBlocks:     number;
  vestEndBlocks:   number;
  fullyVested:     boolean;
  createdAt:       Date;
  updatedAt:       Date;
}
