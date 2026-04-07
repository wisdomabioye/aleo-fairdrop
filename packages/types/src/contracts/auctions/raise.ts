/**
 * fairdrop_raise_v2.aleo — TypeScript types.
 *
 * Fixed-price community raise: bidders commit credits at any amount ≥ min_bid_amount.
 * Tokens distributed pro-rata by payment when raise_target is met by end_block.
 * No price discovery — price is implied: raise_target / supply.
 *
 * Key distinction from Dutch/Ascending:
 *   - RaiseBid has NO quantity field (G17) — allocation computed at claim time.
 *   - actual_quantity = bid.payment_amount * supply / total_payments  (pro-rata)
 *   - Refund is rounding dust only (≤ 1 microunit per bidder).
 *   - Auction voids when total_payments < raise_target at close (G28).
 */

import type { Field, Address, U128, U64, U32, U16, Bool } from '../../primitives/scalars';
import type {
  BaseAuctionConfig,
  AuctionState,
  GateParams,
  VestParams,
  ConfigSnapshot,
} from './common';

// ── On-chain structs ──────────────────────────────────────────────────────────

/**
 * Immutable auction config stored in `auction_configs` mapping.
 * No price-curve fields (start_price, floor_price, etc.) — raise has a fixed target.
 */
export interface RaiseAuctionConfig extends BaseAuctionConfig {
  raise_target:  U128;  // total credits required for the raise to succeed
  fill_min_bps:  U16;   // partial-fill threshold in bps; 0 = disabled (100% required)
}

/**
 * Private RaiseBid record — no quantity field (G17).
 * Single-spend UTXO consumed at claim, claim_vested, or claim_voided.
 * Allocation: actual_quantity = payment_amount * supply / total_payments
 */
export interface RaiseBid {
  owner:          Address;   // private — recipient identity hidden on-chain
  auction_id:     Field;
  payment_amount: U128;      // microcredits deposited
}

// Re-export shared types.
export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

/**
 * Input to `create_auction`.
 * token record (burn_private source) is passed separately by the wallet SDK.
 */
export interface RaiseCreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  raise_target:   U128;   // total credits to collect for success
  start_block:    U32;
  end_block:      U32;
  max_bid_amount: U128;   // 0 = no per-bidder payment cap
  min_bid_amount: U128;   // minimum payment per bid (not quantity)
  sale_scale:     U128;
  nonce:          U64;    // D11: creator_nonces[creator]
  metadata_hash:  Field;
  fill_min_bps:   U16;    // minimum fill threshold; 0 = disabled (100% required)
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/**
 * Input to `place_bid_public`.
 * Frontend must ensure: payment_amount ≤ (config.raise_target - state.total_payments).
 * Finalize rejects bids that would exceed raise_target.
 */
export interface RaisePlaceBidPublicInput {
  auction_id:     Field;
  payment_amount: U64;
}

/**
 * Input to `place_bid_private`.
 * `payment` credits record passed separately by wallet SDK.
 */
export interface RaisePlaceBidPrivateInput {
  auction_id:     Field;
  payment_amount: U64;
}

export interface RaisePlaceBidPublicRefInput {
  auction_id:     Field;
  payment_amount: U64;
  code_id:        Field;
}

export interface RaisePlaceBidPrivateRefInput {
  auction_id:     Field;
  payment_amount: U64;
  code_id:        Field;
}

/**
 * Input to `close_auction`.
 * D11: all public params read from on-chain state/config before calling.
 * If !filled and block.height >= end_block → auction voids (target not met).
 */
export interface RaiseCloseAuctionInput {
  auction_id:    Field;
  creator:       Address;
  filled:        Bool;    // D11: state.supply_met
  volume:        U128;    // D11: state.total_payments
  closer_reward: U128;    // D11: config.closer_reward
}

export interface RaisePushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;   // D11: state.referral_budget
}

/**
 * Input to `claim`.
 * `bid` RaiseBid record passed separately.
 * Frontend must verify: bid.payment_amount >= total_payments / supply
 *   (otherwise actual_quantity rounds to 0 and finalize reverts).
 */
export interface RaiseClaimInput {
  total_payments:   U128;   // D11: state.total_payments
  effective_supply: U128;   // D11: state.effective_supply
  sale_token_id:    Field;
}

export interface RaiseClaimVestedInput {
  total_payments:   U128;
  effective_supply: U128;   // D11: state.effective_supply
  sale_token_id:    Field;
  ended_at_block:   U32;
  cliff_blocks:     U32;
  vest_end_blocks:  U32;
}

export interface RaiseWithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

/**
 * Input to `withdraw_unsold`. Creator only.
 * Works in CLEARED state (rounding dust) AND VOIDED state (full supply reclaim).
 */
export interface RaiseWithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

export interface RaiseCancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;   // D11: config.supply
}
