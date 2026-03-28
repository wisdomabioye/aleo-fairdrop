/**
 * Auction ID extraction strategies.
 *
 * Each extractor resolves an auction_id from a transition + its finalize ops.
 * The processor calls the appropriate extractor per transition (configured in
 * createProgramHandlerMap).
 */
import type { AleoTransition, FinalizeOperation } from '../types/aleo.js';
import type { AuctionIdExtractor }                from './types.js';

/** auction_id is available in transaction */
export const auctionIdFromCreateAuctionTransition: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:         FinalizeOperation[],
): string | null => {
  const match = String(JSON.stringify(transition)).match(
    /auction_id:\s*([0-9]+field)/
  );
  const auctionId = match ? match[1] : null;
  return auctionId
};


/**
 * Get auction_id from Transition Input index zero.
 * This is applicable to close_auction, cancel_auction,
 * place_bid_public_ref, place_bid_public, commit_bid_public_ref
 * commit_bid_public
*/
export const auctionIdFromTransitionInputZero: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:         FinalizeOperation[],
): string | null => {
  return transition.inputs[0].value ?? null;
};

/**
 * Get auction_id from Transition Input index one (1).
 * This is applicable to place_bid_private, place_bid_private_ref,
 * commit_bid_private, commit_bid_private_ref, 
*/
export const auctionIdFromTransitionInputOne: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:         FinalizeOperation[],
): string | null => {
    return transition.inputs[1].value ?? null;
};

/**
 * Get auction_id from Transition Input index one (1).
 * This is applicable to place_bid_private, place_bid_private_ref,
 * commit_bid_private, commit_bid_private_ref, 
*/
export const auctionIdFromFinalizeRevealBid: AuctionIdExtractor = (
  transition: AleoTransition,
  _ops:         FinalizeOperation[],
): string | null => {
    /** Auction Id is not available in inputs array.
     * However, it is passed to finalize as the 1st argument in
     * transition outputs index 1
     */
    const output = transition.outputs[1]; // future output
    const match = String(output.value??"").match(
      /arguments\s*:\s*\[\s*([0-9]+field)/
    );

    const auctionId = match ? match[1] : null;
    return auctionId;
};



