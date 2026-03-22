import type { Db, DbTx }                                from '@fairdrop/database';
import type { AleoRpcClient }                           from '../client/rpc.js';
import type { AleoTransition, FinalizeOperation }       from '../types/aleo.js';

/** Passed to every transition handler. */
export interface TransitionContext {
  /** DbTx when called inside a block transaction; Db when called standalone. */
  db:          Db | DbTx;
  rpc:         AleoRpcClient;
  transition:  AleoTransition;
  blockHeight: number;
  timestamp:   Date;
  txId:        string;
}

/** Resolves an auction_id string from a transition and its finalize ops. Returns null if unresolvable. */
export type AuctionIdExtractor = (
  transition:  AleoTransition,
  finalizeOps: FinalizeOperation[],
) => string | null;

/** Executes business logic for a single transition. */
export type TransitionHandlerFn = (ctx: TransitionContext, auctionId: string) => Promise<void>;

/** Paired extractor + handler for a single transition name. */
export interface HandlerEntry {
  getAuctionId: AuctionIdExtractor;
  handle:       TransitionHandlerFn;
}

/** Flat map of transition name → handler entry for one program. Processor dispatches blindly. */
export type ProgramHandlerMap = Record<string, HandlerEntry>;
