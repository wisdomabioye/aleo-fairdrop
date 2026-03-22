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

/** Off-chain metadata pinned to IPFS and hashed on-chain via BHP256. */
export interface AuctionMetadata {
  /** Field hex — matches on-chain metadata_hash in AuctionConfig. */
  hash:        string;
  /** IPFS CID for fetching / verification. */
  ipfsCid:     string;
  name:        string;
  description: string;
  website:     string | null;
  /** IPFS CID of logo image. */
  logoIpfs:    string | null;
  twitter:     string | null;
  discord:     string | null;
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

  // Metadata
  metadataHash:    string | null;   // raw field — always present if on-chain
  metadata:        AuctionMetadata | null;  // null if no metadata pinned / 0field hash

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

  // Raise-specific (null for non-raise types)
  raiseTarget:     bigint | null;

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
  name:           string | null;    // from metadata.name
  logoIpfs:       string | null;    // from metadata.logoIpfs
  metadataHash:   string | null;
  saleTokenId:    string;
  saleTokenSymbol: string | null;
  supply:         bigint;
  progressPct:    number;
  currentPrice:   bigint | null;
  clearingPrice:  bigint | null;
  raiseTarget:    bigint | null;
  startBlock:     number;
  endBlock:       number;
  estimatedEnd:   Date | null;
  vestEnabled:    boolean;
  gateMode:       GateMode;
}
