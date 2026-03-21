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
import { createProgramHandlerMap }   from './auction.js';
import type { ProgramHandlerMap }    from './auction.js';

export type { TransitionContext }    from './types.js';
export type { ProgramHandlerMap, HandlerEntry, TransitionHandlerFn } from './auction.js';

// ── Registry ──────────────────────────────────────────────────────────────────

/** Maps programId → flat transition handler map. */
export type AuctionRegistry = Record<string, ProgramHandlerMap>;

/** Builds the registry at startup. Each entry is cheap (no I/O). */
export function buildAuctionRegistry(): AuctionRegistry {
  const pairs: Array<[string, string]> = [
    ['dutch',     PROGRAMS.dutch.programId],
    ['sealed',    PROGRAMS.sealed.programId],
    ['raise',     PROGRAMS.raise.programId],
    ['ascending', PROGRAMS.ascending.programId],
    ['lbp',       PROGRAMS.lbp.programId],
    ['quadratic', PROGRAMS.quadratic.programId],
  ];

  return Object.fromEntries(
    pairs.map(([type, programId]) => [programId, createProgramHandlerMap(type, programId)]),
  );
}
