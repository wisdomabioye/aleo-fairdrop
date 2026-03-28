/**
 * Contract transaction spec builders.
 *
 * Each function encodes the exact input ordering for one on-chain transition.
 * D11 pattern: caller reads on-chain state and passes it as public inputs;
 *              finalize validates with assert_eq. Wrong inputs → tx fails in finalize.
 *
 * Returns an TransactionOptions that can be spread directly into executeTransaction():
 *   executeTransaction(auctionTx.closeAuction(auction))
 *   executeTransaction(auctionTx.withdrawPayments(auction, amount))
 *
 * Sections:
 *   1. Auction lifecycle  — close, cancel, push_referral_budget, withdraw_*
 *   2. Claims             — claim, claim_vested, claim_voided, claim_commit_voided
 *   3. Sealed-specific    — slash_unrevealed
 *   4. Referral           — create_code, credit_commission, claim_commission
 */

import { AuctionStatus, AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { config, TX_DEFAULT_FEE } from '@/env';
import { RaiseAuctionConfig } from 'node_modules/@fairdrop/types/src/contracts/auctions/raise';
import type { TransactionOptions } from '@provablehq/aleo-types';

// ── 1. Auction lifecycle ──────────────────────────────────────────────────────

/**
 * close_auction — permissionless; call after end_block.
 *
 * D11 invariants (asserted in finalize):
 *   creator       = config.creator
 *   filled        = state.supply_met
 *   volume        = state.total_payments  ← ALEO paid in, NOT sale-token quantity
 *   closer_reward = config.closer_reward
 */
export function closeAuction(auction: AuctionView): TransactionOptions {
  return {
    program:    auction.programId,
    function:   'close_auction',
    inputs: [
      auction.id,
      auction.creator,
      String(auction.status === AuctionStatus.Clearing),  // filled = supply_met
      `${auction.totalPayments}u128`, // volume = total_payments (D11)
      `${auction.closerReward}u128`,
    ],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * cancel_auction — creator only; available while upcoming or active.
 *
 * Burns escrow_sales back to the creator's token balance.
 * After cancel, bidders call claim_voided / claim_commit_voided.
 */
export function cancelAuction(auction: AuctionView): TransactionOptions {
  return {
    program:    auction.programId,
    function:   'cancel_auction',
    inputs:     [auction.id, auction.saleTokenId, `${auction.supply}u128`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * push_referral_budget — permissionless; call after close_auction.
 *
 * Transfers referral_budget credits to fairdrop_ref_v1 so referrers can claim.
 * D11: referral_budget = state.referral_budget
 */
export function pushReferralBudget(auction: AuctionView): TransactionOptions {
  return {
    program:    auction.programId,
    function:   'push_referral_budget',
    inputs:     [auction.id, `${auction.referralBudget ?? 0n}u128`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * withdraw_payments — creator only; call after close_auction.
 *
 * Withdraws up to `amount` ALEO from creator_revenue escrow.
 */
export function withdrawPayments(auction: AuctionView, amount: bigint): TransactionOptions {
  return {
    program:    auction.programId,
    function:   'withdraw_payments',
    inputs:     [auction.id, `${amount}u128`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * withdraw_unsold — creator only; call after close_auction.
 *
 * Mints up to `amount` unsold tokens back to the creator.
 * sale_token_id required for the token_registry CPI.
 */
export function withdrawUnsold(auction: AuctionView, amount: bigint): TransactionOptions {
  return {
    program:    auction.programId,
    function:   'withdraw_unsold',
    inputs:     [auction.id, `${amount}u128`, auction.saleTokenId],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

// ── 2. Claims ─────────────────────────────────────────────────────────────────

/**
 * Minimal shape needed from a bid/commitment wallet record for claim builders.
 * Intentionally generic — avoids coupling this module to feature-layer hook types.
 */
export interface ClaimRecord {
  /** Raw wallet record object — wallet adapter handles serialization at runtime. */
  raw:           string;
  /** Program that issued this record (matches auction.programId). */
  programId:     string;
  /** ALEO locked as collateral or payment. */
  paymentAmount: bigint;
}

/**
 * claim — settled auction; returns tokens to the bidder.
 * `saleScale` D11: config.sale_scale (divisor applied in finalize).
 */
export function claimBid(record: ClaimRecord, auction: AuctionView): TransactionOptions {
  let inputs: string[] = [];

  switch (auction.type) {
    case AuctionType.Sealed:
    case AuctionType.Dutch:
    case AuctionType.Lbp:
    case AuctionType.Quadratic:
      inputs = [
        record.raw, 
        `${auction.clearingPrice}u128`, 
        auction.saleTokenId, 
        `${auction.saleScale}u128`
      ];
      break;
    case AuctionType.Raise:
      inputs = [
        record.raw, 
        `${auction.totalPayments}u128`, 
        `${(
          auction.params as Pick<RaiseAuctionConfig, 'raise_target'>
        ).raise_target}u128`, 
        `${auction.supply}u128`, 
        auction.saleTokenId, 
        `${auction.saleScale}u128`
      ];
      break;

    case AuctionType.Ascending:
      inputs = [
        record.raw, 
        auction.saleTokenId, 
      ];
      break;
  }
  
  return {
    program:    record.programId,
    function:   'claim',
    inputs,
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * claim_vested — settled auction with vesting; issues a vest schedule instead of tokens.
 */
export function claimVested(record: ClaimRecord, auction: AuctionView): TransactionOptions {
  let inputs: string[] = [];

  switch (auction.type) {
    case AuctionType.Dutch:
    case AuctionType.Sealed:
    case AuctionType.Lbp:
    case AuctionType.Quadratic:
      inputs = [
        record.raw, 
        `${auction.clearingPrice}u128`,
        auction.saleTokenId,
        `${auction.saleScale}u128`,
        `${auction.endedAtBlock}u32`,
        `${auction.vestCliffBlocks}u32`,
        `${auction.vestEndBlocks}u32`,
      ];
      break;
    case AuctionType.Raise:
      inputs = [
        record.raw, 
        `${auction.totalPayments}u128`, 
        `${(
          auction.params as Pick<RaiseAuctionConfig, 'raise_target'>
        ).raise_target}u128`, 
        `${auction.supply}u128`, 
        auction.saleTokenId, 
        `${auction.saleScale}u128`,
        `${auction.endedAtBlock}u32`,
        `${auction.vestCliffBlocks}u32`,
        `${auction.vestEndBlocks}u32`,
      ];
      break;

    case AuctionType.Ascending:
      inputs = [
        record.raw, 
        auction.saleTokenId,
        `${auction.endedAtBlock}u32`,
        `${auction.vestCliffBlocks}u32`,
        `${auction.vestEndBlocks}u32`,
      ];
      break;
  }

  return {
    program:    record.programId,
    function:   'claim_vested',
    inputs,
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * claim_voided — cancelled auction; refunds the bidder's payment from a Bid record.
 */
export function claimVoided(record: ClaimRecord, _auction: AuctionView): TransactionOptions {
  return {
    program:    record.programId,
    function:   'claim_voided',
    inputs:     [record.raw],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * claim_commit_voided — cancelled auction; refunds sealed Commitment record collateral.
 * Used when the bidder never revealed (Commitment record, not Bid record).
 */
export function claimCommitVoided(record: ClaimRecord, _auction: AuctionView): TransactionOptions {
  return {
    program:    record.programId,
    function:   'claim_commit_voided',
    inputs:     [record.raw],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

// ── 3. Sealed-specific ────────────────────────────────────────────────────────

/**
 * slash_unrevealed — permissionless; call after end_block on sealed auctions.
 *
 * Forfeits collateral of a bidder who committed but never revealed.
 * Caller receives slash_reward_bps % of the forfeited amount.
 *
 * @param commitmentKey  BHP256(BidderKey{bidder, auction_id}) — computed off-chain
 * @param auctionId      Field of the sealed auction
 * @param paymentAmount  ALEO locked by the unrevealed commitment (from on-chain state)
 * @param slashRewardBps Snapshot from AuctionConfig (config.slash_reward_bps)
 */
export function slashUnrevealed(
  commitmentKey:  string,
  auctionId:      string,
  paymentAmount:  bigint,
  slashRewardBps: number,
): TransactionOptions {
  return {
    program:    config.programs.sealed.programId,
    function:   'slash_unrevealed',
    inputs:     [
      commitmentKey, 
      auctionId, 
      `${paymentAmount}u128`, 
      `${slashRewardBps}u16`
    ],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

// ── 4. Referral ───────────────────────────────────────────────────────────────

/**
 * create_code — creates a referral code for an auction.
 *
 * @param auctionId      Auction to attach the code to
 * @param maxReferralBps Protocol cap (from ProtocolConfig.maxReferralBps)
 */
export function createReferralCode(auctionId: string, maxReferralBps: number): TransactionOptions {
  return {
    program:    config.programs.ref.programId,
    function:   'create_code',
    inputs:     [auctionId, `${maxReferralBps}u16`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * credit_commission — credits a referrer's earned commission for a specific bidder.
 *
 * @param codeId     Referral code field (on-chain identifier)
 * @param bidderKey  BHP256(BidderKey{bidder, auction_id}) — computed off-chain
 */
export function creditCommission(codeId: string, bidderKey: string): TransactionOptions {
  return {
    program:    config.programs.ref.programId,
    function:   'credit_commission',
    inputs:     [codeId, bidderKey],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

/**
 * claim_commission — transfers accumulated referral earnings to the referrer.
 *
 * @param codeRecord  Raw referral code record from the wallet
 * @param amount      Amount to claim (up to accumulated balance)
 */
export function claimCommission(codeRecord: string, amount: bigint): TransactionOptions {
  return {
    program:    config.programs.ref.programId,
    function:   'claim_commission',
    inputs:     [codeRecord, `${amount}u128`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}

// ── 5. Vesting ────────────────────────────────────────────────────────────────

/**
 * release — releases a portion of a VestedAllocation to the owner.
 *
 * D11 pattern: caller supplies `amount`; finalize validates against on-chain
 * vesting math. Use computeReleasable() to compute the correct amount before calling.
 *
 * @param vestRecord  Raw VestedAllocation record from the wallet
 * @param amount      Tokens to release (≤ vested_so_far − released)
 */
export function releaseVested(vestRecord: string, amount: bigint): TransactionOptions {
  return {
    program:    config.programs.vest.programId,
    function:   'release',
    inputs:     [vestRecord, `${amount}u128`],
    fee:        TX_DEFAULT_FEE,
    privateFee: false,
  };
}
