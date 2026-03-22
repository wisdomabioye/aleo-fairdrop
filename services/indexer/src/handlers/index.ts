/**
 * Handler registry — built at startup from @fairdrop/config PROGRAMS.
 *
 * Each auction program maps to a flat ProgramHandlerMap: transition name →
 * { getAuctionId, handle }. The processor dispatches blindly — no
 * auction-type–specific logic lives outside this file.
 *
 * Adding a new auction type: one entry in the pairs array below.
 */
import { PROGRAMS }                  from '@fairdrop/config';
import { AuctionType }               from '@fairdrop/types/domain';
import { createProgramHandlerMap }   from './auction.js';
import type { ProgramHandlerMap }    from './auction.js';

export type { TransitionContext }    from './types.js';
export type { ProgramHandlerMap, HandlerEntry, TransitionHandlerFn } from './auction.js';

// ── Registry ──────────────────────────────────────────────────────────────────

/** Maps programId → flat transition handler map. */
export type AuctionRegistry = Record<string, ProgramHandlerMap>;

/** Builds the registry at startup. Each entry is cheap (no I/O). */
export function buildAuctionRegistry(): AuctionRegistry {
  const pairs: Array<[AuctionType, string]> = [
    [AuctionType.Dutch,     PROGRAMS.dutch.programId],
    [AuctionType.Sealed,    PROGRAMS.sealed.programId],
    [AuctionType.Raise,     PROGRAMS.raise.programId],
    [AuctionType.Ascending, PROGRAMS.ascending.programId],
    [AuctionType.Lbp,       PROGRAMS.lbp.programId],
    [AuctionType.Quadratic, PROGRAMS.quadratic.programId],
  ];

  return Object.fromEntries(
    pairs.map(([type, programId]) => [programId, createProgramHandlerMap(type, programId)]),
  );
}
