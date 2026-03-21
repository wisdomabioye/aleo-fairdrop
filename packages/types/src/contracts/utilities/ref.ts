/**
 * fairdrop_ref.aleo — TypeScript types.
 *
 * Referral attribution and commission settlement.
 * Referrers create codes; bidders attribute bids to codes;
 * after close_auction, the referral budget is pushed into a per-auction reserve
 * and referrers claim commissions proportional to attributed volume.
 */

import type { Field, Address, U128, Bool } from '../../primitives/scalars.js';

/** On-chain referral code record, created by a referrer. */
export interface ReferralCode {
  code_id:  Field;   // BHP256(CodeKey{referrer, salt})
  referrer: Address;
  auction_id: Field; // 0field if code is global (auction-agnostic)
}

/**
 * Per-bidder attribution stored in `attributions` mapping.
 * Key: BHP256(bidder_key, auction_id).
 */
export interface ReferralAttribution {
  code_id:        Field;
  payment_amount: U128; // bid-time payment (used for commission calculation)
}

/** Input to `record_referral` — called from _ref bid variants. */
export interface RecordReferralInput {
  code_id:        Field;
  auction_id:     Field;
  bidder_key:     Field;  // BHP256(BidderKey{bidder, auction_id})
  payment_amount: U128;
}

/** Input to `fund_reserve` — called from push_referral_budget after close. */
export interface FundReserveInput {
  auction_id: Field;
  amount:     U128;
}

/** Input to `credit_commission` — called by referrers to claim earnings. */
export interface CreditCommissionInput {
  code_id:    Field;
  auction_id: Field;
  bidder_key: Field;
}

/** `reserve_funded` mapping value — one-time guard per auction_id. */
export type ReserveFunded = Bool;

