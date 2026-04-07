/**
 * Domain-level creator reputation types.
 */

export type CreatorTier = 'none' | 'bronze' | 'silver' | 'gold';

/**
 * Compute the creator trust tier from aggregated on-chain stats.
 * Single source of truth — used by the API mapper and frontend hook.
 *
 * Thresholds:
 *   Gold:   filled ≥ 10 AND fill rate ≥ 90%
 *   Silver: filled ≥ 3  AND fill rate ≥ 70%
 *   Bronze: filled ≥ 1
 *   None:   no filled auctions
 */
export function computeTier(auctionsRun: number, filled: number): CreatorTier {
  const fillRate = auctionsRun > 0 ? filled / auctionsRun : 0;
  if (filled >= 10 && fillRate >= 0.90) return 'gold';
  if (filled >= 3  && fillRate >= 0.70) return 'silver';
  if (filled >= 1)                      return 'bronze';
  return 'none';
}

/** On-chain reputation stats for a creator — surfaced on AuctionView and creator pages. */
export interface CreatorReputationStats {
  auctionsRun:        number;
  filledAuctions:     number;
  /** Cumulative total_payments in microcredits, as a decimal string (u128). */
  volumeMicrocredits: string;
  /** filledAuctions / auctionsRun (0–1). */
  fillRate:           number;
  tier:               CreatorTier;
}

/** Full creator response from GET /creators/:address. */
export interface CreatorReputationResponse extends CreatorReputationStats {
  address: string;
}

/** Per-auction revenue summary for a creator (from AuctionState). */
export interface CreatorAuctionRevenue {
  auctionId:      string;
  creatorRevenue: bigint;
  protocolFee:    bigint;
  withdrawn:      bigint;
  withdrawable:   bigint;  // creatorRevenue − withdrawn
}
