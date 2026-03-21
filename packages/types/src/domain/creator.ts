/**
 * Domain-level creator profile and reputation types.
 */

/** Enriched creator profile combining on-chain reputation with display data. */
export interface CreatorProfile {
  address:         string;
  /** Display name from off-chain metadata service (null if not set). */
  displayName:     string | null;
  avatarUrl:       string | null;

  // On-chain reputation from fairdrop_proof.aleo/reputation mapping
  totalAuctions:   number;
  filledAuctions:  number;
  totalVolume:     bigint;  // microcredits

  /** Derived: filledAuctions / totalAuctions, null if totalAuctions = 0. */
  fillRate:        number | null;
}

/** Per-auction revenue summary for a creator (from AuctionState). */
export interface CreatorAuctionRevenue {
  auctionId:      string;
  creatorRevenue: bigint;
  protocolFee:    bigint;
  withdrawn:      bigint;
  withdrawable:   bigint;  // creatorRevenue − withdrawn
}
