/**
 * Transaction builders for fairdrop_ref_v3.aleo transitions.
 */

import { PROGRAMS } from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

/**
 * create_code — creator registers a referral code for an auction.
 *
 * @param auctionId      Auction to attach the code to.
 * @param maxReferralBps Protocol cap (D11: ProtocolConfig.maxReferralBps).
 * @param fee            Transaction fee in microcredits (default 0.3 ALEO).
 */
export function createReferralCode(
  auctionId:      string,
  maxReferralBps: number,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.ref.programId,
    function: 'create_code',
    inputs:   [auctionId, `${maxReferralBps}u16`],
    fee,
    privateFee: false,
  };
}

/**
 * credit_commission — credits a referrer's earned commission for a specific bidder.
 *
 * @param codeId    Referral code field (on-chain identifier).
 * @param bidderKey BHP256(BidderKey { bidder, auction_id }) — computed off-chain.
 * @param fee       Transaction fee in microcredits (default 0.3 ALEO).
 */
export function creditCommission(
  codeId:    string,
  bidderKey: string,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.ref.programId,
    function: 'credit_commission',
    inputs:   [codeId, bidderKey],
    fee,
    privateFee: false,
  };
}

/**
 * setRefAllowedCaller — grant or revoke an auction program's CPI rights.
 *
 * Multisig-protected. Requires a pre-approved op_hash in fairdrop_multisig.
 *
 * @param programAddr Auction program address to grant/revoke.
 * @param allowed     true = grant, false = revoke.
 * @param opNonce     Nonce matching the pre-approved AllowedCallerOp in multisig.
 */
export function setRefAllowedCaller(
  programAddr: string,
  allowed:     boolean,
  opNonce:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.ref.programId,
    function: 'set_allowed_caller',
    inputs:   [programAddr, String(allowed), `${opNonce}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * claim_commission — transfers accumulated referral earnings to the referrer.
 *
 * @param codeRecord Raw ReferralCode record from the wallet.
 * @param amount     Amount to claim in microcredits (≤ accumulated balance).
 * @param fee        Transaction fee in microcredits (default 0.3 ALEO).
 */
export function claimCommission(
  codeRecord: string,
  amount:     bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.ref.programId,
    function: 'claim_commission',
    inputs:   [codeRecord, `${amount}u128`],
    fee,
    privateFee: false,
  };
}
