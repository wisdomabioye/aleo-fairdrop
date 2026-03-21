/**
 * Database row shapes for user/participant state.
 * Tracks per-address reputation, referral codes, and nonces.
 */

/** Participant reputation snapshot — derived from fairdrop_proof.aleo mappings. */
export interface UserReputationRow {
  /** Aleo address — primary key. */
  address:          string;
  /** Cumulative number of auctions participated in. */
  auctionCount:     number;
  /** Total microcredits committed across all auctions. */
  totalCommitted:   string;  // u128 as decimal string
  /** Total microcredits refunded (voids + over-payments). */
  totalRefunded:    string;
  /** Number of claims successfully executed. */
  claimCount:       number;
  /** Number of claim_voided executions. */
  voidCount:        number;
  createdAt:        Date;
  updatedAt:        Date;
}

/** Creator nonce — tracks how many auctions an address has created (D11 pattern). */
export interface CreatorNonceRow {
  address:    string;
  nonce:      string;  // u64 as decimal string
  updatedAt:  Date;
}

/** Referral code ownership — one row per issued code. */
export interface ReferralCodeRow {
  /** BHP256(code_id) — primary key. */
  codeId:       string;
  /** Aleo address of the code owner. */
  owner:        string;
  /** Auction this code is scoped to (null = global code). */
  auctionId:    string | null;
  /** Commission rate in basis points. */
  commissionBps: number;
  /** Cumulative microcredits earned. */
  earned:       string;  // u128 as decimal string
  createdAt:    Date;
  updatedAt:    Date;
}

/** Referral attribution — one row per (referrer, referee, auction) tuple. */
export interface ReferralAttributionRow {
  referrerAddress: string;
  refereeAddress:  string;
  auctionId:       string;
  codeId:          string;
  /** Microcredits credited to referrer for this attribution. */
  commission:      string;
  blockHeight:     number;
  createdAt:       Date;
}
