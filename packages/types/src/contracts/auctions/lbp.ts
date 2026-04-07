/**
 * fairdrop_lbp_v2.aleo — TypeScript types.
 *
 * Liquidity Bootstrapping Pool: price decays as a function of both remaining
 * supply and remaining time. Earlier participants pay a higher price; the
 * mechanism structurally discourages front-running bots.
 *
 * Price formula (on-chain, per block):
 *   supply_frac   = remaining / supply
 *   time_frac     = (end_block - block) / (end_block - start_block)
 *   current_price = floor_price + (start_price - floor_price) × supply_frac × time_frac
 *
 * Slippage guard: each bid specifies max_bid_price; finalize asserts computed_price ≤ max_bid_price.
 */

import type { Field, Address, U128, U64, U32, Bool } from '../../primitives/scalars';
import type {
  BaseAuctionConfig,
  AuctionState,
  GateParams,
  VestParams,
  ConfigSnapshot,
} from './common';

// ── On-chain structs ──────────────────────────────────────────────────────────

/** Mechanism-specific price parameters (Leo: LbpParams). */
export interface LbpParams {
  start_price: U128;   // max price: full supply, t=0
  floor_price: U128;   // min price: supply=0 or t=end_block
}

/**
 * Immutable auction config stored in `auction_configs` mapping.
 */
export interface LbpAuctionConfig extends BaseAuctionConfig {
  start_price: U128;
  floor_price: U128;
}

/**
 * Private LBPBid record — carries quantity and slippage ceiling.
 * Pay-what-you-bid: each bidder pays their own computed price; no uniform clearing.
 */
export interface LbpBid {
  owner:          Address;
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U128;   // microcredits paid at bid time
  max_bid_price:  U128;   // bidder's slippage ceiling
}

export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

export interface LbpCreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  start_block:    U32;
  end_block:      U32;
  max_bid_amount: U128;
  min_bid_amount: U128;
  sale_scale:     U128;
  nonce:          U64;
  metadata_hash:  Field;
  lbp:            LbpParams;
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/** Input to `place_bid_public` / `place_bid_private`. */
export interface LbpPlaceBidInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
  max_bid_price:  U128;   // slippage guard: finalize asserts computed_price ≤ this
}

export interface LbpCloseAuctionInput {
  auction_id:    Field;
  creator:       Address;
  filled:        Bool;
  volume:        U128;
  closer_reward: U128;
}

/** Input to `claim` / `claim_vested`. Pay-what-you-bid — no clearing price needed. */
export interface LbpClaimInput {
  sale_token_id: Field;
}

export interface LbpClaimVestedInput {
  sale_token_id:   Field;
  ended_at_block:  U32;
  cliff_blocks:    U32;
  vest_end_blocks: U32;
}

export interface LbpPushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;   // D11: state.referral_budget
}

export interface LbpWithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

export interface LbpWithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

export interface LbpCancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;
}
