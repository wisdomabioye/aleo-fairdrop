/**
 * Handler registry and transition composition.
 *
 * This file knows:
 *   - Which programs exist (from @fairdrop/config)
 *   - Which transitions each type supports
 *   - Which concerns run on each transition (auction upsert, reputation, …)
 *
 * Adding a new concern (e.g. stats): import its handler here, wire it in onClose.
 * Adding a new auction type: one entry in the pairs array.
 */

import { PROGRAMS }               from '@fairdrop/config';
import { AuctionType }            from '@fairdrop/types/domain';
import { upsertAuction }          from './auction.js';
import { upsertCreatorReputation } from './reputation.js';
import { buildConfigHandlerMap }  from './config.js';
import {
  auctionIdFromCreateAuctionTransition,
  auctionIdFromTransitionInputOne,
  auctionIdFromTransitionInputZero,
  auctionIdFromFinalizeRevealBid,
} from './extractors.js';
import type { ProgramHandlerMap, TransitionHandlerFn } from './types.js';

// ── Transition composition ────────────────────────────────────────────────────

function createProgramHandlerMap(
  auctionType: string,
  programId:   string,
): ProgramHandlerMap {
  const onAuction: TransitionHandlerFn = async (ctx, auctionId) => {
    await upsertAuction(ctx, programId, auctionType, auctionId);
  };

  /**
   * close_auction: auction upsert + creator reputation.
   * update_reputation CPI only fires here — not on cancel_auction.
   * Add more concerns (stats, referral totals, …) here as needed.
   */
  const onClose: TransitionHandlerFn = async (ctx, auctionId) => {
    const config = await upsertAuction(ctx, programId, auctionType, auctionId);
    await upsertCreatorReputation(ctx, config.creator);
  };

  const base: ProgramHandlerMap = {
    create_auction:        { getAuctionId: auctionIdFromCreateAuctionTransition, handle: onAuction },
    close_auction:         { getAuctionId: auctionIdFromTransitionInputZero,     handle: onClose   },
    cancel_auction:        { getAuctionId: auctionIdFromTransitionInputZero,     handle: onAuction },
    place_bid_private:     { getAuctionId: auctionIdFromTransitionInputOne,      handle: onAuction },
    place_bid_public:      { getAuctionId: auctionIdFromTransitionInputZero,     handle: onAuction },
    place_bid_private_ref: { getAuctionId: auctionIdFromTransitionInputOne,      handle: onAuction },
    place_bid_public_ref:  { getAuctionId: auctionIdFromTransitionInputZero,     handle: onAuction },
  };

  if (auctionType === AuctionType.Sealed) {
    return {
      ...base,
      commit_bid_private:     { getAuctionId: auctionIdFromTransitionInputOne,  handle: onAuction },
      commit_bid_public:      { getAuctionId: auctionIdFromTransitionInputZero, handle: onAuction },
      commit_bid_private_ref: { getAuctionId: auctionIdFromTransitionInputOne,  handle: onAuction },
      commit_bid_public_ref:  { getAuctionId: auctionIdFromTransitionInputZero, handle: onAuction },
      reveal_bid:             { getAuctionId: auctionIdFromFinalizeRevealBid,   handle: onAuction },
    };
  }

  return base;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export type AuctionRegistry = Record<string, ProgramHandlerMap>;

export function buildAuctionRegistry(): AuctionRegistry {
  const pairs: Array<[AuctionType, string]> = [
    [AuctionType.Dutch,     PROGRAMS.dutch.programId],
    [AuctionType.Sealed,    PROGRAMS.sealed.programId],
    [AuctionType.Raise,     PROGRAMS.raise.programId],
    [AuctionType.Ascending, PROGRAMS.ascending.programId],
    [AuctionType.Lbp,       PROGRAMS.lbp.programId],
    [AuctionType.Quadratic, PROGRAMS.quadratic.programId],
  ];

  return {
    ...Object.fromEntries(
      pairs.map(([type, programId]) => [programId, createProgramHandlerMap(type, programId)]),
    ),
    [PROGRAMS.config.programId]: buildConfigHandlerMap(),
  };
}
