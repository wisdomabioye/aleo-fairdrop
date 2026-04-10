/**
 * fairdrop_sealed_v3.aleo — TypeScript types.
 *
 * Three-phase sealed-bid commit-reveal auction with uniform Dutch clearing price.
 *
 * Phases:
 *   COMMIT  [start_block → commit_end_block]: lock payment + submit commitment hash.
 *   REVEAL  [commit_end_block → end_block]:   reveal (quantity, nonce) pre-image.
 *   SLASH   [end_block → close_auction]:      permissionless slash of unrevealed commits.
 *
 * Clearing price = Dutch price at commit_end_block.
 * All revealed winners pay the same clearing price (uniform clearing).
 */

import type { Field, Address, U128, U64, U32, U16, Bool } from '../../primitives/scalars';
import type {
  BaseAuctionConfig,
  AuctionState,
  BaseBid,
  GateParams,
  VestParams,
  ConfigSnapshot,
} from './common';

// ── On-chain structs ──────────────────────────────────────────────────────────

/**
 * Sealed-specific params passed at create_auction.
 * Dutch price decay params determine the clearing price at commit_end_block.
 * reveal_end_block is passed as the top-level `end_block` parameter.
 */
export interface SealedParams {
  start_price:        U128;
  floor_price:        U128;
  price_decay_blocks: U32;
  price_decay_amount: U128;
  commit_end_block:   U32;
}

/**
 * Immutable auction config stored in `auction_configs` mapping.
 * Extends BaseAuctionConfig with sealed/Dutch price fields.
 * `end_block` (from BaseAuctionConfig) = reveal_end_block.
 */
export interface SealedAuctionConfig extends BaseAuctionConfig {
  start_price:        U128;
  floor_price:        U128;
  price_decay_blocks: U32;
  price_decay_amount: U128;
  commit_end_block:   U32;   // end of commit window
  slash_reward_bps:   U16;   // D16: snapshotted for slash_unrevealed
}

/**
 * Private Commitment record — issued at commit_bid, consumed at reveal_bid.
 * The `commitment` field = BHP256(CommitRevealKey { quantity, nonce, bidder }).
 */
export interface SealedCommitment {
  owner:          Address;
  auction_id:     Field;
  commitment:     Field;   // hides quantity until reveal
  payment_amount: U128;
  quantity: U128,
  nonce: Field
}

/**
 * Private Bid record — issued at reveal_bid, consumed at claim.
 * quantity = effective (capped) quantity; uniform clearing price applies.
 */
export type SealedBid = BaseBid;

/**
 * On-chain CommitState stored in `pending_commits` mapping.
 * Keyed by BHP256(BidderKey { bidder, auction_id }) — pseudonymous.
 */
export interface CommitState {
  auction_id:      Field;
  commitment_hash: Field;
  payment_amount:  U128;
  revealed:        Bool;
  slashed:         Bool;
}

// Re-export shared types.
export type { AuctionState, GateParams, VestParams, ConfigSnapshot };

// ── Transition inputs ─────────────────────────────────────────────────────────

export interface SealedCreateAuctionInput {
  sale_token_id:  Field;
  supply:         U128;
  start_block:    U32;
  end_block:      U32;   // = reveal_end_block
  max_bid_amount: U128;
  min_bid_amount: U128;
  sale_scale:     U128;
  nonce:          U64;
  metadata_hash:  Field;
  sealed:         SealedParams;
  gate:           GateParams;
  vest:           VestParams;
  snapshot:       ConfigSnapshot;
}

/**
 * Input to `commit_bid_private` / `commit_bid_public`.
 * quantity and nonce are private (hidden from on-chain). Frontend stores them locally.
 */
export interface SealedCommitBidInput {
  auction_id:     Field;
  quantity:       U128;   // private
  nonce:          Field;  // private — bidder's secret
  payment_amount: U64;    // collateral (must cover clearing_price * quantity)
}

/** Input to `commit_bid_private_ref` / `commit_bid_public_ref`. */
export interface SealedCommitBidRefInput extends SealedCommitBidInput {
  code_id: Field;
}

/**
 * Input to `reveal_bid`.
 * Commitment record passed separately by wallet SDK.
 * quantity and nonce are private (same values used at commit).
 */
export interface SealedRevealBidInput {
  quantity:       U128;   // private
  nonce:          Field;  // private
  max_bid_amount: U128;   // D11: config.max_bid_amount
}

/**
 * Input to `slash_unrevealed`.
 * commitment_key = BHP256(BidderKey { bidder, auction_id }) — obtained from
 * indexer events watching commit_bid finalize ops.
 */
export interface SealedSlashUnrevealedInput {
  commitment_key:   Field;
  auction_id:       Field;
  payment_amount:   U128;   // D11: pending_commits[commitment_key].payment_amount
  slash_reward_bps: U16;    // D11: config.slash_reward_bps
}

/** Input to `close_auction`. */
export interface SealedCloseAuctionInput {
  auction_id:    Field;
  creator:       Address;
  filled:        Bool;    // D11: state.supply_met
  volume:        U128;
  closer_reward: U128;
}

/** Input to `claim`. */
export interface SealedClaimInput {
  clearing_price: U128;
  sale_token_id:  Field;
  sale_scale:     U128;
}

/** Input to `claim_vested`. */
export interface SealedClaimVestedInput {
  clearing_price:  U128;
  sale_token_id:   Field;
  sale_scale:      U128;
  ended_at_block:  U32;
  cliff_blocks:    U32;
  vest_end_blocks: U32;
}

/** Input to `push_referral_budget`. */
export interface SealedPushReferralBudgetInput {
  auction_id: Field;
  budget:     U128;
}

/** Input to `withdraw_payments`. */
export interface SealedWithdrawPaymentsInput {
  auction_id: Field;
  amount:     U128;
}

/** Input to `withdraw_unsold`. */
export interface SealedWithdrawUnsoldInput {
  auction_id:    Field;
  amount:        U128;
  sale_token_id: Field;
}

/** Input to `cancel_auction`. */
export interface SealedCancelAuctionInput {
  auction_id:    Field;
  sale_token_id: Field;
  supply:        U128;
}
