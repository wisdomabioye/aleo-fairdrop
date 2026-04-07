/**
 * Types shared across all fairdrop auction contracts.
 *
 * AuctionState and BaseBid are structurally identical in every auction program.
 * BaseAuctionConfig holds fields common to all mechanisms; each auction type
 * extends it with mechanism-specific fields in its own file.
 */

import type { Field, Address, U128, U64, U32, U16, U8, Bool } from '../../primitives/scalars';

// ── Shared structs ────────────────────────────────────────────────────────────

/**
 * Mutable lifecycle state. Identical across all auction program types.
 * Written once at create_auction (zeroed); updated by bids, close, cancel.
 */
export interface AuctionState {
  total_committed:  U128;
  total_payments:   U128;
  supply_met:       Bool;
  ended_at_block:   U32;
  cleared:          Bool;
  clearing_price:   U128;
  creator_revenue:  U128;
  protocol_fee:     U128;
  voided:           Bool;
  referral_budget:  U128;
  /** Actual tokens distributed at close. < supply for partial fill; == supply for full/over. 0 until cleared. Raise + Quadratic only. */
  effective_supply: U128;
  // Ascending only — updated by anti-sniping extension on each bid.
  effective_end_block?: U32;

}

/**
 * Common immutable fields present in every auction's config mapping.
 * Extended by each auction type to add mechanism-specific params.
 */
export interface BaseAuctionConfig {
  auction_id:       Field;
  creator:          Address;
  sale_token_id:    Field;
  payment_token_id: Field;   // always CREDITS_RESERVED_TOKEN_ID (v2)
  supply:           U128;
  start_block:      U32;
  end_block:        U32;
  max_bid_amount:   U128;    // 0 = no per-bidder cap
  min_bid_amount:   U128;
  sale_scale:       U128;    // 10^sale_token_decimals
  gate_mode:        U8;      // 0 = open, 1 = merkle, 2 = credential
  vest_enabled:     Bool;
  vest_cliff_blocks: U32;
  vest_end_blocks:  U32;
  fee_bps:            U16;   // D16: snapshotted from fairdrop_config at create
  closer_reward:      U128;  // D16: snapshotted from fairdrop_config at create
  referral_pool_bps:  U16;   // D16: snapshotted from fairdrop_config at create
  metadata_hash:      Field; // BHP256 of off-chain metadata JSON (IPFS). 0field = no metadata.
  /** Minimum fill to succeed. 0 = disabled (100% required). Raise + Quadratic only. */
  fill_min_bps?:      U16;
}

/**
 * Private Bid record — single-spend UTXO consumed at claim / claim_vested /
 * claim_voided. The `owner` field is private (never reaches finalize).
 */
export interface BaseBid {
  owner:          Address;   // private — recipient identity hidden on-chain
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U128;      // microcredits deposited (u64 on-chain, stored as u128)
}

/**
 * Global stats — keyed by 0field in each auction program's `stats` mapping.
 */
export interface AuctionStats {
  total_auctions:          U64;
  total_bids:              U64;
  total_payment_collected: U128;
}

/**
 * Common input struct for D16 protocol config snapshot.
 * Shared across all auction create transitions.
 */
export interface ConfigSnapshot {
  fee_bps:             U16;
  creation_fee:        U128;
  closer_reward:       U128;
  slash_reward_bps:    U16;
  referral_pool_bps:   U16;  // D16: share of protocol_fee for referral budget
}

/**
 * Common input struct for gate registration.
 * Shared across all auction create transitions.
 */
export interface GateParams {
  gate_mode:   U8;
  merkle_root: Field;   // 0field when gate_mode != 1
  issuer:      Address; // zero address when gate_mode != 2
}

/**
 * Common input struct for vesting schedule.
 * Shared across all auction create transitions.
 */
export interface VestParams {
  vest_enabled:      Bool;
  vest_cliff_blocks: U32;
  vest_end_blocks:   U32;
}
