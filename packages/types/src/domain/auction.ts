/**
 * Domain-level auction types — enriched view models for UI, API, and services.
 * These are not 1:1 with Leo structs; they carry computed fields, enums,
 * human-readable values, and wall-clock timestamps derived from block heights.
 */

import type { DutchParams }        from '../contracts/auctions/dutch';
import type { SealedParams }       from '../contracts/auctions/sealed';
import type { RaiseAuctionConfig } from '../contracts/auctions/raise';
import type { AscendingParams }    from '../contracts/auctions/ascending';
import type { LbpAuctionConfig }   from '../contracts/auctions/lbp';
import type { QuadraticAuctionConfig } from '../contracts/auctions/quadratic';
import type { U16 }                from '../primitives/scalars';

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
  hash:          string;
  /** IPFS CID for fetching / verification. */
  ipfsCid:       string;
  name:          string;
  description:   string;
  website:       string | null;
  /** IPFS CID of logo image. */
  logoIpfs:      string | null;
  twitter:       string | null;
  discord:       string | null;
  /** URL of the credential-signer service. Present only for credential-gated auctions. */
  credentialUrl: string | null;
}

/**
 * Mechanism-specific config params surfaced on AuctionView.
 *
 * Each member reuses the corresponding contract params type (snake_case scalar strings)
 * plus a `type` discriminant so callers can narrow via `auction.params.type`.
 *
 * - Dutch/Ascending/Sealed: use existing *Params interfaces from contracts/auctions/
 * - Sealed adds `slash_reward_bps` (snapshotted at create, not in SealedParams)
 * - Raise/LBP/Quadratic: Pick only the mechanism-specific fields from their configs
 */
export type AuctionParams =
  | (DutchParams     & { type: AuctionType.Dutch })
  | (SealedParams    & { slash_reward_bps: U16; type: AuctionType.Sealed })
  | (Pick<RaiseAuctionConfig, 'raise_target'> & { type: AuctionType.Raise })
  | (AscendingParams & { type: AuctionType.Ascending })
  | (Pick<LbpAuctionConfig,   'start_weight' | 'end_weight' | 'swap_fee_bps' | 'initial_price'> & { type: AuctionType.Lbp })
  | (Pick<QuadraticAuctionConfig, 'matching_pool' | 'contribution_cap' | 'matching_deadline'>    & { type: AuctionType.Quadratic });

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
  saleTokenId:       string;
  saleTokenSymbol:   string | null;
  saleTokenDecimals: number | null;
  /** sale_scale from BaseAuctionConfig — 10^decimals. Pass verbatim to transitions. */
  saleScale:         bigint;

  // Supply
  supply:           bigint;
  totalCommitted:   bigint;
  totalPayments:    bigint;
  progressPct:      number;  // 0–100, capped
  minBidAmount:     bigint;
  maxBidAmount:     bigint;
  /** Actual tokens to distribute at close. Raise + Quadratic only; null for other types or before clearing. */
  effectiveSupply:  bigint | null;
  /** Minimum fill threshold in bps. 0 = disabled (100% required). Raise + Quadratic only; null for other types. */
  fillMinBps:       number | null;
  /** Raise target in microcredits. Raise + Quadratic only; null for other types. */
  raiseTarget:      bigint | null;
  // Price (null until relevant lifecycle stage)
  currentPrice:    bigint | null;  // computed from block height; null if not active
  clearingPrice:   bigint | null;  // set at close_auction

  // Timing
  startBlock:         number;
  endBlock:           number;
  endedAtBlock:       number | null;
  /** Ascending auctions only — mutable end block updated by anti-sniping extension. Null for all other types. */
  effectiveEndBlock:  number | null;
  estimatedStart:     Date | null;    // block → wall-clock approximation
  estimatedEnd:       Date | null;

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

  /**
   * Mechanism-specific config. Narrow via `params.type` (equals `this.type`).
   * Field names and scalar types mirror the on-chain contract structs.
   */
  params:          AuctionParams;
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
  startBlock:        number;
  endBlock:          number;
  commitEndBlock:    number | null;
  /** Ascending auctions only — mutable end block updated by anti-sniping extension. Null for all other types. */
  effectiveEndBlock: number | null;
  estimatedEnd:      Date | null;
  vestEnabled:       boolean;
  gateMode:          GateMode;
}
