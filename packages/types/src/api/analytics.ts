import { GateMode } from '../domain/auction';

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalAuctions:   number;
  activeAuctions:  number;
  clearedAuctions: number;
  voidedAuctions:  number;
  totalBids:       number;
  /** SUM(total_payments) from cleared auctions, microcredits decimal string. */
  totalVolume:     string;
  /** Average fill rate across all creators (0–1). */
  avgFillRate:     number;
  /** Auction count grouped by type string (e.g. { "dutch": 4, "raise": 2 }). */
  typeBreakdown:   Record<string, number>;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface VolumePeriod {
  /** ISO date string from DATE_TRUNC(...)::text — real wall-clock, no approximation. */
  period:  string;
  /** Total cleared payments in this period, microcredits as decimal string. */
  volume:  string;
  count:   number;
}

/**
 * Per-type performance metrics for the Auction Type Performance table.
 * `avgFillPct` and `successRate` are null when no completed auctions exist for the type.
 */
export interface AuctionTypeMetrics {
  type:         string;
  total:        number;
  clearedCount: number;
  /** Fraction of auctions that cleared. Null if total = 0. */
  successRate:  number | null;
  /**
   * Average fill at close, completed auctions only.
   * Dutch/Sealed/LBP/Ascending: committed/supply.
   * Raise/Quadratic: payments/raiseTarget.
   * Null if no completed auctions for this type.
   */
  avgFillPct:   number | null;
  avgBids:      number;
  /** Sum of total_payments for cleared auctions, microcredits as decimal string. */
  totalVolume:  string;
}

export interface FillBucket {
  /** Lower bound of the 10%-wide bucket: 0, 10, 20 … 90. */
  bucketFloor: number;
  count:       number;
}

export interface FillDistribution {
  /** Dutch, Sealed, LBP, Ascending — fill% = committed / supply. */
  supplyFill: FillBucket[];
  /** Raise, Quadratic — fill% = payments / raiseTarget. */
  raiseFill:  FillBucket[];
}

export interface AttributeBreakdown {
  /** gate_mode integer (0/1/2) mapped to GateMode string before returning. */
  gateMode: Record<GateMode, number>;
  vesting:  { enabled: number; disabled: number };
}
