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
import { upsertAuction, incrementBidCount, updateSqrtWeight } from './auction.js';
import { upsertCreatorReputation }          from './reputation.js';
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

  /** Bid transitions: upsert state + increment bid_count + update sqrt_weight (Quadratic only). */
  const onBid: TransitionHandlerFn = async (ctx, auctionId) => {
    await upsertAuction(ctx, programId, auctionType, auctionId);
    await incrementBidCount(ctx, auctionId);
    if (auctionType === AuctionType.Quadratic) {
      await updateSqrtWeight(ctx, auctionId, programId);
    }
  };

  /**
   * close_auction: auction upsert + creator reputation.
   * update_reputation CPI only fires here — not on cancel_auction.
   */
  const onClose: TransitionHandlerFn = async (ctx, auctionId) => {
    const config = await upsertAuction(ctx, programId, auctionType, auctionId);
    await upsertCreatorReputation(ctx, config.creator);
  };

  const base: ProgramHandlerMap = {
    create_auction:        { kind: 'auction', getAuctionId: auctionIdFromCreateAuctionTransition, handle: onAuction },
    close_auction:         { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero,     handle: onClose   },
    cancel_auction:        { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero,     handle: onAuction },
    place_bid_private:     { kind: 'auction', getAuctionId: auctionIdFromTransitionInputOne,      handle: onBid     },
    place_bid_public:      { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero,     handle: onBid     },
    place_bid_private_ref: { kind: 'auction', getAuctionId: auctionIdFromTransitionInputOne,      handle: onBid     },
    place_bid_public_ref:  { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero,     handle: onBid     },
  };

  if (auctionType === AuctionType.Sealed) {
    return {
      ...base,
      commit_bid_private:     { kind: 'auction', getAuctionId: auctionIdFromTransitionInputOne,  handle: onBid     },
      commit_bid_public:      { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero, handle: onBid     },
      commit_bid_private_ref: { kind: 'auction', getAuctionId: auctionIdFromTransitionInputOne,  handle: onBid     },
      commit_bid_public_ref:  { kind: 'auction', getAuctionId: auctionIdFromTransitionInputZero, handle: onBid     },
      reveal_bid:             { kind: 'auction', getAuctionId: auctionIdFromFinalizeRevealBid,   handle: onAuction },
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
