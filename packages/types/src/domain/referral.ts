/**
 * Domain-level referral types.
 */

/** Referral code view — enriched from fairdrop_ref_v3.aleo on-chain data. */
export interface ReferralView {
  codeId:      string;  // field as hex
  referrer:    string;  // address
  auctionId:   string | null;  // null = global code
  totalVolume: bigint;  // sum of attributed payment_amounts
  commission:  bigint;  // accrued unclaimed credits
}

/**
 * Commission estimate for a referral code on a specific auction.
 * Computed from referral_reserve + attributed volume; not yet settled on-chain.
 */
export interface CommissionEstimate {
  codeId:          string;
  auctionId:       string;
  attributedVolume: bigint;
  estimatedCredit:  bigint;
  reserveFunded:    boolean;
}
