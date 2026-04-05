/**
 * Transaction builders for sealed-auction-specific transitions.
 */

import { PROGRAMS } from '@fairdrop/config';
import { DEFAULT_TX_FEE, type TxSpec } from './_types';

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
