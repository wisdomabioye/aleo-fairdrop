/**
 * Domain-level auction types — enriched view models for UI, API, and services.
 * These are not 1:1 with Leo structs; they carry computed fields, enums,
 * human-readable values, and wall-clock timestamps derived from block heights.
 */

/** All supported auction mechanisms. Matches PROGRAM_SALT constants. */
export enum AuctionType {
  Dutch     = 'dutch',
  Sealed    = 'sealed',
  Raise     = 'raise',
  Ascending = 'ascending',
  Lbp       = 'lbp',
  Quadratic = 'quadratic',
}

/** Computed lifecycle status — derived from AuctionState + current block height. */
export enum AuctionStatus {
  /** start_block > current block — auction hasn't started yet. */
  Upcoming = 'upcoming',
  /** Started, accepting bids, not yet supply_met or end_block reached. */
  Active   = 'active',
  /** supply_met = true but close_auction not yet called. */
  Clearing = 'clearing',
  /** close_auction called — bidders can now claim. */
  Cleared  = 'cleared',
  /** cancel_auction called — bidders can claim_voided. */
  Voided   = 'voided',
  /** end_block passed without supply_met, not yet closed. */
  Ended    = 'ended',
}

/** Semantic gate mode — mirrors GateModeValue but as a string enum for readability. */
export enum GateMode {
  Open       = 'open',
  Merkle     = 'merkle',
  Credential = 'credential',
}

/** Full auction view — used on detail pages. */
export interface AuctionView {
  /** Hex-encoded auction_id field. */
  id:              string;
  type:            AuctionType;
  status:          AuctionStatus;
  programId:       string;

  // Participants
  creator:         string;

  // Token
  saleTokenId:     string;
  saleTokenSymbol: string | null;
  saleTokenDecimals: number | null;

  // Supply
  supply:          bigint;
  totalCommitted:  bigint;
  progressPct:     number;  // 0–100, capped

  // Price (null until relevant lifecycle stage)
  currentPrice:    bigint | null;  // computed from block height; null if not active
  clearingPrice:   bigint | null;  // set at close_auction

  // Timing
  startBlock:      number;
  endBlock:        number;
  endedAtBlock:    number | null;
  estimatedStart:  Date | null;    // block → wall-clock approximation
  estimatedEnd:    Date | null;

  // Gate
  gateMode:        GateMode;

  // Vesting
  vestEnabled:     boolean;
  vestCliffBlocks: number;
  vestEndBlocks:   number;

  // Revenue (null until cleared)
  creatorRevenue:  bigint | null;
  protocolFee:     bigint | null;
  referralBudget:  bigint | null;

  // Protocol config (snapshotted at create)
  feeBps:          number;
  closerReward:    bigint;
}

/** Lightweight auction summary — used in lists and cards. */
export interface AuctionListItem {
  id:             string;
  type:           AuctionType;
  status:         AuctionStatus;
  creator:        string;
  saleTokenId:    string;
  saleTokenSymbol: string | null;
  supply:         bigint;
  progressPct:    number;
  currentPrice:   bigint | null;
  clearingPrice:  bigint | null;
  startBlock:     number;
  endBlock:       number;
  estimatedEnd:   Date | null;
  vestEnabled:    boolean;
  gateMode:       GateMode;
}
