export interface DashboardStats {
  totalAuctions:   number;
  activeAuctions:  number;
  clearedAuctions: number;
  totalBids:       number;
  /** SUM(total_payments) from cleared auctions, microcredits decimal string. */
  totalVolume:     string;
  /** Average fill rate across all creators (0–1). */
  avgFillRate:     number;
  /** Auction count grouped by type string (e.g. { "dutch": 4, "raise": 2 }). */
  typeBreakdown:   Record<string, number>;
}
