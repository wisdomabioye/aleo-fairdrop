/**
 * fairdrop_dutch.aleo — TypeScript types.
 *
 * Descending-price Dutch auction with uniform clearing price.
 * All fields mirror the Leo structs 1:1; no runtime logic here.
 */

import type { Field, Address, U128, U64, U32, U16, U8 } from '../../primitives/scalars.js';
import type {
  BaseAuctionConfig,
  AuctionState,
  BaseBid,
  GateParams,
  VestParams,
  ConfigSnapshot,
} from './common.js';

// ── On-chain structs ──────────────────────────────────────────────────────────

/** Mechanism-specific price decay parameters (Leo: DutchParams). */
export interface DutchParams {
  start_price:        U128;
  floor_price:        U128;
  price_decay_blocks: U32;
  price_decay_amount: U128;
}

/**
 * Immutable auction config stored in `auction_configs` mapping.
 * Built in the transition body and committed atomically with create_auction.
 */
export interface DutchAuctionConfig extends BaseAuctionConfig {
  start_price:        U128;
  floor_price:        U128;
  price_decay_blocks: U32;
  price_decay_amount: U128;
}

/** Private Bid record — see BaseBid. Identical shape for Dutch auctions. */
export type DutchBid = BaseBid;

// Re-export shared types under Dutch namespace for convenience.
export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

/**
 * Input to `create_auction`.
 * token record (burn_private source) is passed separately by the wallet SDK.
 * payment_token_id is hardcoded to CREDITS_RESERVED_TOKEN_ID — not a parameter.
 */
export interface CreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  start_block:    U32;
  end_block:      U32;
  max_bid_amount: U128;
  min_bid_amount: U128;
  sale_scale:     U128;
  nonce:          U64;   // D11: creator_nonces[creator] read off-chain
  dutch:          DutchParams;
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/** Input to `place_bid_public`. */
export interface PlaceBidPublicInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
}

/**
 * Input to `place_bid_private`.
 * `payment` credits record is passed separately by the wallet SDK.
 */
export interface PlaceBidPrivateInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
}

/** Input to `place_bid_public_ref`. */
export interface PlaceBidPublicRefInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
  code_id:        Field;
}

/** Input to `place_bid_private_ref`. */
export interface PlaceBidPrivateRefInput {
  auction_id:     Field;
  quantity:       U128;
  payment_amount: U64;
  code_id:        Field;
}

/**
 * Input to `close_auction`.
 * All fields are D11 params — read from on-chain state before calling.
 */
export interface CloseAuctionInput {
  auction_id:    Field;
  creator:       Address; // D11: config.creator
  filled:        boolean; // D11: state.supply_met
  volume:        U128;    // D11: state.total_payments
  closer_reward: U128;    // D11: config.closer_reward
}

/** Input to `push_referral_budget`. */
export interface PushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;  // D11: state.referral_budget
}

/**
 * Input to `claim`.
 * `bid` Bid record is passed separately by the wallet SDK.
 * All public params are D11 — read from on-chain state.
 */
export interface ClaimInput {
  clearing_price: U128;
  sale_token_id:  Field;
  sale_scale:     U128;
}

/**
 * Input to `claim_vested`.
 * `bid` Bid record is passed separately by the wallet SDK.
 */
export interface ClaimVestedInput {
  clearing_price:  U128;
  sale_token_id:   Field;
  sale_scale:      U128;
  ended_at_block:  U32;  // D11: state.ended_at_block
  cliff_blocks:    U32;  // D11: config.vest_cliff_blocks
  vest_end_blocks: U32;  // D11: config.vest_end_blocks
}

/** Input to `withdraw_payments`. Creator only. */
export interface WithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

/** Input to `withdraw_unsold`. Creator only. */
export interface WithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

/**
 * Input to `cancel_auction`. Creator only.
 * supply is D11 — read from config.supply off-chain.
 */
export interface CancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;  // D11: config.supply
}

