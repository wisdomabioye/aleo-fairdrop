/**
 * Transaction builders for sealed-auction-specific transitions.
 *
 * Sealed auctions use a commit-reveal scheme instead of place_bid:
 *   1. commitBid*  — bidder locks collateral with a blinded commitment
 *   2. revealBid   — bidder reveals quantity + nonce; Bid record is issued
 *   3. slashUnrevealed — permissionless punishment for non-revealers
 *
 * quantity and nonce in commit/reveal are private inputs — they are ZK-proved
 * in the transition body but never appear in finalize or on the public ledger.
 */

import { PROGRAMS } from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

// ── Commit ────────────────────────────────────────────────────────────────────

/**
 * commit_bid_public — lock collateral with a public credits balance.
 *
 * @param auctionId     Sealed auction field ID.
 * @param quantity      Private: token quantity being bid (hidden in ZK proof).
 * @param nonce         Private: random blinding nonce (hidden in ZK proof).
 * @param paymentAmount Microcredits to lock as collateral (u64).
 */
export function commitBidPublic(
  auctionId:     string,
  quantity:      bigint,
  nonce:         string,  // field literal — random value kept secret until reveal
  paymentAmount: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'commit_bid_public',
    inputs:   [auctionId, `${quantity}u128`, nonce, `${paymentAmount}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * commit_bid_private — lock collateral from a private credits record.
 *
 * @param creditsRecord  Unspent credits.aleo record from the bidder's wallet.
 */
export function commitBidPrivate(
  creditsRecord: string | Record<string, unknown>,
  auctionId:     string,
  quantity:      bigint,
  nonce:         string,
  paymentAmount: bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'commit_bid_private',
    inputs:   [creditsRecord, auctionId, `${quantity}u128`, nonce, `${paymentAmount}u64`],
    fee,
    privateFee: false,
  };
}

/**
 * commit_bid_public_ref — public collateral with a referral code.
 */
export function commitBidPublicRef(
  auctionId:     string,
  quantity:      bigint,
  nonce:         string,
  paymentAmount: bigint,
  codeId:        string,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'commit_bid_public_ref',
    inputs:   [auctionId, `${quantity}u128`, nonce, `${paymentAmount}u64`, codeId],
    fee,
    privateFee: false,
  };
}

/**
 * commit_bid_private_ref — private collateral with a referral code.
 */
export function commitBidPrivateRef(
  creditsRecord: string | Record<string, unknown>,
  auctionId:     string,
  quantity:      bigint,
  nonce:         string,
  paymentAmount: bigint,
  codeId:        string,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'commit_bid_private_ref',
    inputs:   [creditsRecord, auctionId, `${quantity}u128`, nonce, `${paymentAmount}u64`, codeId],
    fee,
    privateFee: false,
  };
}

// ── Reveal ────────────────────────────────────────────────────────────────────

/**
 * reveal_bid — reveal the committed quantity and nonce after the commit phase ends.
 *
 * Issues a Bid record if the revealed commitment matches the on-chain hash.
 *
 * @param commitment    Commitment record from the bidder's wallet.
 * @param quantity      Same quantity used in commitBid (private — ZK-proved).
 * @param nonce         Same nonce used in commitBid (private — ZK-proved).
 * @param maxBidAmount  D11: config.max_bid_amount — finalize validates quantity ≤ this.
 */
export function revealBid(
  commitment:    string | Record<string, unknown>,
  quantity:      bigint,
  nonce:         string,
  maxBidAmount:  bigint,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'reveal_bid',
    inputs:   [commitment, `${quantity}u128`, nonce, `${maxBidAmount}u128`],
    fee,
    privateFee: false,
  };
}

/**
 * slash_unrevealed — permissionless; punishes a bidder who committed but never revealed.
 *
 * Forfeits the commitment collateral; caller receives slash_reward_bps% of it.
 *
 * @param commitmentKey  BHP256(BidderKey { bidder, auction_id }) — computed off-chain.
 * @param auctionId      Field of the sealed auction.
 * @param paymentAmount  Microcredits locked by the unrevealed commitment (from on-chain state).
 * @param slashRewardBps Snapshot from AuctionConfig (D11: config.slash_reward_bps).
 * @param fee            Transaction fee in microcredits (default 0.3 ALEO).
 */
export function slashUnrevealed(
  commitmentKey:  string,
  auctionId:      string,
  paymentAmount:  bigint,
  slashRewardBps: number,
  fee = DEFAULT_TX_FEE,
): TxSpec {
  return {
    program:  PROGRAMS.sealed.programId,
    function: 'slash_unrevealed',
    inputs:   [commitmentKey, auctionId, `${paymentAmount}u128`, `${slashRewardBps}u16`],
    fee,
    privateFee: false,
  };
}
