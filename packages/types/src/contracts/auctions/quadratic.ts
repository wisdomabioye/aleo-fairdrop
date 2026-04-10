/**
 * fairdrop_quadratic_v3.aleo — TypeScript types.
 *
 * Quadratic funding auction: allocation weight is √(payment_amount), computed
 * on-chain via 64-iteration Newton-Raphson. Smaller contributors receive
 * proportionally more tokens than their payment fraction would suggest.
 *
 * Clearing formula:
 *   your_tokens = supply × sqrt(your_payment) / Σsqrt(all_payments)
 *
 * Succeeds when total_payments ≥ raise_target (or ≥ fill_min_bps% of target).
 * Voids if below threshold at close — all bidders refunded in full.
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
 * No price-curve fields — allocation is purely sqrt-weighted.
 */
export interface QuadraticAuctionConfig extends BaseAuctionConfig {
  raise_target:  U128;   // minimum total credits for the auction to clear
  fill_min_bps:  U16;    // partial-fill threshold in bps; 0 = disabled (100% required)
}

/**
 * Private QuadraticBid record — no quantity field (allocation computed at claim).
 * Single-spend UTXO consumed at claim, claim_vested, or claim_voided.
 * Allocation: actual_quantity = supply × sqrt(payment) / sqrt_weights[auction_id]
 */
export interface QuadraticBid {
  owner:          Address;
  auction_id:     Field;
  payment_amount: U128;   // microcredits deposited
}

export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

export interface QuadraticCreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  raise_target:   U128;
  start_block:    U32;
  end_block:      U32;
  max_bid_amount: U128;
  min_bid_amount: U128;
  sale_scale:     U128;
  nonce:          U64;
  metadata_hash:  Field;
  fill_min_bps:   U16;
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/** Input to `place_bid_public` / `place_bid_private`. No quantity — weight = √payment. */
export interface QuadraticPlaceBidInput {
  auction_id:     Field;
  payment_amount: U64;
}

export interface QuadraticCloseAuctionInput {
  auction_id:    Field;
  creator:       Address;
  filled:        Bool;
  volume:        U128;
  closer_reward: U128;
}

/**
 * Input to `claim` / `claim_vested`.
 * total_sqrt_weight is the on-chain sqrt_weights[auction_id] accumulator.
 * Fetch with fetchSqrtWeights() from @fairdrop/sdk/chain before calling.
 */
export interface QuadraticClaimInput {
  total_sqrt_weight: U128;   // D11: sqrt_weights[auction_id]
  effective_supply:  U128;   // D11: state.effective_supply
  sale_token_id:     Field;
}

export interface QuadraticClaimVestedInput {
  total_sqrt_weight: U128;
  effective_supply:  U128;
  sale_token_id:     Field;
  ended_at_block:    U32;
  cliff_blocks:      U32;
  vest_end_blocks:   U32;
}

export interface QuadraticPushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;   // D11: state.referral_budget
}

export interface QuadraticWithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

export interface QuadraticWithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

export interface QuadraticCancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;
}
