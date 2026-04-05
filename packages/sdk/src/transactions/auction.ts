/**
 * Transaction builders for auction lifecycle transitions.
 *
 * close_auction, cancel_auction, push_referral_budget, withdraw_payments,
 * withdraw_unsold — all work across every auction type by operating on
 * shared BaseAuctionConfig / AuctionState fields.
 */

import type { AuctionView } from '@fairdrop/types/domain';
import { AuctionStatus } from '@fairdrop/types/domain';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

/**
 * close_auction — permissionless; call after end_block.
 *
 * D11 invariants validated in finalize:
 *   creator       = config.creator
 *   filled        = state.supply_met
 *   volume        = state.total_payments
 *   closer_reward = config.closer_reward
 */
export function closeAuction(auction: AuctionView, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  auction.programId,
    function: 'close_auction',
    inputs: [
      auction.id,
      auction.creator,
      String(auction.status === AuctionStatus.Clearing),  // filled = supply_met
      `${auction.totalPayments}u128`,
      `${auction.closerReward}u128`,
    ],
    fee,
    privateFee: false,
  };
}

/**
 * cancel_auction — creator only; available while upcoming or active.
 *
 * Burns escrow_sales back to creator. After cancel, bidders call
 * claim_voided / claim_commit_voided.
 */
export function cancelAuction(auction: AuctionView, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  auction.programId,
    function: 'cancel_auction',
    inputs:   [auction.id, auction.saleTokenId, `${auction.supply}u128`],
    fee,
    privateFee: false,
  };
}

/**
 * push_referral_budget — permissionless; call after close_auction.
 *
 * Transfers referral_budget credits to fairdrop_ref so referrers can claim.
 * D11: referral_budget = state.referral_budget
 */
export function pushReferralBudget(auction: AuctionView, fee = DEFAULT_TX_FEE): TxSpec {
  return {
    program:  auction.programId,
    function: 'push_referral_budget',
    inputs:   [auction.id, `${auction.referralBudget ?? 0n}u128`],
    fee,
    privateFee: false,
  };
}

/**
 * withdraw_payments — creator only; call after close_auction.
 *
 * Withdraws up to `amount` microcredits from creator_revenue escrow.
 */
export function withdrawPayments(
  auction: AuctionView,
  amount:  bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  auction.programId,
    function: 'withdraw_payments',
    inputs:   [auction.id, `${amount}u128`],
    fee,
    privateFee: false,
  };
}

/**
 * withdraw_treasury_fees — multisig-protected; withdraw accumulated protocol fees.
 *
 * Validates a pre-approved WithdrawalOp (BHP256 of amount + recipient + nonce)
 * against fairdrop_multisig. Use computeWithdrawalOpHash() to derive the op_hash
 * and approveOp() to get multisig approval before calling this.
 *
 * @param amount     Microcredits to withdraw from protocol_treasury.
 * @param recipient  Address to receive the credits.
 * @param opNonce    Nonce matching the pre-approved WithdrawalOp in multisig.
 */
export function withdrawTreasuryFees(
  auction:   AuctionView,
  amount:    bigint,
  recipient: string,
  opNonce:   bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  auction.programId,
    function: 'withdraw_treasury_fees',
    inputs:   [`${amount}u128`, recipient, `${opNonce}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * withdraw_unsold — creator only; call after close_auction.
 *
 * Mints up to `amount` unsold tokens back to the creator.
 * Also used in VOIDED state to reclaim full supply.
 */
export function withdrawUnsold(
  auction: AuctionView,
  amount:  bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  auction.programId,
    function: 'withdraw_unsold',
    inputs:   [auction.id, `${amount}u128`, auction.saleTokenId],
    fee,
    privateFee: false,
  };
}
