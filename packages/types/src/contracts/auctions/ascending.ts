/**
 * fairdrop_ascending_v4.aleo — TypeScript types.
 *
 * Ascending-price auction: price rises from floor_price toward ceiling_price
 * in discrete steps. Early bidders pay less than late bidders (pay-what-you-bid).
 * No uniform clearing price — no refund at claim.
 */

import type { Field, Address, U128, U64, U32, Bool } from '../../primitives/scalars';
import type {
  BaseAuctionConfig,
  AuctionState,
  BaseBid,
  GateParams,
  VestParams,
  ConfigSnapshot,
} from './common';

// ── On-chain structs ──────────────────────────────────────────────────────────

/** Mechanism-specific price rise parameters (Leo: AscendingParams). */
export interface AscendingParams {
  floor_price:       U128;   // starting (minimum) price
  ceiling_price:     U128;   // maximum price cap
  price_rise_blocks: U32;    // blocks per price step
  price_rise_amount: U128;   // microcredits increase per step
  extension_window:  U32;    // blocks before end that trigger extension (0 = disabled)
  extension_blocks:  U32;    // blocks added per qualifying bid
  max_end_block:     U32;    // hard cap on effective_end_block
}

/**
 * Immutable auction config stored in `auction_configs` mapping.
 * Extends BaseAuctionConfig with ascending-specific price fields.
 */
export interface AscendingAuctionConfig extends BaseAuctionConfig {
  floor_price:       U128;
  ceiling_price:     U128;
  price_rise_blocks: U32;
  price_rise_amount: U128;
  extension_window:  U32;
  extension_blocks:  U32;
  max_end_block:     U32;
}

/**
 * Private Bid record — same shape as BaseBid.
 * No bid_price field: pay-what-you-bid with no refund at claim.
 */
export type AscendingBid = BaseBid;

// Re-export shared types.
export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

export interface AscendingCreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  start_block:    U32;
  end_block:      U32;
  max_bid_amount: U128;
  min_bid_amount: U128;
  sale_scale:     U128;
  nonce:          U64;
  metadata_hash:  Field;
  ascending:      AscendingParams;
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/** Input to `place_bid_public`. */
export interface AscendingPlaceBidPublicInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
}

/** Input to `place_bid_private`. */
export interface AscendingPlaceBidPrivateInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
}

/** Input to `place_bid_public_ref`. */
export interface AscendingPlaceBidPublicRefInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
  code_id:        Field;
}

/** Input to `place_bid_private_ref`. */
export interface AscendingPlaceBidPrivateRefInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
  code_id:        Field;
}

/**
 * Input to `close_auction`.
 * `volume` = state.total_payments (serves as revenue base for ascending).
 */
export interface AscendingCloseAuctionInput {
  auction_id:    Field;
  creator:       Address;
  filled:        Bool;    // D11: state.supply_met
  volume:        U128;
  closer_reward: U128;
}

/**
 * Input to `claim` (ascending — no clearing price, no refund).
 * Only sale_token_id needed.
 */
export interface AscendingClaimInput {
  sale_token_id: Field;
}

/** Input to `claim_vested`. */
export interface AscendingClaimVestedInput {
  sale_token_id:   Field;
  ended_at_block:  U32;
  cliff_blocks:    U32;
  vest_end_blocks: U32;
}

/** Input to `push_referral_budget`. */
export interface AscendingPushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;
}

/** Input to `withdraw_payments`. */
export interface AscendingWithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

/** Input to `withdraw_unsold`. */
export interface AscendingWithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

/** Input to `cancel_auction`. */
export interface AscendingCancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;
}
