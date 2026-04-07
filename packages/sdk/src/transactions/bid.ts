/**
 * Transaction builders for place_bid transitions.
 *
 * Correct input layout per auction type (confirmed against contracts):
 *   Dutch / Ascending  — (auction_id, quantity_u128, payment_amount_u64)
 *   Raise / Quadratic  — (auction_id, payment_amount_u64)          ← no quantity
 *   LBP                — (auction_id, quantity_u128, payment_amount_u64, max_bid_price_u128)
 *   Sealed             — uses commitBid / revealBid in sealed.ts
 *
 * Private variants prepend the credits record before auction_id.
 * Ref variants append code_id after the core inputs.
 *
 */

import type { AuctionView } from '@fairdrop/types/domain';
import { AuctionType } from '@fairdrop/types/domain';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

// ── BidParams discriminated union ─────────────────────────────────────────────

export type BidParams =
  | {
      type:          AuctionType.Dutch | AuctionType.Ascending;
      quantity:      bigint;  // u128 — base units
      paymentAmount: bigint;  // u64  — microcredits
    }
  | {
      type:          AuctionType.Raise | AuctionType.Quadratic;
      paymentAmount: bigint;  // u64  — microcredits; no quantity field
    }
  | {
      type:          AuctionType.Lbp;
      quantity:      bigint;  // u128 — base units
      paymentAmount: bigint;  // u64  — microcredits
      /** Slippage ceiling: finalize asserts computed_price <= maxBidPrice. */
      maxBidPrice:   bigint;  // u128
    };

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Positional core inputs — everything between auction_id and optional code_id. */
function coreInputs(p: BidParams): string[] {
  switch (p.type) {
    case AuctionType.Dutch:
    case AuctionType.Ascending:
      return [`${p.quantity}u128`, `${p.paymentAmount}u64`];
    case AuctionType.Raise:
    case AuctionType.Quadratic:
      return [`${p.paymentAmount}u64`];
    case AuctionType.Lbp:
      return [`${p.quantity}u128`, `${p.paymentAmount}u64`, `${p.maxBidPrice}u128`];
  }
}

function buildSpec(
  auction:  AuctionView,
  fn:       string,
  inputs:   (string | Record<string, unknown>)[],
  fee:      number,
): TxSpec {
  return { program: auction.programId, function: fn, inputs, fee, privateFee: false };
}

// ── Public bid builders ───────────────────────────────────────────────────────

/**
 * place_bid_public — pay from the bidder's public (on-chain) credits balance.
 */
export function placeBidPublic(
  auction: AuctionView,
  params:  BidParams,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return buildSpec(auction, 'place_bid_public',
    [auction.id, ...coreInputs(params)], fee);
}

/**
 * place_bid_public_ref — public payment with a referral code.
 *
 * @param codeId  Referral code field ID (on-chain identifier).
 */
export function placeBidPublicRef(
  auction: AuctionView,
  params:  BidParams,
  codeId:  string,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return buildSpec(auction, 'place_bid_public_ref',
    [auction.id, ...coreInputs(params), codeId], fee);
}

// ── Private bid builders ──────────────────────────────────────────────────────

/**
 * place_bid_private — pay from a private credits record.
 *
 * @param creditsRecord  Unspent credits.aleo record from the bidder's wallet.
 */
export function placeBidPrivate(
  auction:       AuctionView,
  params:        BidParams,
  creditsRecord: string | Record<string, unknown>,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return buildSpec(auction, 'place_bid_private',
    [creditsRecord, auction.id, ...coreInputs(params)], fee);
}

/**
 * place_bid_private_ref — private payment with a referral code.
 *
 * @param creditsRecord  Unspent credits.aleo record from the bidder's wallet.
 * @param codeId         Referral code field ID (on-chain identifier).
 */
export function placeBidPrivateRef(
  auction:       AuctionView,
  params:        BidParams,
  creditsRecord: string | Record<string, unknown>,
  codeId:        string,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return buildSpec(auction, 'place_bid_private_ref',
    [creditsRecord, auction.id, ...coreInputs(params), codeId], fee);
}
